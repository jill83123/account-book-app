import type { Account, Loan, Rec, Recurring } from '@/db/types'
import { cardCycles, loanOutstanding, nextDayOfMonth, spendOn } from './calc'
import { addDays, daysBetween, nowTime, today } from './date'
import { nextDue, pendingOccurrences, type Pending } from './recurrence'

export type ReminderKind = 'daily' | 'pending' | 'upcoming' | 'card' | 'loan'

export interface Reminder {
  key: string
  kind: ReminderKind
  title: string
  detail: string
  amount?: number
  /** how urgent: lower sorts first */
  rank: number
  pending?: Pending
  link?: string
}

/** How long a finished reminder stays in the archive. */
export const ARCHIVE_DAYS = 30

/** What is kept of a reminder once it is over. */
export interface ArchivedReminder {
  key: string
  kind: ReminderKind
  title: string
  detail: string
  amount?: number
  link?: string
  /** ms timestamp */
  endedAt: number
  /** ended on its own (handled, paid, repaid) or archived by hand */
  how: 'ended' | 'archived'
}

export type SeenReminder = Pick<Reminder, 'key' | 'kind' | 'title' | 'detail' | 'amount' | 'link'>

/** The kinds worth keeping a record of. A daily nudge or an upcoming heads-up simply goes away. */
const TRACKED: ReminderKind[] = ['pending', 'card', 'loan']

export interface ArchiveState {
  reminderSeen: Record<string, SeenReminder>
  reminderArchive: ArchivedReminder[]
  reminderHidden: string[]
}

/**
 * Move reminders that have ended into the archive, and forget archived ones after ARCHIVE_DAYS.
 * A reminder is seen while it is open; when it is no longer there it has ended. Edits the state in place.
 */
export function syncArchive(current: Reminder[], st: ArchiveState, now = Date.now()) {
  const open = new Set(current.map((r) => r.key))
  for (const [key, seen] of Object.entries(st.reminderSeen)) {
    if (open.has(key)) continue
    delete st.reminderSeen[key]
    // one that was archived by hand is already in the archive
    if (st.reminderHidden.includes(key)) continue
    st.reminderArchive.unshift({ ...seen, endedAt: now, how: 'ended' })
  }
  for (const r of current) {
    if (!TRACKED.includes(r.kind)) continue
    st.reminderSeen[r.key] = { key: r.key, kind: r.kind, title: r.title, detail: r.detail, amount: r.amount, link: r.link }
  }
  st.reminderHidden = st.reminderHidden.filter((k) => open.has(k))
  const cutoff = now - ARCHIVE_DAYS * 86400000
  st.reminderArchive = st.reminderArchive.filter((a) => a.endedAt >= cutoff)
}

/** Days an archived reminder is still kept. */
export const daysLeft = (a: ArchivedReminder, now = Date.now()) =>
  Math.max(0, Math.ceil((a.endedAt + ARCHIVE_DAYS * 86400000 - now) / 86400000))

const WITHIN = 7

export function whenLabel(date: string): string {
  const n = daysBetween(today(), date)
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n < 0) return `已過 ${-n} 天`
  return `${n} 天後`
}

export function buildReminders(input: {
  records: Rec[]
  recurrings: Recurring[]
  accounts: Account[]
  loans: Loan[]
  /** a member's name */
  memberName: (id: string) => string
  remindEnabled: boolean
  remindTime: string
}): Reminder[] {
  const out: Reminder[] = []
  const day = today()

  if (input.remindEnabled && nowTime() >= input.remindTime && !input.records.some((r) => r.date === day)) {
    out.push({
      key: 'daily',
      kind: 'daily',
      title: '今天還沒有記帳',
      detail: `每日提醒 ${input.remindTime}`,
      rank: 0,
      link: '/record/new',
    })
  }

  for (const p of pendingOccurrences(input.recurrings)) {
    out.push({
      key: `pending-${p.rule.id}-${p.n}`,
      kind: 'pending',
      title: p.rule.name,
      detail: `${p.date}　${p.rule.kind === 'installment' ? '分期' : '週期'}交易待確認`,
      amount: p.rule.installment
        ? Math.round(p.rule.installment.total / p.rule.installment.periods) + p.rule.installment.fee
        : p.rule.template.lines.reduce((s, l) => s + l.amount, 0),
      rank: 1,
      pending: p,
    })
  }

  for (const r of input.recurrings) {
    const d = nextDue(r)
    if (!d || d <= day || d > addDays(day, WITHIN)) continue
    out.push({
      key: `up-${r.id}`,
      kind: 'upcoming',
      title: r.name,
      detail: `${whenLabel(d)}（${d}）${r.autoPost ? '自動入帳' : '需要確認'}`,
      rank: 3,
    })
  }

  for (const a of input.accounts) {
    if (a.kind !== 'card' || !a.dueDay || !a.statementDay || a.archived) continue
    const due = nextDayOfMonth(a.dueDay, day)
    if (daysBetween(day, due) > WITHIN) continue
    const cy = cardCycles(a.statementDay, day)
    const owed = spendOn(a.id, input.records, cy.prev.start, cy.prev.end)
    if (owed <= 0) continue
    out.push({
      key: `card-${a.id}`,
      kind: 'card',
      title: `${a.name}繳款`,
      detail: `${whenLabel(due)}（${due}）上期帳單`,
      amount: owed,
      rank: 2,
      link: `/account/${a.id}`,
    })
  }

  for (const l of input.loans) {
    const left = loanOutstanding(l)
    if (left <= 0 || !l.dueDate || l.dueDate > addDays(day, WITHIN)) continue
    out.push({
      key: `loan-${l.id}`,
      kind: 'loan',
      title: l.direction === 'lend' ? `向${input.memberName(l.personId)}收款` : `還款給 ${input.memberName(l.personId)}`,
      detail: `${whenLabel(l.dueDate)}（${l.dueDate}）`,
      amount: left,
      rank: l.dueDate < day ? 1 : 2,
      link: `/more/loans?open=${l.id}`,
    })
  }

  return out.sort((a, b) => a.rank - b.rank)
}

/** Show a system notification when the app is open past the reminder time. Needs permission. */
export async function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) await reg.showNotification(title, { body, icon: './icon.svg', tag: 'daily' })
  else new Notification(title, { body, icon: './icon.svg' })
  return true
}
