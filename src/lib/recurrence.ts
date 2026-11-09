import { db, markLocalChange, stamp } from '@/db'
import type { Freq, Line, Rec, Recurring } from '@/db/types'
import { addDays, addMonths, nowTime, parse, today } from './date'
import { uid } from './id'
import { splitEven } from './money'

export const FREQ_LABEL: Record<Freq, string> = {
  daily: '每天',
  weekly: '每週',
  monthly: '每月',
  yearly: '每年',
}

export function repeatLabel(r: Pick<Recurring, 'freq' | 'interval'>): string {
  const unit = { daily: '天', weekly: '週', monthly: '個月', yearly: '年' }[r.freq]
  return r.interval === 1 ? FREQ_LABEL[r.freq] : `每 ${r.interval} ${unit}`
}

/** Date of occurrence number `n` (0 is the first). Counting from the start date avoids day-of-month drift. */
export function occurrenceDate(
  r: Pick<Recurring, 'startDate' | 'freq' | 'interval'>,
  n: number,
): string {
  const k = n * r.interval
  switch (r.freq) {
    case 'daily':
      return addDays(r.startDate, k)
    case 'weekly':
      return addDays(r.startDate, 7 * k)
    case 'monthly':
      return addMonths(r.startDate, k, parse(r.startDate).getDate())
    case 'yearly':
      return addMonths(r.startDate, 12 * k, parse(r.startDate).getDate())
  }
}

/** Date of the next occurrence, or null once the rule is finished or paused. */
export function nextDue(r: Recurring): string | null {
  if (!r.active) return null
  if (r.count != null && r.generated >= r.count) return null
  const d = occurrenceDate(r, r.generated)
  if (r.endDate && d > r.endDate) return null
  return d
}

/** an item's name as shown: an installment adds which period it is */
export const lineName = (l: Pick<Line, 'name' | 'period'>) =>
  l.period && l.name ? `${l.name} (${l.period.n}/${l.period.of})` : l.name

/**
 * Records made by an installment plan used to carry the period inside their name (手機分期 (3/12)):
 * move it into the item's own field so the way it is written can change.
 */
export async function splitInstallmentPeriods(): Promise<void> {
  const plans = new Set((await db.recurrings.filter((r) => !r.deleted && Boolean(r.installment)).toArray()).map((r) => r.id))
  if (!plans.size) return
  const pattern = /^(.*?)\s*[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]$/
  const rows = await db.records.filter((r) => !r.deleted && Boolean(r.recurringId && plans.has(r.recurringId))).toArray()
  const fixed: Rec[] = []
  for (const r of rows) {
    let changed = false
    const lines = r.lines.map((l) => {
      const m = l.period ? null : pattern.exec(l.name)
      if (!m) return l
      changed = true
      return { ...l, name: m[1]!, period: { n: Number(m[2]), of: Number(m[3]) } }
    })
    if (changed) fixed.push({ ...r, lines, updatedAt: stamp() })
  }
  if (!fixed.length) return
  await db.records.bulkPut(fixed)
  markLocalChange()
}

export function isFinished(r: Recurring): boolean {
  if (r.count != null && r.generated >= r.count) return true
  const d = occurrenceDate(r, r.generated)
  return Boolean(r.endDate && d > r.endDate)
}

/** Build the record for occurrence `n`. The id is derived from the rule so two devices never duplicate it. */
export function buildRecord(r: Recurring, n: number): Rec {
  const t = r.template
  let lines: Line[]
  if (r.installment) {
    const { total, periods, fee } = r.installment
    const base = t.lines[0]!
    lines = [
      {
        id: uid(),
        name: r.name,
        period: { n: n + 1, of: periods },
        categoryId: base.categoryId,
        amount: splitEven(total, periods)[n] ?? 0,
      },
    ]
    if (fee > 0) {
      lines.push({ id: uid(), name: `${r.name} 分期手續費`, categoryId: base.categoryId, amount: fee })
    }
  } else {
    lines = t.lines.map((l) => ({ ...l, id: uid() }))
  }
  const total =
    t.type === 'transfer' ? (t.lines[0]?.amount ?? 0) : lines.reduce((s, l) => s + l.amount, 0)
  return {
    id: `rc-${r.id}-${n}`,
    type: t.type,
    date: occurrenceDate(r, n),
    time: nowTime(),
    ledgerId: t.ledgerId,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    merchantId: t.merchantId,
    lines: t.type === 'transfer' ? [] : lines,
    total,
    note: t.note,
    recurringId: r.id,
    updatedAt: 0,
  }
}

/** Post every occurrence of the auto-posting rules that has come due. Returns how many records were added. */
export async function autoPostDue(): Promise<number> {
  const day = today()
  const rules = await db.recurrings.filter((r) => !r.deleted && r.active && r.autoPost).toArray()
  const newRecords: Rec[] = []
  const changed: Recurring[] = []
  for (const rule of rules) {
    let moved = false
    for (let guard = 0; guard < 400; guard++) {
      const d = nextDue(rule)
      if (!d || d > day) break
      const rec = buildRecord(rule, rule.generated)
      // a record that exists (even deleted) must not come back
      if (!(await db.records.get(rec.id))) newRecords.push(rec)
      rule.generated++
      moved = true
    }
    if (moved) changed.push(rule)
  }
  if (!newRecords.length && !changed.length) return 0
  await db.transaction('rw', db.records, db.recurrings, async () => {
    await db.records.bulkPut(newRecords.map((r) => ({ ...r, updatedAt: stamp() })))
    await db.recurrings.bulkPut(changed.map((r) => ({ ...r, updatedAt: stamp() })))
  })
  markLocalChange()
  return newRecords.length
}

export interface Pending {
  rule: Recurring
  n: number
  date: string
}

/** Occurrences of the confirm-first rules that are due. */
export function pendingOccurrences(rules: Recurring[], upTo = today()): Pending[] {
  const out: Pending[] = []
  for (const rule of rules) {
    if (rule.deleted || !rule.active || rule.autoPost) continue
    for (let n = rule.generated, guard = 0; guard < 24; n++, guard++) {
      const probe = { ...rule, generated: n }
      const d = nextDue(probe)
      if (!d || d > upTo) break
      out.push({ rule, n, date: d })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Handle one occurrence of a confirm-first rule: post it (or skip it) and move the rule on. */
export async function resolveOccurrence(p: Pending, post: boolean) {
  const rule = await db.recurrings.get(p.rule.id)
  if (!rule || rule.generated !== p.n) return
  await db.transaction('rw', db.records, db.recurrings, async () => {
    if (post) {
      const rec = buildRecord(rule, p.n)
      if (!(await db.records.get(rec.id))) await db.records.put({ ...rec, updatedAt: stamp() })
    }
    await db.recurrings.put({ ...rule, generated: rule.generated + 1, updatedAt: stamp() })
  })
  markLocalChange()
}

/** What the record form asks for under 單次 / 週期 / 分期. */
export type Repeat =
  | { kind: 'once' }
  | { kind: 'recurring'; freq: Freq; interval: number; autoPost: boolean; endDate?: string }
  | { kind: 'installment'; periods: number; fee: number }
