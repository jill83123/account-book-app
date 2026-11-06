import { saveMany } from '@/db'
import type { Rec } from '@/db/types'
import { baseCurrency } from './currency'

/** A foreign record saved without a rate: its price is only known in that currency until the trip is settled. */
export const isPending = (r: Pick<Rec, 'currency' | 'rate'>): boolean => Boolean(r.currency) && r.currency !== baseCurrency.value && r.rate === 0

/** What a pending record cost, in its own currency. */
export const foreignTotal = (r: Pick<Rec, 'lines'>): number => r.lines.reduce((n, l) => n + (l.original ?? 0), 0)

/** The pending records of one ledger and currency. */
export const pendingOf = (records: Rec[], ledgerId: string, currency: string): Rec[] =>
  records.filter((r) => !r.deleted && r.ledgerId === ledgerId && r.currency === currency && isPending(r))

/**
 * The trip is over and the total in TWD is known: spread it over the pending records of that currency, by what each cost.
 * Every record then carries the same rate, and the lines add up to exactly `twd`.
 */
export async function settlePending(records: Rec[], twd: number): Promise<number> {
  const all = records.filter((r) => r.lines.some((l) => (l.original ?? 0) > 0))
  const foreign = all.reduce((n, r) => n + foreignTotal(r), 0)
  if (!all.length || foreign <= 0 || twd <= 0) return 0
  const rate = twd / foreign
  let left = twd
  const lines = all.flatMap((r) => r.lines.map((l) => ({ r, l })))
  const amounts = new Map<string, number>()
  lines.forEach(({ l }, i) => {
    const amount = i === lines.length - 1 ? left : Math.round((l.original ?? 0) * rate)
    left -= amount
    amounts.set(l.id, amount)
  })
  await saveMany(
    'records',
    all.map((r) => {
      const ls = r.lines.map((l) => ({ ...l, amount: amounts.get(l.id) ?? 0 }))
      return { ...r, lines: ls, total: ls.reduce((n, l) => n + l.amount, 0), rate: Math.round(rate * 1e6) / 1e6 }
    }),
  )
  return all.length
}
