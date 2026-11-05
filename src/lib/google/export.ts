/*
 * Turns the app's data into the readable tabs of the spreadsheet. The tabs are a generated view:
 * every sync rewrites them, and the app keeps its own copy in the hidden `_data` tab.
 */
import type { Account, Category, Ledger, Loan, Member, Merchant, Rec, Recurring } from '@/db/types'
import { compareRecords } from '../order'
import { myTotal } from '../split'

/** How a shared bill reads in the sheet, e.g. 平均分：小美、阿傑 */
function splitText(r: Rec, who: (id: string) => string): string {
  const sp = r.split
  if (!sp) return ''
  if (sp.mode === 'other') return `別人付：${sp.payer ? who(sp.payer) : ''}`
  const names = sp.shares.map((x) => (sp.mode === 'custom' ? `${who(x.memberId)} ${x.amount}` : who(x.memberId))).join('、')
  return `${{ even: '平均分', custom: '自訂', advance: '代墊' }[sp.mode]}：${names}`
}
import { accountBalances, accountTwd, amortSchedule, cardCycles, loanOutstanding, spendOn, toEntries } from '../calc'
import { WEEKDAYS, parse, today, ym } from '../date'
import { FREQ_LABEL, nextDue, repeatLabel } from '../recurrence'
import type { Cell } from './sheets'

export interface Snapshot {
  accounts: Account[]
  categories: Category[]
  ledgers: Ledger[]
  records: Rec[]
  merchants: Merchant[]
  recurrings: Recurring[]
  loans: Loan[]
  members: Member[]
}

export type Fmt = 'text' | 'int' | 'signed' | 'date' | 'time' | 'center'

export interface Col {
  title: string
  width: number
  fmt?: Fmt
}

export interface TableSpec {
  title: string
  sheetId: number
  /** tab colour */
  color: string
  cols: Col[]
  rows: Cell[][]
  /** stripe the rows by a 0/1 helper column (one record = one stripe) instead of by row number */
  groupCol?: number
  /** a column whose text 支出 / 收入 / 轉帳 gets a colour */
  typeCol?: number
  hiddenCols?: number[]
}

/** Bump when the layout changes: the tabs are then rebuilt from scratch. */
export const LAYOUT_VERSION = 3

const text = (s: string) => (s ? `'${s}` : '')
const TYPE_LABEL = { expense: '支出', income: '收入', transfer: '轉帳' } as const
const KIND_LABEL = { cash: '現金', bank: '銀行帳戶', card: '信用卡', wallet: '電子錢包' } as const

export function buildTables(s: Snapshot, amortize: boolean): TableSpec[] {
  const cats = new Map(s.categories.map((c) => [c.id, c]))
  const accs = new Map(s.accounts.map((a) => [a.id, a]))
  const ledgers = new Map(s.ledgers.map((l) => [l.id, l]))
  const merchants = new Map(s.merchants.map((m) => [m.id, m]))
  const catParts = (id: string): [string, string] => {
    const c = cats.get(id)
    if (!c) return ['未分類', '']
    const p = c.parentId ? cats.get(c.parentId) : undefined
    return p ? [p.name, c.name] : [c.name, '']
  }
  const people = new Map(s.members.map((m) => [m.id, m.name]))
  const who = (id: string) => people.get(id) ?? '?'
  const ruleIds = new Map(s.recurrings.map((r) => [r.id, r]))
  const recs = [...s.records].sort(compareRecords)

  return [
    guide(),
    detail(recs, { cats, accs, ledgers, merchants, ruleIds, catParts, who }),
    monthly(s, amortize, catParts),
    amortTable(recs, { ledgers, catParts }),
    accountsTable(s),
    loansTable(s.loans, accs, who),
    recurringTable(s.recurrings, accs),
    merchantsTable(s.merchants, cats),
    categoriesTable(s.categories, cats),
    ledgersTable(s, ledgers),
  ]
}

