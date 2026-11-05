const pad = (n: number) => String(n).padStart(2, '0')

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const today = () => ymd(new Date())

export function nowTime(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse YYYY-MM-DD as a local date (a bare Date('2026-01-01') would be UTC). */
export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export const ym = (date: string) => date.slice(0, 7)

export function addDays(s: string, n: number): string {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

/** Add months keeping the day of month where possible (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(s: string, n: number, day = parse(s).getDate()): string {
  const d = parse(s)
  const total = d.getFullYear() * 12 + d.getMonth() + n
  const y = Math.floor(total / 12)
  const m = total % 12
  return ymd(new Date(y, m, Math.min(day, daysInMonth(y, m))))
}

export function addYm(month: string, n: number): string {
  return addMonths(`${month}-01`, n).slice(0, 7)
}

export const weekday = (s: string) => parse(s).getDay()

export function relativeLabel(s: string): string {
  const t = today()
  if (s === t) return '今天'
  if (s === addDays(t, -1)) return '昨天'
  if (s === addDays(t, 1)) return '明天'
  const d = parse(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${Number(m)} 月`
}

/** Sunday-first (like the reference) list of dates covering a month, padded to whole weeks. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`
  const lead = weekday(first)
  const [y, m] = month.split('-').map(Number)
  const len = daysInMonth(y!, m! - 1)
  const total = Math.ceil((lead + len) / 7) * 7
  return Array.from({ length: total }, (_, i) => addDays(first, i - lead))
}

export function weekOf(s: string): string[] {
  const lead = weekday(s)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i - lead))
}

/** When something was added, from its timestamp: "2026/11/05 08:12". */
export function addedAt(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
