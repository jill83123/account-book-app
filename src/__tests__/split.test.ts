import { describe, expect, it } from 'vitest'
import { myTotal, othersShare, paidByOther, resolveSplit, sharesFor } from '@/lib/split'
import { rec } from './helpers'

describe('split', () => {
  it('even: bill shared with the payer as one more head', () => {
    expect(sharesFor('even', 100, ['A', 'B'])).toEqual([
      { memberId: 'A', amount: 33 },
      { memberId: 'B', amount: 33 },
    ])
  })
  it('advance: all paid for others, remainder to the first people', () => {
    const s = sharesFor('advance', 100, ['A', 'B', 'C'])
    expect(s.map((x) => x.amount)).toEqual([34, 33, 33])
    expect(s.reduce((n, x) => n + x.amount, 0)).toBe(100)
  })
  it('custom: uses typed amounts, drops zeros', () => {
    expect(sharesFor('custom', 100, ['A', 'B'], { A: 40.4, B: 0 })).toEqual([{ memberId: 'A', amount: 40 }])
  })
  it('nothing to share', () => {
    expect(sharesFor('even', 0, ['A'])).toEqual([])
    expect(sharesFor('even', 100, [])).toEqual([])
  })
  it('myTotal / othersShare', () => {
    const r = rec({
      total: 300,
      split: {
        mode: 'even',
        shares: [
          { memberId: 'A', amount: 100 },
          { memberId: 'B', amount: 100 },
        ],
      },
    })
    expect(othersShare(r)).toBe(200)
    expect(myTotal(r)).toBe(100)
    expect(myTotal(rec({ total: 300 }))).toBe(300)
    expect(
      myTotal(rec({ type: 'income', total: 300, split: { mode: 'even', shares: [{ memberId: 'A', amount: 100 }] } })),
    ).toBe(300)
  })
  it('somebody else paid: only my part counts and no money leaves my account', () => {
    const r = rec({ total: 300, split: { mode: 'other', shares: [], payer: 'A', mine: 120 } })
    expect(paidByOther(r)).toBe(true)
    expect(myTotal(r)).toBe(120)
    expect(paidByOther(rec())).toBe(false)
  })
  it('resolveSplit recomputes for a new total and drops when nobody is left', () => {
    const sp = { mode: 'even' as const, shares: [{ memberId: 'A', amount: 50 }] }
    expect(resolveSplit(sp, 300, ['A'])).toEqual({ mode: 'even', shares: [{ memberId: 'A', amount: 150 }] })
    expect(resolveSplit(sp, 300, [])).toBeUndefined()
    expect(resolveSplit(undefined, 300, ['A'])).toBeUndefined()
  })
})