function guide(): TableSpec {
  const lines = [
    '這份試算表由記帳本 App 自動產生，請在 App 內新增、修改記帳資料。',
    '下面各分頁每次同步都會被重新寫入，直接在分頁上修改的內容會在下次同步時被覆蓋。',
    '想自己做分析：複製分頁或新增自己的分頁，用公式引用「明細」即可，不會被覆蓋。',
    '',
    '明細：每個品項一列，同一筆記錄的品項會排在一起並用相同底色，「記錄ID」相同代表同一筆。分帳的記錄另有「我的份額」與分帳方式，有細項的記錄另有「細項」（名稱、數量、小計）。',
    '月報：每個帳本每月的收入、支出、結餘，以及各大分類的支出。支出已依設定決定是否攤提。',
    '攤提：設定攤提的支出，每個月分到的金額。',
    '帳戶：各帳戶目前餘額、信用卡帳單，以及資產與負債合計。',
    '借款：借出與借入的紀錄與還款進度。',
    '週期與分期：週期性交易與分期付款的排程與進度。',
    '商家品項：每個商家記住的品項、分類與常用價格。',
    '分類、帳本：目前的分類架構、預算與各帳本統計。',
    '_data（已隱藏）：App 同步用的原始資料，請不要刪除或修改。',
  ]
  return {
    title: '說明',
    sheetId: 101,
    color: '#8b8a87',
    cols: [{ title: '記帳本', width: 760 }],
    rows: lines.map((l) => [l]),
  }
}

function detail(
  recs: Rec[],
  c: {
    cats: Map<string, Category>
    accs: Map<string, Account>
    ledgers: Map<string, Ledger>
    merchants: Map<string, Merchant>
    ruleIds: Map<string, Recurring>
    catParts: (id: string) => [string, string]
    who: (id: string) => string
  },
): TableSpec {
  const rows: Cell[][] = []
  let group = 0
  for (const r of recs) {
    group = 1 - group
    const base = [
      r.date,
      r.time,
      `週${WEEKDAYS[parse(r.date).getDay()]}`,
      TYPE_LABEL[r.type],
      c.ledgers.get(r.ledgerId)?.name ?? '',
    ] as Cell[]
    const merchant = (r.merchantId && c.merchants.get(r.merchantId)?.name) || ''
    const acc = c.accs.get(r.accountId)?.name ?? ''
    const to = (r.toAccountId && c.accs.get(r.toAccountId)?.name) || ''
    const rule = r.recurringId ? c.ruleIds.get(r.recurringId) : undefined
    const source = !rule ? '手動' : rule.kind === 'installment' ? '分期' : '週期'
    const rid = text(r.id)
    if (r.type === 'transfer') {
      rows.push([...base, merchant, '轉帳', '轉帳', '', r.total, '', '', acc, to, r.note ?? '', '', '', source, rid, group])
      continue
    }
    const ratio = r.total > 0 ? myTotal(r) / r.total : 1
    const shared = splitText(r, c.who)
    r.lines.forEach((l, i) => {
      const [top, sub] = c.catParts(l.categoryId)
      const note = [i === 0 ? r.note : '', l.note].filter(Boolean).join('；')
      const parts = (l.details ?? []).map((d) => `${d.name}${d.qty ? ` ×${d.qty}` : ''}${d.amount ? ` ${d.amount}` : ''}`).join('；')
      rows.push([
        ...base,
        merchant,
        l.name,
        top,
        sub,
        l.amount,
        r.split ? Math.round(l.amount * ratio) : '',
        i === 0 ? shared : '',
        acc,
        '',
        note,
        parts,
        l.amortMonths && l.amortMonths > 1 ? l.amortMonths : '',
        source,
        rid,
        group,
      ])
    })
  }
  return {
    title: '明細',
    sheetId: 102,
    color: '#4ab0e0',
    cols: [
      { title: '日期', width: 95, fmt: 'date' },
      { title: '時間', width: 60, fmt: 'time' },
      { title: '星期', width: 55, fmt: 'center' },
      { title: '類型', width: 60, fmt: 'center' },
      { title: '帳本', width: 80 },
      { title: '商家', width: 120 },
      { title: '品項', width: 180 },
      { title: '分類', width: 90 },
      { title: '子分類', width: 90 },
      { title: '金額', width: 90, fmt: 'int' },
      { title: '我的份額', width: 85, fmt: 'int' },
      { title: '分帳', width: 150 },
      { title: '帳戶', width: 100 },
      { title: '轉入帳戶', width: 100 },
      { title: '備註', width: 200 },
      { title: '細項', width: 200 },
      { title: '攤提月數', width: 75, fmt: 'center' },
      { title: '來源', width: 60, fmt: 'center' },
      { title: '記錄ID', width: 120 },
      { title: '底色', width: 40, fmt: 'center' },
    ],
    rows,
    groupCol: 19,
    typeCol: 3,
    hiddenCols: [19],
  }
}

