import { describe, expect, it } from 'vitest'
import { budgetIn, defaultBudget, monthsOfYear } from '@/lib/budget'

describe('budget', () => {
  it('uses default when no override', () => {
    expect(budgetIn({ budget: 100 }, '2026-05')).toBe(100)
    expect(budgetIn({}, '2026-05')).toBe(0)
  })
  it('month override wins, including 0', () => {
    expect(budgetIn({ budget: 100, budgets: { '2026-05': 50 } }, '2026-05')).toBe(50)
    expect(budgetIn({ budget: 100, budgets: { '2026-05': 0 } }, '2026-05')).toBe(0)
  })
  it('default does not apply before budgetFrom', () => {
    const b = { budget: 100, budgetFrom: '2026-05' }
    expect(budgetIn(b, '2026-04')).toBe(0)
    expect(budgetIn(b, '2026-05')).toBe(100)
  })
  it('defaultBudget keeps the start month when changing, starts now when new, clears on 0', () => {
    expect(defaultBudget(undefined, 100, '2026-05')).toEqual({ budget: 100, budgetFrom: '2026-05' })
    expect(defaultBudget({ budget: 100, budgetFrom: '2026-01' }, 200, '2026-05')).toEqual({
      budget: 200,
      budgetFrom: '2026-01',
    })
    expect(defaultBudget({ budget: 100 }, 0, '2026-05')).toEqual({ budget: undefined, budgetFrom: undefined })
  })
  it('monthsOfYear', () => {
    const m = monthsOfYear('2026')
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2026-01')
    expect(m[11]).toBe('2026-12')
  })
})
