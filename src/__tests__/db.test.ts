import { beforeEach, describe, expect, it } from 'vitest'
import { db, remove, save, saveMany, stamp } from '@/db'
import { syncSplitLoans } from '@/lib/split'
import { isPending, settlePending } from '@/lib/fx'
import { line, rec } from './helpers'

beforeEach(async () => {
  await Promise.all([db.records.clear(), db.loans.clear()])
})

describe('db helpers', () => {
  it('stamp is strictly increasing even within one ms', () => {
    const a = stamp()
    const b = stamp()
    const c = stamp()
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
  it('save stamps updatedAt; remove leaves a tombstone', async () => {
    await save('records', rec({ id: 'x', updatedAt: 0 }))
    expect((await db.records.get('x'))!.updatedAt).toBeGreaterThan(0)
    await remove('records', 'x')
    expect((await db.records.get('x'))!.deleted).toBe(true)
  })
  it('removing a record also tombstones the loans made from it', async () => {
    await save('records', rec({ id: 'x' }))
    await save('loans', {
      id: 'l1',
      direction: 'lend',
      personId: 'A',
      principal: 10,
      date: '2026-01-01',
      recordId: 'x',
      repayments: [],
    })
    await remove('records', 'x')
    expect((await db.loans.get('l1'))!.deleted).toBe(true)
  })
})

describe('syncSplitLoans', () => {
  it('creates a lend loan per person, updates in place, removes dropped people', async () => {
    const base = { id: 'bill', date: '2026-03-01' }
    await syncSplitLoans({
      ...base,
      split: {
        mode: 'even',
        shares: [
          { memberId: 'A', amount: 50 },
          { memberId: 'B', amount: 50 },
        ],
      },
    })
    let loans = await db.loans.filter((l) => !l.deleted).toArray()
    expect(loans.map((l) => l.personId).sort()).toEqual(['A', 'B'])
    const aId = loans.find((l) => l.personId === 'A')!.id

    await syncSplitLoans({ ...base, split: { mode: 'even', shares: [{ memberId: 'A', amount: 70 }] } })
    loans = await db.loans.filter((l) => !l.deleted).toArray()
    expect(loans).toHaveLength(1)
    expect(loans[0]!.id).toBe(aId)
    expect(loans[0]!.principal).toBe(70)
  })
  it('somebody else paid -> a borrow loan to the payer', async () => {
    await syncSplitLoans({
      id: 'bill',
      date: '2026-03-01',
      split: { mode: 'other', shares: [], payer: 'A', mine: 120 },
    })
    const [l] = await db.loans.toArray()
    expect(l).toMatchObject({ direction: 'borrow', personId: 'A', principal: 120 })
  })
  it('no split removes all loans', async () => {
    await syncSplitLoans({
      id: 'bill',
      date: '2026-03-01',
      split: { mode: 'even', shares: [{ memberId: 'A', amount: 50 }] },
    })
    await syncSplitLoans({ id: 'bill', date: '2026-03-01' })
    expect(await db.loans.filter((l) => !l.deleted).count()).toBe(0)
  })
})

describe('fx settle', () => {
  it('pending = foreign currency with rate 0', () => {
    expect(isPending({ currency: 'JPY', rate: 0 })).toBe(true)
    expect(isPending({ currency: 'JPY', rate: 0.2 })).toBe(false)
    expect(isPending({ currency: 'TWD', rate: 0 })).toBe(false)
    expect(isPending({})).toBe(false)
  })
  it('settlePending spreads the TWD total exactly and sets one rate', async () => {
    const mk = (id: string, yen: number[]) =>
      rec({ id, currency: 'JPY', rate: 0, lines: yen.map((y) => line(0, { original: y })) })
    const rs = [mk('t1', [1000, 333]), mk('t2', [777])]
    await saveMany('records', rs)
    expect(await settlePending(rs, 1000)).toBe(2)
    const out = await db.records.toArray()
    expect(out.reduce((s, r) => s + r.total, 0)).toBe(1000)
    expect(new Set(out.map((r) => r.rate)).size).toBe(1)
    expect(out[0]!.rate).toBeCloseTo(1000 / 2110, 5)
  })
  it('settlePending does nothing with no foreign amounts or non-positive TWD', async () => {
    expect(await settlePending([rec()], 1000)).toBe(0)
    expect(await settlePending([rec({ lines: [line(0, { original: 5 })] })], 0)).toBe(0)
  })
})
