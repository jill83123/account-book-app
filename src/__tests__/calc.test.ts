import { describe, expect, it } from 'vitest'
import {
  accountBalances,
  amortSchedule,
  byCategory,
  cardCycles,
  countedRecords,
  loanOutstanding,
  nextDayOfMonth,
  spendOn,
  toEntries,
} from '@/lib/calc'
import type { Category, Ledger, Loan } from '@/db/types'
import { account, line, rec } from './helpers'

describe('toEntries', () => {
  it('skips transfers and flattens lines', () => {
    const e = toEntries(
      [rec({ lines: [line(30), line(70)] }), rec({ type: 'transfer', lines: [], total: 500 })],
      false,
    )
    expect(e.map((x) => x.amount)).toEqual([30, 70])
    expect(e[0]!.ym).toBe('2026-03')
  })
  it('amortizes across months only when asked, total preserved', () => {
    const r = rec({ date: '2026-11-20', lines: [line(1000, { amortMonths: 3 })] })
    expect(toEntries([r], false)).toHaveLength(1)
    const e = toEntries([r], true)
    expect(e.map((x) => x.ym)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(1000)
    expect(e.every((x) => x.spread)).toBe(true)
  })
  it('income is never amortized', () => {
    const r = rec({ type: 'income', lines: [line(1000, { amortMonths: 3 })] })
    expect(toEntries([r], true)).toHaveLength(1)
  })
  it('shared bills only count my part, lines add up exactly', () => {
    const r = rec({
      lines: [line(100), line(100), line(100)],
      split: {
        mode: 'even',
        shares: [
          { memberId: 'A', amount: 100 },
          { memberId: 'B', amount: 100 },
        ],
      },
    })
    const e = toEntries([r], false)
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(100)
  })
  it('amortSchedule', () => {
    const r = rec({ date: '2026-01-31', lines: [line(100, { amortMonths: 4 })] })
    expect(amortSchedule(r, 0)).toEqual([
      { ym: '2026-01', amount: 25 },
      { ym: '2026-02', amount: 25 },
      { ym: '2026-03', amount: 25 },
      { ym: '2026-04', amount: 25 },
    ])
  })
})

describe('accountBalances', () => {
  const loan = (extra: Partial<Loan>): Loan => ({
    id: 'ln',
    direction: 'lend',
    personId: 'P',
    principal: 1000,
    date: '2026-01-01',
    repayments: [],
    updatedAt: 1,
    ...extra,
  })
  it('expense, income, transfer', () => {
    const accts = [account({ id: 'a1', initial: 1000 }), account({ id: 'a2', initial: 0 })]
    const bal = accountBalances(
      accts,
      [
        rec({ accountId: 'a1', lines: [line(200)] }),
        rec({ type: 'income', accountId: 'a1', lines: [line(500)] }),
        rec({ type: 'transfer', accountId: 'a1', toAccountId: 'a2', lines: [], total: 300 }),
      ],
      [],
    )
    expect(bal.get('a1')).toBe(1000 - 200 + 500 - 300)
    expect(bal.get('a2')).toBe(300)
  })
  it('paid-by-other expense does not touch the balance', () => {
    const bal = accountBalances(
      [account({ initial: 100 })],
      [rec({ lines: [line(300)], split: { mode: 'other', shares: [], payer: 'A', mine: 100 } })],
      [],
    )
    expect(bal.get('a1')).toBe(100)
  })
  it('loans: lending takes money out, repayment brings it back', () => {
    const bal = accountBalances(
      [account({ initial: 5000 })],
      [],
      [loan({ accountId: 'a1', repayments: [{ id: 'p', date: '2026-02-01', amount: 400, accountId: 'a1' }] })],
    )
    expect(bal.get('a1')).toBe(5000 - 1000 + 400)
    expect(loanOutstanding(loan({ repayments: [{ id: 'p', date: 'x', amount: 400 }] }))).toBe(600)
  })
})

describe('countedRecords', () => {
  const ledger = (id: string, currency?: string): Ledger => ({
    id,
    name: id,
    order: 0,
    color: '#000',
    ...(currency ? { currency } : {}),
    updatedAt: 1,
  })
  const ledgers = [ledger('home'), ledger('trip', 'JPY')]
  const twd = account({ id: 'twd', initial: 1000 })
  const yen = account({ id: 'yen', initial: 20000, currency: 'JPY' })
  it('a record only moves a wallet in the same currency as its ledger', () => {
    const records = [
      rec({ id: 'a', ledgerId: 'home', accountId: 'twd', lines: [line(100)] }),
      rec({ id: 'b', ledgerId: 'trip', accountId: 'twd', lines: [line(5000)] }), // yen spending paid from a TWD wallet
      rec({ id: 'c', ledgerId: 'trip', accountId: 'yen', lines: [line(3000)] }),
      rec({ id: 'd', ledgerId: 'home', accountId: 'yen', lines: [line(50)] }), // TWD spending from a yen wallet
    ]
    const counted = countedRecords(records, ledgers, [twd, yen])
    expect(counted.map((r) => r.id)).toEqual(['a', 'c'])
    const bal = accountBalances([twd, yen], counted, [])
    expect(bal.get('twd')).toBe(900)
    expect(bal.get('yen')).toBe(17000)
  })
  it('a transfer between currencies counts only when it says how much arrived; an adjustment always counts', () => {
    const twd2 = account({ id: 'twd2', initial: 0 })
    const records = [
      rec({ id: 't1', type: 'transfer', accountId: 'twd', toAccountId: 'twd2', lines: [], total: 300 }),
      rec({ id: 't2', type: 'transfer', accountId: 'twd', toAccountId: 'yen', lines: [], total: 300 }),
      rec({ id: 't3', type: 'transfer', accountId: 'twd', toAccountId: 'yen', lines: [], total: 300, toTotal: 1400 }),
      rec({ id: 'j', ledgerId: 'home', accountId: 'yen', adjust: true, lines: [], total: 10 }),
    ]
    const counted = countedRecords(records, ledgers, [twd, twd2, yen])
    expect(counted.map((r) => r.id)).toEqual(['t1', 't3', 'j'])
    const bal = accountBalances([twd, twd2, yen], counted, [])
    expect(bal.get('twd')).toBe(1000 - 300 - 300)
    expect(bal.get('yen')).toBe(20000 + 1400 - 10)
  })
  it('keeps every record when everything is in the default currency', () => {
    const records = [rec({ ledgerId: 'home', accountId: 'twd' })]
    expect(countedRecords(records, [ledger('home')], [twd]).length).toBe(1)
  })
})

describe('cardCycles / spendOn / nextDayOfMonth', () => {
  it('cycle containing a date before and after the statement day', () => {
    const c1 = cardCycles(10, '2026-03-05')
    expect(c1.cur).toEqual({ start: '2026-02-11', end: '2026-03-10' })
    expect(c1.prev).toEqual({ start: '2026-01-11', end: '2026-02-10' })
    expect(cardCycles(10, '2026-03-10').cur.end).toBe('2026-03-10')
    expect(cardCycles(10, '2026-03-11').cur).toEqual({ start: '2026-03-11', end: '2026-04-10' })
  })
  it('statement day 31 clamps in short months', () => {
    expect(cardCycles(31, '2026-02-10').cur.end).toBe('2026-02-28')
  })
  it('spendOn counts expenses, subtracts income, ignores other accounts/dates', () => {
    const rs = [
      rec({ accountId: 'a1', date: '2026-03-01', lines: [line(100)] }),
      rec({ type: 'income', accountId: 'a1', date: '2026-03-02', lines: [line(30)] }),
      rec({ accountId: 'a2', date: '2026-03-01', lines: [line(999)] }),
      rec({ accountId: 'a1', date: '2026-04-01', lines: [line(999)] }),
    ]
    expect(spendOn('a1', rs, '2026-03-01', '2026-03-31')).toBe(70)
  })
  it('nextDayOfMonth includes today', () => {
    expect(nextDayOfMonth(15, '2026-03-10')).toBe('2026-03-15')
    expect(nextDayOfMonth(15, '2026-03-15')).toBe('2026-03-15')
    expect(nextDayOfMonth(15, '2026-03-16')).toBe('2026-04-15')
  })
})

describe('byCategory', () => {
  const cat = (id: string, parentId: string | null): Category => ({
    id,
    name: id,
    kind: 'expense',
    parentId,
    icon: '',
    color: '',
    order: 0,
    updatedAt: 1,
  })
  it('rolls children up to parents and sorts by total', () => {
    const cats = new Map([
      ['food', cat('food', null)],
      ['lunch', cat('lunch', 'food')],
      ['fun', cat('fun', null)],
    ])
    const entries = toEntries(
      [
        rec({
          lines: [
            line(50, { categoryId: 'lunch' }),
            line(30, { categoryId: 'food' }),
            line(200, { categoryId: 'fun' }),
          ],
        }),
      ],
      false,
    )
    const parent = byCategory(entries, cats, 'parent')
    expect(parent.map((c) => [c.id, c.total, c.count])).toEqual([
      ['fun', 200, 1],
      ['food', 80, 2],
    ])
    expect(
      byCategory(entries, cats, 'child')
        .map((c) => c.id)
        .sort(),
    ).toEqual(['food', 'fun', 'lunch'])
  })
})
