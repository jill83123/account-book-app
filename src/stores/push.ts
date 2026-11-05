import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { pushSlots } from '@/lib/pushSlots'
import {
  currentSubscription,
  pushSupported,
  sendTestPush,
  subscribePush,
  unsubscribePush,
  uploadSlots,
} from '@/lib/push'
import { useData } from './data'
import { useSettings } from './settings'

/** After the last change, wait this long before telling the Worker (it counts KV writes). */
const UPLOAD_DELAY_MS = 15_000
/** Upload again at least this often so the Worker keeps the record and the two weeks ahead stay planned. */
const REFRESH_MS = 12 * 60 * 60 * 1000

/** Background reminders: the plan for the next days is kept up to date on the Worker. */
export const usePush = defineStore('push', () => {
  const { s } = useSettings()
  const data = useData()
  const busy = ref(false)
  const error = ref('')
  const supported = pushSupported()

  let lastSignature = ''
  let lastUpload = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function plan() {
    return pushSlots({
      now: Date.now(),
      time: s.remindTime,
      daily: s.remindEnabled,
      records: data.records,
      accounts: data.accounts,
      loans: data.loans,
      recurrings: data.recurrings,
    })
  }

  /** Send the plan to the Worker unless nothing changed since the last time. */
  async function upload(force = false, keepalive = false) {
    clearTimeout(timer)
    if (!s.pushEnabled || !data.ready || !navigator.onLine) return
    const sub = await currentSubscription()
    if (!sub) return
    const planned = plan()
    const signature = JSON.stringify(planned)
    if (!force && signature === lastSignature && Date.now() - lastUpload < REFRESH_MS) return
    try {
      await uploadSlots(s.workerUrl, sub, planned, keepalive)
      lastSignature = signature
      lastUpload = Date.now()
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  function later() {
    clearTimeout(timer)
    timer = setTimeout(() => void upload().catch(() => {}), UPLOAD_DELAY_MS)
  }

  async function enable() {
    busy.value = true
    try {
      await subscribePush(s.workerUrl)
      s.pushEnabled = true
      await upload(true)
    } catch (e) {
      s.pushEnabled = false
      await unsubscribePush(s.workerUrl).catch(() => {})
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      busy.value = false
    }
  }

  async function disable() {
    busy.value = true
    clearTimeout(timer)
    s.pushEnabled = false
    try {
      await unsubscribePush(s.workerUrl)
      error.value = ''
    } finally {
      busy.value = false
    }
  }

  /** Upload right away and ask the Worker to push a test notification. */
  async function test() {
    busy.value = true
    try {
      await upload(true)
      const sub = await currentSubscription()
      if (!sub) throw new Error('這台裝置沒有推播訂閱，請關閉再重新開啟背景推播')
      await sendTestPush(s.workerUrl, sub)
    } finally {
      busy.value = false
    }
  }

  let started = false
  function init() {
    if (started || !supported) return
    started = true
    // the plan follows the records, loans, cards and rules, so any change replans it
    watch(
      [
        () => data.records,
        () => data.loans,
        () => data.accounts,
        () => data.recurrings,
        () => s.remindTime,
        () => s.remindEnabled,
        () => s.pushEnabled,
      ],
      later,
    )
    document.addEventListener('visibilitychange', () => {
      // leaving the app is the moment to send the latest plan at once
      if (document.visibilityState === 'hidden') void upload(false, true).catch(() => {})
      else later()
    })
    later()
  }

  return { supported, busy, error, init, enable, disable, test }
})
