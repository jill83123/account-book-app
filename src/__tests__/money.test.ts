import { describe, expect, it } from 'vitest'
import { evalExpr, fmt, fmtFx, money, splitEven } from '@/lib/money'

describe('money', () => {
  it('formats', () => {
    expect(fmt(1234567)).toBe('1,234,567')
    expect(money(1500)).toBe('$1,500')
    expect(fmtFx(12.5)).toBe('12.5')
  })
  it('evalExpr evaluates arithmetic', () => {
    expect(evalExpr('120+35*2')).toBe(190)
    expect(evalExpr('1,000 + 500')).toBe(1500)
    expect(evalExpr('3×4÷2')).toBe(6)
    expect(evalExpr('(1+2)*3')).toBe(9)
    expect(evalExpr('')).toBe(0)
    expect(evalExpr('10/4', 2)).toBe(2.5)
  })
  it('evalExpr rejects anything that is not arithmetic', () => {
    expect(evalExpr('alert(1)')).toBeNull()
    expect(evalExpr('1+')).toBeNull()
    expect(evalExpr('1/0')).toBeNull()
    expect(evalExpr('process.exit()')).toBeNull()
  })
  it('splitEven shares add up exactly, remainder to the last', () => {
    expect(splitEven(100, 3)).toEqual([33, 33, 34])
    expect(splitEven(10, 1)).toEqual([10])
    for (const [t, n] of [
      [1000, 7],
      [1, 3],
      [12345, 12],
    ] as const) {
      expect(splitEven(t, n).reduce((a, b) => a + b, 0)).toBe(t)
    }
  })
})
