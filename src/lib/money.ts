export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export const money = (n: number) => `$${fmt(n)}`

/** 把文字裡每段數字的整數部分加上千分號，小數與運算符號照舊 */
export function groupDigits(s: string): string {
  return s.replace(/\d+/g, (m, off: number) => (s[off - 1] === '.' ? m : m.replace(/\B(?=(\d{3})+$)/g, ',')))
}

/** Evaluate "120+35*2" style input. Returns null when it is not a plain arithmetic expression. */
export function evalExpr(input: string, decimals = 0): number | null {
  const s = input.replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/[,\s]/g, '')
  if (!s) return 0
  if (!/^[0-9+\-*/().]+$/.test(s)) return null
  try {
    const v = Function(`"use strict"; return (${s})`)() as unknown
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    const k = 10 ** decimals
    return Math.round(v * k) / k
  } catch {
    return null
  }
}

/** Split `total` into `n` whole-number shares; the last share takes the remainder. */
export function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const out = Array<number>(n).fill(base)
  out[n - 1] = total - base * (n - 1)
  return out
}

