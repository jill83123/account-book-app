import type { Account, Category, Ledger, Loan, Rec } from '@/db/types'
import { addDays, addMonths, addYm, daysInMonth, parse, ym } from './date'
import { splitEven } from './money'
import { myTotal, paidByOther } from './split'
import { baseCurrency } from './currency'

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

/** The currency an account or ledger is kept in; missing means the default one. */
export const currencyOf = (x: { currency?: string } | undefined): string => x?.currency || baseCurrency.value

/** An account kept in a currency other than the default one: its balance is not counted in the totals. */
export const isForeignAccount = (a: Pick<Account, 'currency'>): boolean => currencyOf(a) !== baseCurrency.value

/**
 * The records that count in the accounts. Nothing is converted, so a record only moves an account when both are in the
 * same currency (a ledger's currency for an expense or income, the two wallets for a transfer, unless the transfer says
 * how much arrived). Balance adjustments always count.
 */
export function countedRecords(records: Rec[], ledgers: Ledger[], accounts: Account[]): Rec[] {
  const led = new Map(ledgers.map((l) => [l.id, l]))
  const acc = new Map(accounts.map((a) => [a.id, a]))
  return records.filter((r) => {
    if (r.adjust) return true
    const from = acc.get(r.accountId)
    if (r.type === 'transfer') {
      return r.toTotal != null || currencyOf(from) === currencyOf(r.toAccountId ? acc.get(r.toAccountId) : undefined)
    }
    return currencyOf(led.get(r.ledgerId)) === currencyOf(from)
  })
}

/** Balances of the accounts, each in its own currency: what they started with, plus every record, transfer and loan payment. */
export function accountBalances(accounts: Account[], records: Rec[], loans: Loan[]) {
  const bal = new Map<string, number>()
  const cur = new Map<string, string>()
  for (const a of accounts) {
    bal.set(a.id, a.initial)
    cur.set(a.id, currencyOf(a))
  }
  const add = (id: string | undefined, n: number) => {
    if (id && bal.has(id)) bal.set(id, bal.get(id)! + n)
  }
  /** loans are in the default currency, so only an account in it takes them */
  const addLoan = (id: string | undefined, n: number) => {
    if (id && cur.get(id) === baseCurrency.value) add(id, n)
  }
  for (const r of records) {
    if (r.type === 'expense') add(r.accountId, paidByOther(r) ? 0 : -r.total)
    else if (r.type === 'income') add(r.accountId, r.total)
    else {
      add(r.accountId, -r.total)
      add(r.toAccountId, r.toTotal ?? r.total)
    }
  }
  for (const l of loans) {
    const sign = l.direction === 'lend' ? -1 : 1
    addLoan(l.accountId, sign * l.principal)
    for (const p of l.repayments) addLoan(p.accountId, -sign * p.amount)
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
