import { db } from '@/db'
import type { Base } from '@/db/types'
import { buildTables, type Snapshot, type TableSpec } from './google/export'
import type { Cell } from './google/sheets'

/** One cell, quoted when it has a comma, quote or line break; text that a spreadsheet would run as a formula is kept as text. */
function cell(v: string | number | boolean | null | undefined, plain: boolean): string {
  if (v == null || v === '') return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  if (plain) s = s.replace(/^'/, '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A table of the spreadsheet as CSV text, with the helper columns left out. The BOM lets Excel read the Chinese. */
export function tableToCsv(t: TableSpec): string {
  const hidden = new Set(t.hiddenCols ?? [])
  const keep = t.cols.map((_, i) => i).filter((i) => !hidden.has(i))
  const idCols = new Set(t.cols.map((c, i) => (c.title === '記錄ID' ? i : -1)))
  const line = (get: (i: number) => string) => keep.map(get).join(',')
  const head = line((i) => cell(t.cols[i]!.title, false))
  const body = t.rows.map((r) => line((i) => cell(r[i] as string | number, idCols.has(i))))
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'
}

async function snapshot(): Promise<Snapshot> {
  const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted)
  return {
    accounts: alive(await db.accounts.toArray()),
    categories: alive(await db.categories.toArray()),
    ledgers: alive(await db.ledgers.toArray()),
    records: alive(await db.records.toArray()),
    merchants: alive(await db.merchants.toArray()),
    recurrings: alive(await db.recurrings.toArray()),
    loans: alive(await db.loans.toArray()),
    members: alive(await db.members.toArray()),
  }
}

const COLS = [
  '日期', '時間', '星期', '類型', '帳本', '商家／對象', '品項', '分類', '子分類', '金額', '我的份額', '分帳',
  '帳戶', '轉入帳戶', '備註', '細項', '攤提月數', '來源', '記錄ID', '到期日', '已還', '未還', '狀態', '還款紀錄',
] as const

/** Entries and loans in one file: one row each, told apart by 類型 (支出、收入、轉帳、借出、借入). Columns that do not apply stay empty. */
export async function exportAllCsv(): Promise<string> {
  const tables = buildTables(await snapshot(), false)
  const detail = tables.find((t) => t.title === '明細')!
  const loans = tables.find((t) => t.title === '借款')!
  const rename = { 商家: '商家／對象', 對象: '商家／對象', 方向: '類型' } as Record<string, string>
  const rows: Cell[][] = []
  for (const t of [detail, loans]) {
    const at = t.cols.map((c) => COLS.indexOf((rename[c.title] ?? c.title) as (typeof COLS)[number]))
    for (const r of t.rows) {
      const out: Cell[] = COLS.map(() => '')
      r.forEach((v, i) => {
        if (at[i]! >= 0) out[at[i]!] = v
      })
      rows.push(out)
    }
  }
  return tableToCsv({
    title: '全部',
    sheetId: 0,
    color: '',
    cols: COLS.map((title) => ({ title, width: 0 })),
    rows,
  })
}
