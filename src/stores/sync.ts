import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CHANGE_EVENT, lastLocalChange } from '@/db'
import {
  cachedToken,
  clearToken,
  hasLegacyAccess,
  hasRefreshToken,
  preloadGis,
  refreshAccessToken,
  requestToken,
  revokeToken,
  setWorkerUrl,
} from '@/lib/google/gis'
import { deleteAllAppFiles, DriveAuthError } from '@/lib/google/drive'
import { listLegacyFiles, trashFile } from '@/lib/google/legacy'
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
    throw new DriveAuthError('尚未登入 Google，請到「同步」頁登入')
  }

  /** Must be called straight from a click: it opens Google's popup. */
  async function connect(selectAccount = false) {
    setWorkerUrl(settings.s.workerUrl)
    // an older version's spreadsheet can only be read with its permission, so ask for it while there is still one to carry over
    await requestToken(selectAccount, Boolean(settings.s.spreadsheetId))
    signedIn.value = true
    error.value = ''
  }

  async function disconnect() {
    await revokeToken()
    signedIn.value = false
    settings.s.syncFileId = ''
    settings.s.lastSyncAt = 0
  }

  /** Delete the data and photos this app keeps in Google Drive; an older version's spreadsheet goes to the trash. */
  async function wipeCloud() {
    const token = await accessToken()
    await deleteAllAppFiles(token)
    if (hasLegacyAccess()) for (const id of await listLegacyFiles(token)) await trashFile(token, id)
    settings.s.syncFileId = ''
    settings.s.spreadsheetId = ''
  }

  let running: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Sync now. Resolves true on success; errors land in `error` (and a toast when `loud`). */
  function sync(opts: { loud?: boolean } = {}): Promise<boolean> {
    running ??= (async () => {
      syncing.value = true
      error.value = ''
      const started = Date.now()
      try {
        setWorkerUrl(settings.s.workerUrl)
        const attempt = () =>
          runSync({
            getToken: accessToken,
            fileId: settings.s.syncFileId,
            legacySheetId: settings.s.spreadsheetId,
            legacyAccess: hasLegacyAccess(),
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
          if (!(e instanceof DriveAuthError) || !hasRefreshToken()) throw e
          clearToken()
          res = await attempt()
        }
        settings.s.syncFileId = res.fileId
        // carried over (or there was nothing to carry): the old spreadsheet is not looked at again
        settings.s.spreadsheetId = ''
        settings.s.seeded = false
        if (res.reminder) {
          settings.s.remindTime = res.reminder.time
          settings.s.remindTimeAt = res.reminder.timeAt
          settings.s.remindOnElsewhere = res.reminder.onElsewhere
        }
        settings.s.lastSyncAt = Math.max(started, lastLocalChange())
        // pulled data may carry recurring rules that came due
        await autoPostDue()
        if (opts.loud) ui.toast(res.pulled ? `已同步，取得 ${res.pulled} 筆更新` : '已同步', 'success')
        return true
      } catch (e) {
        if (e instanceof DriveAuthError) signedIn.value = hasRefreshToken()
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

  return { syncing, catchingUp, error, signedIn, unsynced, connect, disconnect, wipeCloud, sync, refresh, init }
})