function monthly(
  s: Snapshot,
  amortize: boolean,
  catParts: (id: string) => [string, string],
): TableSpec {
  const entries = toEntries(s.records, amortize)
  const tops = s.categories
    .filter((c) => c.kind === 'expense' && !c.parentId)
    .sort((a, b) => a.order - b.order)
  const topIndex = new Map(tops.map((c, i) => [c.name, i]))
  const ledgers = [...s.ledgers].sort((a, b) => a.order - b.order)
  const months = new Set<string>([ym(today())])
  for (const e of entries) months.add(e.ym)
  const list = [...months].sort().reverse()

  const rows: Cell[][] = []
  for (const m of list) {
    for (const l of ledgers) {
      const mine = entries.filter((e) => e.ym === m && e.ledgerId === l.id)
      const income = mine.filter((e) => e.type === 'income').reduce((a, e) => a + e.amount, 0)
      const expense = mine.filter((e) => e.type === 'expense').reduce((a, e) => a + e.amount, 0)
      if (!mine.length && m !== ym(today())) continue
      const perCat = Array<number>(tops.length).fill(0)
      for (const e of mine) {
        if (e.type !== 'expense') continue
        const i = topIndex.get(catParts(e.categoryId)[0])
        if (i != null) perCat[i]! += e.amount
      }
      rows.push([text(m), l.name, income, expense, income - expense, ...perCat])
    }
  }
  return {
    title: '月報',
    sheetId: 103,
    color: '#6cc28a',
    cols: [
      { title: '月份', width: 80, fmt: 'center' },
      { title: '帳本', width: 90 },
      { title: '收入', width: 90, fmt: 'int' },
      { title: '支出', width: 90, fmt: 'int' },
      { title: '結餘', width: 90, fmt: 'signed' },
      ...tops.map((t) => ({ title: t.name, width: 80, fmt: 'int' as const })),
    ],
    rows,
  }
}

function amortTable(
  recs: Rec[],
  c: { ledgers: Map<string, Ledger>; catParts: (id: string) => [string, string] },
): TableSpec {
  const rows: Cell[][] = []
  for (const r of recs) {
    if (r.type !== 'expense') continue
    r.lines.forEach((l, i) => {
      const n = l.amortMonths ?? 1
      if (n < 2) return
      const [top, sub] = c.catParts(l.categoryId)
      amortSchedule(r, i).forEach((p, k) => {
        rows.push([
          text(p.ym),
          r.date,
          c.ledgers.get(r.ledgerId)?.name ?? '',
          l.name,
          sub ? `${top} › ${sub}` : top,
          p.amount,
          l.amount,
          `${k + 1} / ${n}`,
          text(r.id),
        ])
      })
    })
  }
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])))
  return {
    title: '攤提',
    sheetId: 104,
    color: '#e8b84a',
    cols: [
      { title: '攤提月份', width: 85, fmt: 'center' },
      { title: '消費日期', width: 95, fmt: 'date' },
      { title: '帳本', width: 80 },
      { title: '品項', width: 180 },
      { title: '分類', width: 140 },
      { title: '該月金額', width: 90, fmt: 'int' },
      { title: '總金額', width: 90, fmt: 'int' },
      { title: '期別', width: 70, fmt: 'center' },
      { title: '記錄ID', width: 120 },
    ],
    rows,
  }
}

