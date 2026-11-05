import type { Account, Line, Rec } from '@/db/types'

let n = 0
export const line = (amount: number, extra: Partial<Line> = {}): Line => ({
  id: `l${++n}`,
  name: 'item',
  categoryId: 'c1',
  amount,
  ...extra,
})

export const rec = (extra: Partial<Rec> & { lines?: Line[] } = {}): Rec => {
  const lines = extra.lines ?? [line(100)]
  return {
    id: `r${++n}`,
    type: 'expense',
    date: '2026-03-15',
    time: '',
    ledgerId: 'L1',
    accountId: 'a1',
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    updatedAt: 1,
    ...extra,
  }
}

export const account = (extra: Partial<Account> = {}): Account => ({
  id: 'a1',
  name: 'cash',
  kind: 'cash',
  initial: 0,
  order: 0,
  color: '#000',
  updatedAt: 1,
  ...extra,
})
