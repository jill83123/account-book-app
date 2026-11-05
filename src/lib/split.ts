import { remove, save, table } from '@/db'
import type { Loan, Rec } from '@/db/types'
import { uid } from './id'

type Mode = Exclude<NonNullable<Rec['split']>['mode'], 'other'>

/** What the others owe on a shared bill. */
export const othersShare = (r: Pick<Rec, 'split'> & { total: number }): number =>
  !r.split ? 0 : r.split.mode === 'other' ? Math.max(0, r.total - (r.split.mine ?? r.total)) : r.split.shares.reduce((n, s) => n + s.amount, 0)

/** What an expense cost the person who keeps the book: the whole bill, minus the parts others pay back. */
export const myTotal = (r: Pick<Rec, 'type' | 'total' | 'split'>): number =>
  r.type === 'expense' && r.split ? Math.max(0, r.total - othersShare(r)) : r.total

/** somebody else paid: no money left this person's account */
export const paidByOther = (r: Pick<Rec, 'type' | 'split'>): boolean => r.type === 'expense' && r.split?.mode === 'other'

/**
 * The others' parts of `total`. `people` are the ids of the others; "even" shares the bill with the person keeping the book as one more,
 * "advance" is all paid for the others, "custom" uses the typed amounts.
 */
export function sharesFor(mode: Mode, total: number, people: string[], custom: Record<string, number> = {}) {
  if (!people.length || total <= 0) return []
  if (mode === 'custom') return people.map((memberId) => ({ memberId, amount: Math.max(0, Math.round(custom[memberId] ?? 0)) })).filter((s) => s.amount > 0)
  const heads = mode === 'even' ? people.length + 1 : people.length
  const each = Math.floor(total / heads)
  // the odd dollars stay with the one who paid, in "even"; with an advance they go to the first people
  const left = mode === 'even' ? 0 : total - each * heads
  return people.map((memberId, i) => ({ memberId, amount: each + (i < left ? 1 : 0) }))
}

/** The way a bill is shared, worked out again for today's total and people (they may have changed since it was chosen). */
export function resolveSplit(sp: Rec['split'], total: number, people: string[]): Rec['split'] {
  if (!sp || !people.length) return undefined
  if (sp.mode === 'other') {
    const payer = sp.payer && people.includes(sp.payer) ? sp.payer : people[0]
    return { mode: 'other', shares: [], payer, mine: Math.min(total, Math.max(0, sp.mine ?? total)) }
  }
  const shares = sharesFor(sp.mode, total, people, Object.fromEntries(sp.shares.map((x) => [x.memberId, x.amount])))
  return shares.length ? { mode: sp.mode, shares } : undefined
}

/** Keep the loans of a shared bill in step with the record: what others owe this person, or what this person owes whoever paid. */
export async function syncSplitLoans(rec: Pick<Rec, 'id' | 'date' | 'split'>) {
  const old = (await table('loans').filter((l) => l.recordId === rec.id && !l.deleted).toArray()) as Loan[]
  const sp = rec.split
  const want: { personId: string; direction: Loan['direction']; amount: number }[] = !sp
    ? []
    : sp.mode === 'other'
      ? sp.payer && (sp.mine ?? 0) > 0
        ? [{ personId: sp.payer, direction: 'borrow', amount: sp.mine! }]
        : []
      : sp.shares.map((x) => ({ personId: x.memberId, direction: 'lend', amount: x.amount }))
  for (const l of old) if (!want.some((w) => w.personId === l.personId && w.direction === l.direction)) await remove('loans', l.id)
  for (const w of want) {
    const had = old.find((l) => l.personId === w.personId && l.direction === w.direction)
    await save('loans', {
      id: had?.id ?? uid(),
      direction: w.direction,
      personId: w.personId,
      principal: w.amount,
      date: rec.date,
      note: '分帳',
      recordId: rec.id,
      repayments: had?.repayments ?? [],
    })
  }
}
