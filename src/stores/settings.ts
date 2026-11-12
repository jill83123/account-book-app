import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { uid } from '@/lib/id'
import type { ArchivedReminder, SeenReminder } from '@/lib/reminders'
import { themeById } from '@/lib/themes'

export interface LocalSettings {
  theme: 'system' | 'light' | 'dark'
  /** accent colour, an id from lib/themes */
  themeColor: string
  /** which colour set the saved categories were last updated to (see lib/palette) */
  palette: number
  /** set once the 其他 categories have been moved to the end of their lists */
  otherLast: boolean
  /** set once the starter ledger has been given its own colour */
  ledgerTeal: boolean
  /** set once the starter income categories have been put into groups */
  incomeGroups: boolean
  /** set once 利息收入 has been lifted out of 投資收益 */
  incomeInterest: boolean
  /** Cloudflare Worker that holds the Google client secret */
  workerUrl: string
  spreadsheetId: string
  /** the Drive folder the spreadsheet was put in ('none' when it was already somewhere else) */
  folderId: string
  lastSyncAt: number
  geminiKey: string
  geminiModel: string
  /** how a scanned receipt is written down */
  scanMode: 'split' | 'merge'
  /** this device gets the reminders as push notifications, even when the app is closed */
  remindEnabled: boolean
  /** HH:mm */
  remindTime: string
  /** when remindTime was last changed on any device (the newest change wins when devices sync) */
  remindTimeAt: number
  /** tells this device apart from the others that share the spreadsheet */
  deviceId: string
  /** another device has the daily reminder on (learned at the last sync) */
  remindOnElsewhere: boolean
  /** the "turn it on here too" card was closed */
  remindHintDismissed: boolean
  /** reports spread amortized expenses over their months */
  amortize: boolean
  ledgerId: string
  /** the account used for the next new record */
  lastAccountId: string
  /** the drag-to-reorder hint has been shown once */
  tipDrag: boolean
  /** reminders that were open last time, so we notice when one ends */
  reminderSeen: Record<string, SeenReminder>
  /** ended or archived reminders, kept for 30 days */
  reminderArchive: ArchivedReminder[]
  /** reminders archived by hand while still open */
  reminderHidden: string[]
  /** a first sync should drop the starter data when the sheet already has data */
  seeded: boolean
  /** the version of the starter-category refresh that has run (see seed.ts) */
  catRefresh: number
}

const KEY = 'ab.settings'

let saving = true
/** After the storage has been wiped on purpose, stop the open page from writing its old settings back. */
export function stopSavingSettings() {
  saving = false
}
/** the Gemini model scanning starts with; Google retires old ones, so this moves forward over time */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

const defaults: LocalSettings = {
  theme: 'system',
  themeColor: 'blue',
  palette: 0,
  otherLast: false,
  ledgerTeal: false,
  incomeGroups: false,
  incomeInterest: false,
  workerUrl: '',
  spreadsheetId: '',
  folderId: '',
  lastSyncAt: 0,
  geminiKey: '',
  geminiModel: DEFAULT_GEMINI_MODEL,
  scanMode: 'split',
  remindEnabled: false,
  remindTime: '21:00',
  remindTimeAt: 0,
  deviceId: '',
  remindOnElsewhere: false,
  remindHintDismissed: false,
  amortize: true,
  ledgerId: '',
  lastAccountId: '',
  tipDrag: false,
  reminderSeen: {},
  reminderArchive: [],
  reminderHidden: [],
  seeded: false,
  catRefresh: 0,
}

function read(): LocalSettings {
  try {
    const saved = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as LocalSettings
    // Google retired the old default for new keys, so a saved retired default moves to the current one
    // (and 3.8 Flash was too slow for reading a receipt)
    if (!saved.geminiModel.trim() || ['gemini-2.5-flash', 'gemini-3.8-flash'].includes(saved.geminiModel)) saved.geminiModel = DEFAULT_GEMINI_MODEL
    return saved
  } catch {
    return { ...defaults }
  }
}

export const useSettings = defineStore('settings', () => {
  const s = reactive<LocalSettings>(read())
  if (!s.deviceId) s.deviceId = uid()

  watch(
    s,
    () => {
      if (!saving) return
      try {
        localStorage.setItem(KEY, JSON.stringify(s))
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  )

  const media = matchMedia('(prefers-color-scheme: dark)')
  function applyTheme() {
    const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches)
    document.documentElement.classList.toggle('dark', dark)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#1f2124' : '#fafafa')
  }
  watch(() => s.theme, applyTheme, { immediate: true })
  media.addEventListener('change', applyTheme)

  watch(
    () => s.themeColor,
    (id) => document.documentElement.style.setProperty('--primary', themeById(id).color),
    { immediate: true },
  )

  return { s }
})