function accountsTable(s: Snapshot): TableSpec {
  const bal = accountBalances(s.accounts, s.records, s.loans)
  const day = today()
  const rows: Cell[][] = []
  let assets = 0
  let liabilities = 0
  for (const a of [...s.accounts].sort((x, y) => x.order - y.order)) {
    // this table is in TWD: a foreign wallet is worth its balance at its rate
    const b = accountTwd(a, bal.get(a.id) ?? 0)
    if (b >= 0) assets += b
    else liabilities += b
    let prev: Cell = ''
    let cur: Cell = ''
    if (a.kind === 'card' && a.statementDay) {
      const cy = cardCycles(a.statementDay, day)
      prev = spendOn(a.id, s.records, cy.prev.start, cy.prev.end)
      cur = spendOn(a.id, s.records, cy.cur.start, cy.cur.end)
    }
    rows.push([
      a.name,
      KIND_LABEL[a.kind],
      b,
      a.initial,
      a.statementDay ?? '',
      a.dueDay ?? '',
      prev,
      cur,
      a.archived ? '已封存' : '',
    ])
  }
  let receivable = 0
  let payable = 0
  for (const l of s.loans) {
    const o = loanOutstanding(l)
    if (l.direction === 'lend') receivable += o
    else payable += o
  }
  rows.push(['', '', '', '', '', '', '', '', ''])
  rows.push(['資產合計', '', assets + receivable, '', '', '', '', '', `含應收借款 ${receivable}`])
  rows.push(['負債合計', '', liabilities - payable, '', '', '', '', '', `含應付借款 ${payable}`])
  rows.push(['淨資產', '', assets + receivable + liabilities - payable, '', '', '', '', '', ''])
  return {
    title: '帳戶',
    sheetId: 105,
    color: '#a08bd8',
    cols: [
      { title: '帳戶', width: 130 },
      { title: '類型', width: 90, fmt: 'center' },
      { title: '目前餘額', width: 100, fmt: 'signed' },
      { title: '初始餘額', width: 100, fmt: 'signed' },
      { title: '結帳日', width: 65, fmt: 'center' },
      { title: '繳款日', width: 65, fmt: 'center' },
      { title: '上期帳單', width: 95, fmt: 'int' },
      { title: '本期累計', width: 95, fmt: 'int' },
      { title: '備註', width: 160 },
    ],
    rows,
  }
}

function loansTable(loans: Loan[], accs: Map<string, Account>, who: (id: string) => string): TableSpec {
  const day = today()
  const rows = [...loans]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((l): Cell[] => {
      const paid = l.repayments.reduce((s, p) => s + p.amount, 0)
      const left = l.principal - paid
      const status = left <= 0 ? '已結清' : l.dueDate && l.dueDate < day ? '已逾期' : '未結清'
      const history = l.repayments.map((p) => `${p.date} ${p.amount}`).join('；')
      return [
        l.direction === 'lend' ? '借出' : '借入',
        who(l.personId),
        l.date,
        l.dueDate ?? '',
        l.principal,
        paid,
        left,
        status,
        (l.accountId && accs.get(l.accountId)?.name) || '',
        l.note ?? '',
        history,
      ]
    })
  return {
    title: '借款',
    sheetId: 106,
    color: '#e0707a',
    cols: [
      { title: '方向', width: 60, fmt: 'center' },
      { title: '對象', width: 110 },
      { title: '日期', width: 95, fmt: 'date' },
      { title: '到期日', width: 95, fmt: 'date' },
      { title: '金額', width: 90, fmt: 'int' },
      { title: '已還', width: 90, fmt: 'int' },
      { title: '未還', width: 90, fmt: 'int' },
      { title: '狀態', width: 75, fmt: 'center' },
      { title: '帳戶', width: 100 },
      { title: '備註', width: 160 },
      { title: '還款紀錄', width: 260 },
    ],
    rows,
  }
}

