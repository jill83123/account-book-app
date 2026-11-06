import { beforeEach, describe, expect, it } from 'vitest'
import { db, remove, save, saveMany, stamp } from '@/db'
import { syncSplitLoans } from '@/lib/split'
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
