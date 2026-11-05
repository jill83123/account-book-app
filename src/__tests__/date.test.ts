import { describe, expect, it } from 'vitest'
import { addDays, addMonths, addYm, daysBetween, daysInMonth, monthGrid, parse, weekOf, ymd } from '@/lib/date'

describe('date', () => {
  it('parse is local and round-trips', () => {
    expect(ymd(parse('2026-01-01'))).toBe('2026-01-01')
  })
  it('addDays crosses month/year/leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('addMonths clamps the day to the target month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15')
  })
  it('addMonths with explicit day avoids drift', () => {
    expect(addMonths('2026-01-01', 1, 31)).toBe('2026-02-28')
    expect(addMonths('2026-01-01', 2, 31)).toBe('2026-03-31')
  })
  it('addYm', () => {
    expect(addYm('2026-12', 1)).toBe('2027-01')
    expect(addYm('2026-01', -1)).toBe('2025-12')
  })
  it('daysInMonth / daysBetween', () => {
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2024, 1)).toBe(29)
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59)
  })
  it('monthGrid is whole Sunday-first weeks containing the month', () => {
    const g = monthGrid('2026-03') // 2026-03-01 is a Sunday
    expect(g.length % 7).toBe(0)
    expect(g[0]).toBe('2026-03-01')
    expect(g).toContain('2026-03-31')
    expect(parse(g[0]!).getDay()).toBe(0)
  })
  it('weekOf returns Sun..Sat containing the date', () => {
    const w = weekOf('2026-03-18')
    expect(w).toHaveLength(7)
    expect(w[0]).toBe('2026-03-15')
    expect(w[6]).toBe('2026-03-21')
  })
})
