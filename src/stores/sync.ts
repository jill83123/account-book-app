import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CHANGE_EVENT, lastLocalChange } from '@/db'
import {
  cachedToken,
  clearToken,
  hasRefreshToken,
  preloadGis,
  refreshAccessToken,
  requestToken,
  revokeToken,
  setWorkerUrl,
} from '@/lib/google/gis'
import { findFolder, listImageFiles, listSpreadsheets, SheetsAuthError, trashFile } from '@/lib/google/sheets'
import { runSync } from '@/lib/google/syncEngine'
import { autoPostDue } from '@/lib/recurrence'
import { useSettings } from './settings'
import { useUi } from './ui'

/** after the last change, wait this long before syncing, so a run of edits becomes one sync */
const AUTO_DELAY_MS = 15_000
/** coming back to the app: skip the sync if one ran within this long */
const CATCH_UP_MS = 60_000
/** opening a record to edit it: skip the sync if one ran within this long */
const STALE_MS = 120_000
/** away from the app this long: another device may have changed things, so catch up before anything is edited */
const IDLE_MS = 180_000
/** the longest the screen is held while catching up */
const CATCH_UP_WAIT_MS = 10_000

export const useSync = defineStore('sync', () => {
  const settings = useSettings()
  const ui = useUi()

  const syncing = ref(false)
  /** true while the app catches up after a long absence; the screen is held so nothing is edited on old data */
  const catchingUp = ref(false)
  const error = ref('')
  const signedIn = ref(hasRefreshToken() || Boolean(cachedToken()))
  const url = ref('')
  const tick = ref(0)

  /** changes made on this device that the sheet has not seen yet */
  const unsynced = computed(() => {
    void tick.value
    return lastLocalChange() > settings.s.lastSyncAt
  })

  async function accessToken(): Promise<string> {
    const cached = cachedToken()
    if (cached) return cached
    const fresh = await refreshAccessToken()
    if (fresh) return fresh
    signedIn.value = false
    throw new SheetsAuthError('尚未登入 Google，請到同步頁登入')
  }

  /** Must be called straight from a click: it opens Google's popup. */
  async function connect(selectAccount = false) {
    setWorkerUrl(settings.s.workerUrl)
    await requestToken(selectAccount)
    signedIn.value = true
    error.value = ''
  }

  async function disconnect() {
    await revokeToken()
    signedIn.value = false
    settings.s.spreadsheetId = ''
    settings.s.folderId = ''
    settings.s.lastSyncAt = 0
    url.value = ''
  }

  /** Move this app's spreadsheets, photos and folder in Google Drive to the trash. */
  async function wipeCloud() {
    const token = await accessToken()
    const ids = new Set(await listSpreadsheets(token))
    if (settings.s.spreadsheetId) ids.add(settings.s.spreadsheetId)
    for (const id of (await listImageFiles(token)).values()) ids.add(id.fileId)
    const folder = settings.s.folderId && settings.s.folderId !== 'none' ? settings.s.folderId : await findFolder(token)
    if (folder) ids.add(folder)
    for (const id of ids) await trashFile(token, id)
  }

  let running: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Sync now. Resolves true on success; errors land in `error` (and a toast when `loud`). */
  function sync(opts: { loud?: boolean; forceViews?: boolean } = {}): Promise<boolean> {
    running ??= (async () => {
      syncing.value = true
      error.value = ''
      const started = Date.now()
      try {
        setWorkerUrl(settings.s.workerUrl)
        const attempt = () =>
          runSync({
            getToken: accessToken,
            spreadsheetId: settings.s.spreadsheetId,
            folderId: settings.s.folderId,
            amortize: settings.s.amortize,
            forceViews: opts.forceViews,
            dropSeed: settings.s.seeded,
            reminder: {
              deviceId: settings.s.deviceId,
              time: settings.s.remindTime,
              timeAt: settings.s.remindTimeAt,
              on: settings.s.remindEnabled,
            },
          })
        let res
        try {
          res = await attempt()
        } catch (e) {
          if (!(e instanceof SheetsAuthError) || !hasRefreshToken()) throw e
          clearToken()
          res = await attempt()
        }
        settings.s.spreadsheetId = res.spreadsheetId
        settings.s.folderId = res.folderId
        settings.s.seeded = false
        if (res.reminder) {
          settings.s.remindTime = res.reminder.time
          settings.s.remindTimeAt = res.reminder.timeAt
          settings.s.remindOnElsewhere = res.reminder.onElsewhere
        }
        url.value = res.url
        settings.s.lastSyncAt = Math.max(started, lastLocalChange())
        // pulled data may carry recurring rules that came due
        await autoPostDue()
        if (opts.loud) ui.toast(res.pulled ? `已同步，取得 ${res.pulled} 筆更新` : '已同步', 'success')
        return true
      } catch (e) {
        if (e instanceof SheetsAuthError) signedIn.value = hasRefreshToken()
        error.value = e instanceof Error ? e.message : String(e)
        if (opts.loud) ui.toast(error.value, 'error')
        return false
      } finally {
        syncing.value = false
        tick.value++
        running = null
      }
    })()
    return running
  }

  function canAuto() {
    return (
      signedIn.value &&
      Boolean(settings.s.workerUrl) &&
      navigator.onLine &&
      !error.value.includes('登入')
    )
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      // nothing goes out while the app is in the background; coming back syncs
      if (document.visibilityState === 'visible' && canAuto()) void sync()
    }, AUTO_DELAY_MS)
  }

  /** synced recently enough that going to the sheet again would only repeat the same reads */
  const fresh = (ms: number) => !unsynced.value && Date.now() - settings.s.lastSyncAt < ms

  /**
   * Quietly bring this device up to date before something is edited, so it starts from the newest copy. Skipped when
   * a sync just ran, and never holds the caller for longer than `waitMs`: on a slow network the edit goes ahead.
   */
  async function refresh(maxAgeMs = STALE_MS, waitMs = 3000) {
    // an edit made here a moment ago means the user is busy on this device, so a pull before the next edit is not needed
    if (!canAuto() || Date.now() - Math.max(settings.s.lastSyncAt, lastLocalChange()) < maxAgeMs) return
    // no full screen cover here: the caller handles a newer copy arriving late (form reload, or a toast once touched)
    await Promise.race([sync(), new Promise((r) => setTimeout(r, waitMs))])
  }

  function init() {
    preloadGis()
    window.addEventListener(CHANGE_EVENT, () => {
      tick.value++
      if (canAuto()) schedule()
    })
    // coming back to the tab or the network returning is not worth a round trip when a sync only just ran
    let hiddenAt = 0
    const catchUp = async () => {
      if (document.visibilityState !== 'visible' || !canAuto()) return
      if (hiddenAt && Date.now() - hiddenAt >= IDLE_MS) {
        hiddenAt = 0
        catchingUp.value = true
        try {
          await Promise.race([sync(), new Promise((r) => setTimeout(r, CATCH_UP_WAIT_MS))])
        } finally {
          catchingUp.value = false
        }
        return
      }
      hiddenAt = 0
      if (!fresh(CATCH_UP_MS)) void sync()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else void catchUp()
    })
    window.addEventListener('online', () => void catchUp())
    void catchUp()
  }

  return { syncing, catchingUp, error, signedIn, unsynced, url, connect, disconnect, wipeCloud, sync, refresh, init }
})