function recurringTable(rules: Recurring[], accs: Map<string, Account>): TableSpec {
  const rows = [...rules]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r): Cell[] => {
      const next = nextDue(r) ?? ''
      const per = r.installment
        ? Math.round(r.installment.total / r.installment.periods) + r.installment.fee
        : r.template.lines.reduce((s, l) => s + l.amount, 0)
      const done = r.count != null && r.generated >= r.count
      return [
        r.name,
        r.kind === 'installment' ? '分期' : '週期',
        r.kind === 'installment' ? FREQ_LABEL.monthly : repeatLabel(r),
        next,
        per,
        r.count != null ? `${r.generated} / ${r.count}` : `${r.generated}`,
        r.installment ? r.installment.total : '',
        accs.get(r.template.accountId)?.name ?? '',
        done ? '已完成' : r.active ? '進行中' : '已暫停',
        r.autoPost ? '自動入帳' : '需確認',
        r.startDate,
      ]
    })
  return {
    title: '週期與分期',
    sheetId: 107,
    color: '#4cc2b8',
    cols: [
      { title: '名稱', width: 160 },
      { title: '種類', width: 60, fmt: 'center' },
      { title: '頻率', width: 80, fmt: 'center' },
      { title: '下次日期', width: 95, fmt: 'date' },
      { title: '每期金額', width: 90, fmt: 'int' },
      { title: '進度', width: 70, fmt: 'center' },
      { title: '分期總額', width: 90, fmt: 'int' },
      { title: '帳戶', width: 100 },
      { title: '狀態', width: 75, fmt: 'center' },
      { title: '入帳方式', width: 80, fmt: 'center' },
      { title: '開始日期', width: 95, fmt: 'date' },
    ],
    rows,
  }
}

function merchantsTable(list: Merchant[], cats: Map<string, Category>): TableSpec {
  const name = (id: string) => {
    const c = cats.get(id)
    if (!c) return ''
    const p = c.parentId ? cats.get(c.parentId) : undefined
    return p ? `${p.name} › ${c.name}` : c.name
  }
  const rows: Cell[][] = []
  for (const m of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!m.items.length) rows.push([m.name, '', '', '', '', ''])
    for (const i of [...m.items].sort((a, b) => b.count - a.count)) {
      rows.push([m.name, i.name, name(i.categoryId), i.price, i.count, i.lastUsed])
    }
  }
  return {
    title: '商家品項',
    sheetId: 108,
    color: '#f0a050',
    cols: [
      { title: '商家', width: 140 },
      { title: '品項', width: 180 },
      { title: '分類', width: 140 },
      { title: '最近價格', width: 90, fmt: 'int' },
      { title: '次數', width: 60, fmt: 'center' },
      { title: '最近使用', width: 95, fmt: 'date' },
    ],
    rows,
  }
}

function categoriesTable(list: Category[], cats: Map<string, Category>): TableSpec {
  const rows: Cell[][] = []
  const sorted = [...list].sort((a, b) => a.order - b.order)
  for (const kind of ['expense', 'income'] as const) {
    for (const c of sorted.filter((x) => x.kind === kind)) {
      const p = c.parentId ? cats.get(c.parentId) : undefined
      rows.push([
        kind === 'expense' ? '支出' : '收入',
        p ? p.name : c.name,
        p ? c.name : '',
        c.budget || '',
      ])
    }
  }
  return {
    title: '分類',
    sheetId: 109,
    color: '#ee7f9b',
    cols: [
      { title: '類型', width: 60, fmt: 'center' },
      { title: '分類', width: 120 },
      { title: '子分類', width: 120 },
      { title: '每月預算', width: 90, fmt: 'int' },
    ],
    rows,
  }
}

function ledgersTable(s: Snapshot, ledgers: Map<string, Ledger>): TableSpec {
  const rows = [...ledgers.values()]
    .sort((a, b) => a.order - b.order)
    .map((l): Cell[] => {
      const mine = s.records.filter((r) => r.ledgerId === l.id && !r.adjust)
      const income = mine.filter((r) => r.type === 'income').reduce((a, r) => a + r.total, 0)
      const expense = mine.filter((r) => r.type === 'expense').reduce((a, r) => a + myTotal(r), 0)
      return [l.name, l.currency ?? 'TWD', l.budget || '', mine.length, income, expense, income - expense]
    })
  return {
    title: '帳本',
    sheetId: 110,
    color: '#b58b6a',
    cols: [
      { title: '帳本', width: 130 },
      { title: '幣別', width: 60, fmt: 'center' },
      { title: '每月預算', width: 90, fmt: 'int' },
      { title: '筆數', width: 60, fmt: 'center' },
      { title: '總收入', width: 100, fmt: 'int' },
      { title: '總支出', width: 100, fmt: 'int' },
      { title: '結餘', width: 100, fmt: 'signed' },
    ],
    rows,
  }
}
