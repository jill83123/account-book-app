import type { Fmt, TableSpec } from './export'

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 }
}

const NUMBER_FORMAT: Partial<Record<Fmt, { type: string; pattern: string }>> = {
  int: { type: 'NUMBER', pattern: '#,##0' },
  signed: { type: 'NUMBER', pattern: '#,##0;[Red]-#,##0' },
  date: { type: 'DATE', pattern: 'yyyy-mm-dd' },
  time: { type: 'TIME', pattern: 'hh:mm' },
}

const ACCENT = '#4ab0e0'
const STRIPE = '#f1f8fc'

export function colLetter(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Grid size and tab settings: applied to every tab on every sync so the rows always fit. */
export function sizeRequests(t: TableSpec): object[] {
  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId: t.sheetId,
          tabColorStyle: { rgbColor: rgb(t.color) },
          gridProperties: {
            rowCount: Math.max(t.rows.length + 60, 200),
            columnCount: Math.max(t.cols.length, 5),
            frozenRowCount: 1,
          },
        },
        fields: 'tabColorStyle,gridProperties(rowCount,columnCount,frozenRowCount)',
      },
    },
  ]
}

/** Look of a new tab: header, column widths and number formats, stripes, filter. */
export function styleRequests(t: TableSpec): object[] {
  const sheetId = t.sheetId
  const reqs: object[] = []
  const cols = t.cols.length

  reqs.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(ACCENT),
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'CLIP',
          textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#ffffff') },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)',
    },
  })
  reqs.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 34 },
      fields: 'pixelSize',
    },
  })

  t.cols.forEach((c, i) => {
    reqs.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: c.width },
        fields: 'pixelSize',
      },
    })
    const nf = c.fmt ? NUMBER_FORMAT[c.fmt] : undefined
    const align = c.fmt === 'center' || c.fmt === 'date' || c.fmt === 'time' ? 'CENTER' : c.fmt === 'int' || c.fmt === 'signed' ? 'RIGHT' : 'LEFT'
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
        cell: {
          userEnteredFormat: {
            ...(nf ? { numberFormat: nf } : {}),
            horizontalAlignment: align,
            verticalAlignment: 'MIDDLE',
            textFormat: { fontSize: 10 },
          },
        },
        fields: `userEnteredFormat(${nf ? 'numberFormat,' : ''}horizontalAlignment,verticalAlignment,textFormat)`,
      },
    })
  })

  const rule = (formula: string) => ({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
          format: { backgroundColor: rgb(STRIPE) },
        },
      },
    },
  })
  if (t.groupCol != null) reqs.push(rule(`=$${colLetter(t.groupCol)}2=1`))
  else reqs.push(rule('=ISEVEN(ROW())'))

  if (t.typeCol != null) {
    const colored: [string, string][] = [
      ['支出', '#d0483f'],
      ['收入', '#2f9e63'],
      ['轉帳', '#8b8a87'],
    ]
    for (const [label, color] of colored) {
      reqs.push({
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: t.typeCol, endColumnIndex: t.typeCol + 1 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: label }] },
              format: { textFormat: { bold: true, foregroundColor: rgb(color) } },
            },
          },
        },
      })
    }
  }

  if (cols > 1) {
    reqs.push({
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: cols } },
      },
    })
  }

  for (const h of t.hiddenCols ?? []) {
    reqs.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: h, endIndex: h + 1 },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    })
  }
  return reqs
}
