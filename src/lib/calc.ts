import type { Account, Category, Loan, Rec } from '@/db/types'
import { addDays, addMonths, addYm, daysInMonth, parse, ym } from './date'
import { splitEven } from './money'
import { myTotal, paidByOther } from './split'
import { BASE_CURRENCY } from './currency'

/** One line of one record, ready for reports. */
export interface Entry {
  recordId: string
  lineId: string
  date: string
  /** the month it counts in (differs from the date's month for the later shares of an amortized expense) */
  ym: string
  type: 'expense' | 'income'
  categoryId: string
  name: string
  amount: number
  merchantId?: string
  ledgerId: string
  accountId: string
  /** this is one month's share of an amortized expense */
  spread: boolean
}

/**
 * Flatten records into report entries. With `amortize` an expense line that has `amortMonths`
 * is split over that many months starting with the month of its date.
 */
export function toEntries(records: Rec[], amortize: boolean): Entry[] {
  const out: Entry[] = []
  for (const r of records) {
    if (r.type === 'transfer') continue
    // a shared bill: every line counts for the same fraction, the rest is what others owe
    const mine = myTotal(r)
    const part = r.type === 'expense' && r.total > 0 && mine !== r.total ? mine / r.total : 1
    let left = mine
    for (const [i, l] of r.lines.entries()) {
      const amount = part === 1 ? l.amount : i === r.lines.length - 1 ? left : Math.round(l.amount * part)
      left -= amount
      const base = {
        recordId: r.id,
        lineId: l.id,
        type: r.type,
        categoryId: l.categoryId,
        name: l.name,
        merchantId: r.merchantId,
        ledgerId: r.ledgerId,
        accountId: r.accountId,
      }
      const n = l.amortMonths ?? 1
      if (amortize && r.type === 'expense' && n > 1) {
        splitEven(amount, n).forEach((share, i) => {
          const month = addYm(ym(r.date), i)
          out.push({
            ...base,
            date: i === 0 ? r.date : `${month}-01`,
            ym: month,
            amount: share,
            spread: true,
          })
        })
      } else {
        out.push({ ...base, date: r.date, ym: ym(r.date), amount, spread: false })
      }
    }
  }
  return out
}

/** Per-month shares of an amortized line, for the sheet's schedule tab. */
export function amortSchedule(r: Rec, lineIndex: number): { ym: string; amount: number }[] {
  const l = r.lines[lineIndex]!
  const n = l.amortMonths ?? 1
  return splitEven(l.amount, n).map((amount, i) => ({ ym: addYm(ym(r.date), i), amount }))
}

export function loanOutstanding(l: Loan): number {
  return l.principal - l.repayments.reduce((s, p) => s + p.amount, 0)
}

/** An account kept in a currency other than TWD (its balance is shown and counted in that currency). */
export const isForeignAccount = (a: Pick<Account, 'currency'>): boolean => Boolean(a.currency) && a.currency !== BASE_CURRENCY

/** An account's balance in its own currency, as the amount in TWD it is worth at the account's rate. */
export const accountTwd = (a: Account, native: number): number => (isForeignAccount(a) ? native * (a.rate ?? 0) : native)

/**
 * Balances in each account's own currency. A TWD account takes the TWD total of every record. A foreign account takes
 * the prices as typed when the record is in its currency, else the TWD total turned back with the account's rate.
 */
export function accountBalances(accounts: Account[], records: Rec[], loans: Loan[]) {
  const bal = new Map<string, number>()
  const byId = new Map<string, Account>()
  for (const a of accounts) {
    bal.set(a.id, a.initial)
    byId.set(a.id, a)
  }
  const add = (id: string | undefined, n: number) => {
    if (id && bal.has(id)) bal.set(id, bal.get(id)! + n)
  }
  /** an amount that is in TWD, put into the account's own currency */
  const addTwd = (id: string | undefined, twd: number) => {
    const a = id ? byId.get(id) : undefined
    if (!a) return
    add(id, isForeignAccount(a) ? (a.rate ? twd / a.rate : 0) : twd)
  }
  /** a record's amount as the account holds it */
  const amountIn = (id: string | undefined, r: Rec): number => {
    const a = id ? byId.get(id) : undefined
    if (!a || !isForeignAccount(a)) return r.total
    if (r.currency === a.currency) return r.lines.reduce((n, l) => n + (l.original ?? 0), 0)
    return a.rate ? r.total / a.rate : 0
  }
  for (const r of records) {
    if (r.type === 'expense') add(r.accountId, paidByOther(r) ? 0 : -amountIn(r.accountId, r))
    else if (r.type === 'income') add(r.accountId, amountIn(r.accountId, r))
    else {
      add(r.accountId, -amountIn(r.accountId, r))
      const to = r.toAccountId ? byId.get(r.toAccountId) : undefined
      // a transfer that says how much arrived (in the wallet's own currency) is taken as it is
      if (to && isForeignAccount(to) && r.toTotal != null) add(r.toAccountId, r.toTotal)
      else addTwd(r.toAccountId, r.total)
    }
  }
  for (const l of loans) {
    const sign = l.direction === 'lend' ? -1 : 1
    addTwd(l.accountId, sign * l.principal)
    for (const p of l.repayments) addTwd(p.accountId, -sign * p.amount)
  }
  return bal
}

/** The statement cycle (start and closing date, both included) that contains `date`, and the one before it. */
export function cardCycles(statementDay: number, date: string) {
  const d = parse(date)
  const close = (month: string) => {
    const [y, m] = month.split('-').map(Number)
    return `${month}-${String(Math.min(statementDay, daysInMonth(y!, m! - 1))).padStart(2, '0')}`
  }
  const thisMonth = ym(date)
  const curEnd = d.getDate() <= statementDay ? close(thisMonth) : close(addYm(thisMonth, 1))
  const prevEnd = close(addYm(curEnd.slice(0, 7), -1))
  const prevPrevEnd = close(addYm(curEnd.slice(0, 7), -2))
  return {
    cur: { start: addDays(prevEnd, 1), end: curEnd },
    prev: { start: addDays(prevPrevEnd, 1), end: prevEnd },
  }
}

export function spendOn(accountId: string, records: Rec[], from: string, to: string): number {
  let s = 0
  for (const r of records) {
    if (r.accountId !== accountId || r.date < from || r.date > to) continue
    if (r.type === 'expense') s += paidByOther(r) ? 0 : r.total
    else if (r.type === 'income') s -= r.total
  }
  return s
}

/** Next date the day-of-month falls on, today included. */
export function nextDayOfMonth(day: number, from: string): string {
  const here = addMonths(`${ym(from)}-01`, 0, day)
  return here >= from ? here : addMonths(`${ym(from)}-01`, 1, day)
}

export interface CatTotal {
  id: string
  name: string
  icon: string
  color: string
  total: number
  count: number
}

/** Sum entries by category; `level: 'parent'` rolls sub-categories up into their top-level category. */
export function byCategory(
  entries: Entry[],
  cats: Map<string, Category>,
  level: 'parent' | 'child',
): CatTotal[] {
  const map = new Map<string, CatTotal>()
  for (const e of entries) {
    let c = cats.get(e.categoryId)
    if (!c) continue
    if (level === 'parent' && c.parentId) c = cats.get(c.parentId) ?? c
    const cur = map.get(c.id) ?? {
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      total: 0,
      count: 0,
    }
    cur.total += e.amount
    cur.count++
    map.set(c.id, cur)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export const topCategoryId = (cats: Map<string, Category>, id: string) =>
  cats.get(id)?.parentId ?? id
