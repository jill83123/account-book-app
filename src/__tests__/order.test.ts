import { describe, expect, it } from 'vitest'
import { compareRecords } from '@/lib/order'
import { rec } from './helpers'

describe('compareRecords', () => {
  const sort = (rs: ReturnType<typeof rec>[]) => [...rs].sort(compareRecords).map((r) => r.id)
  it('newest day first', () => {
    expect(sort([rec({ id: 'a', date: '2026-01-01' }), rec({ id: 'b', date: '2026-01-02' })])).toEqual(['b', 'a'])
  })
  it('within a day: unplaced before placed, placed by pos', () => {
    const rs = [rec({ id: 'p1', pos: 1 }), rec({ id: 'p0', pos: 0 }), rec({ id: 'u', createdAt: 5 })]
    expect(sort(rs)).toEqual(['u', 'p0', 'p1'])
  })
  it('timed: latest first, no-time ones on top, then newest created', () => {
    const rs = [
      rec({ id: 't9', time: '09:00' }),
      rec({ id: 't18', time: '18:00' }),
      rec({ id: 'none', time: '' }),
    ]
    expect(sort(rs)).toEqual(['none', 't18', 't9'])
    expect(sort([rec({ id: 'old', createdAt: 1 }), rec({ id: 'new', createdAt: 2 })])).toEqual(['new', 'old'])
  })
})
