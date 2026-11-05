import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { buildReminders, syncArchive, type ArchivedReminder, type Reminder } from '@/lib/reminders'
import { useData } from './data'
import { useSettings } from './settings'

/** What needs attention now, plus the finished reminders kept for a while. */
export const useReminders = defineStore('reminders', () => {
  const data = useData()
  const { s } = useSettings()

  const all = computed(() =>
    buildReminders({
      records: data.records,
      recurrings: data.recurrings,
      accounts: data.accounts,
      loans: data.loans,
      memberName: data.memberName,
      remindEnabled: s.remindEnabled,
      remindTime: s.remindTime,
    }),
  )

  /** open reminders, minus the ones archived by hand */
  const list = computed(() => all.value.filter((r) => !s.reminderHidden.includes(r.key)))
  const archive = computed(() => [...s.reminderArchive].sort((a, b) => b.endedAt - a.endedAt))

  // not before the data has loaded, or every reminder would look as if it had ended
  watch(
    [all, () => data.ready],
    () => {
      if (data.ready) syncArchive(all.value, s)
    },
    { immediate: true },
  )

  function archiveNow(r: Reminder) {
    s.reminderHidden.push(r.key)
    s.reminderArchive.unshift({
      key: r.key,
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      amount: r.amount,
      link: r.link,
      endedAt: Date.now(),
      how: 'archived',
    })
  }

  function forget(endedAt: number, key: string) {
    s.reminderArchive = s.reminderArchive.filter((a) => !(a.endedAt === endedAt && a.key === key))
  }

  /** Put an archived reminder back among the open ones (when it is still open, it shows up again). */
  function restore(a: ArchivedReminder) {
    s.reminderHidden = s.reminderHidden.filter((k) => k !== a.key)
    forget(a.endedAt, a.key)
  }

  return { all, list, archive, archiveNow, forget, restore }
})
