import { describe, expect, it } from 'vitest'
import { tableToCsv } from '@/lib/csv'

const table = (rows: (string | number)[][], extra = {}) => ({
  title: 't',
  sheetId: 0,
  color: '',
  cols: [
    { title: '日期', width: 1 },
    { title: '品項', width: 1 },
    { title: '記錄ID', width: 1 },
  ],
  rows,
  ...extra,
})

describe('tableToCsv', () => {
  it('starts with a BOM, uses CRLF, has a header', () => {
    const csv = tableToCsv(table([['2026-01-01', 'a', 'r1']]))
    expect(csv.startsWith('﻿日期,品項,記錄ID\r\n')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('quotes commas, quotes and line breaks', () => {
    const csv = tableToCsv(table([['d', 'a,b "c"\nd', 'r']]))
    expect(csv).toContain('"a,b ""c""\nd"')
  })
  it('neutralises spreadsheet formulas but not plain negative numbers', () => {
    const csv = tableToCsv(table([['d', '=SUM(A1)', 'r'], ['d', '-5', 'r']]))
    expect(csv).toContain("'=SUM(A1)")
    expect(csv).toContain(',-5,')
  })
  it('hides helper columns', () => {
    const csv = tableToCsv(table([['d', 'a', 'r']], { hiddenCols: [1] }))
    expect(csv).toContain('日期,記錄ID\r\n')
  })
  it('keeps IDs plain (no leading apostrophe)', () => {
    const csv = tableToCsv(table([['d', 'a', '=id']]))
    expect(csv).toContain(',=id')
  })
})
