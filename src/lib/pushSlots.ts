import type { Account, Loan, Rec, Recurring } from '@/db/types'
import { cardCycles, loanOutstanding, nextDayOfMonth, spendOn } from './calc'
import { addDays, parse, today } from './date'
import type { PushSlot } from './push'
import { nextDue, pendingOccurrences } from './recurrence'

/** How many days ahead the Worker is told about (it holds at most this many slots). */
export const DAYS_AHEAD = 14
/** A slot this long past its time is still sent along: the Worker may not have run its check yet. */
const LATE_MS = 10 * 60 * 1000
const DAILY_TEXT = '今天還沒有記帳，花一分鐘把今天的消費記下來吧'

/** Epoch ms of a local date and HH:mm. */
function at(day: string, time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const d = parse(day)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/**
 * The notifications to send over the next two weeks, one per day at the reminder time.
 * Only counts and generic wording go to the Worker: no names, amounts or categories.
 */
export function pushSlots(input: {
  now: number
  time: string
  daily: boolean
  records: Rec[]
  accounts: Account[]
  loans: Loan[]
  recurrings: Recurring[]
}): PushSlot[] {
  const first = today()
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(first, i))
  const parts = new Map<string, string[]>(days.map((d) => [d, []]))
  const add = (day: string, text: string) => parts.get(day)?.push(text)

  const dailyDays = new Set<string>()
  if (input.daily) {
    const recorded = input.records.some((r) => r.date === first && !r.deleted)
    for (const d of days) {
      if (d !== first || !recorded) {
        add(d, DAILY_TEXT)
        dailyDays.add(d)
      }
    }
  }

  // recurring entries waiting for a yes, and the ones that fall due in the next days
  const waiting = pendingOccurrences(input.recurrings).length
  if (waiting) add(first, `有 ${waiting} 筆週期交易待確認`)
  for (const r of input.recurrings) {
    const d = nextDue(r)
    if (d && !r.autoPost && d > first) add(d, '有週期交易需要確認')
  }

  for (const a of input.accounts) {
    if (a.kind !== 'card' || !a.dueDay || !a.statementDay || a.archived) continue
    const due = nextDayOfMonth(a.dueDay, first)
    if (!parts.has(due)) continue
    const cy = cardCycles(a.statementDay, first)
    if (spendOn(a.id, input.records, cy.prev.start, cy.prev.end) > 0) add(due, '今天是信用卡繳款日')
  }

  let overdue = 0
  for (const l of input.loans) {
    if (l.deleted || loanOutstanding(l) <= 0 || !l.dueDate) continue
    if (l.dueDate < first) overdue++
    else add(l.dueDate, '有借款今天到期')
  }
  if (overdue) add(first, `有 ${overdue} 筆借款已逾期`)

  const out: PushSlot[] = []
  for (const d of days) {
    const list = [...new Set(parts.get(d))]
    const t = at(d, input.time)
    if (!list.length || t < input.now - LATE_MS) continue
    const slot: PushSlot = { t, title: '記帳本', body: list.join('、') }
    // the Worker drops the daily wording when another device has recorded that day by then
    if (dailyDays.has(d)) {
      slot.day = d
      slot.rest = list.filter((x) => x !== DAILY_TEXT).join('、')
    }
    out.push(slot)
  }
  return out
}
