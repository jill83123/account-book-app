import { db, markLocalChange, stamp } from '@/db'
import type { Account, Category, CategoryKind, Ledger } from '@/db/types'
import { uid } from './id'
import { P } from './colors'

interface Group {
  name: string
  icon: string
  color: string
  kids: [name: string, icon: string][]
}

const EXPENSE: Group[] = [
  {
    name: '飲食',
    icon: 'utensils',
    color: P.orange,
    kids: [
      ['早餐', 'croissant'],
      ['午餐', 'utensils'],
      ['晚餐', 'soup'],
      ['食材', 'egg'],
      ['飲料', 'coffee'],
      ['零食', 'cookie'],
      ['宵夜', 'moon'],
    ],
  },
  {
    name: '交通',
    icon: 'bus',
    color: P.blue,
    kids: [
      ['大眾運輸', 'train'],
      ['加油', 'fuel'],
      ['停車', 'parking'],
      ['計程車', 'car'],
      ['車輛保養', 'wrench'],
      ['過路費', 'road'],
    ],
  },
  {
    name: '居家',
    icon: 'house',
    color: P.brown,
    kids: [
      ['房租', 'house'],
      ['水電瓦斯', 'zap'],
      ['日用品', 'pumpsoap'],
      ['家具家電', 'plug'],
      ['修繕', 'wrench'],
      ['電信網路', 'wifi'],
      ['管理費', 'building'],
    ],
  },
  {
    name: '購物',
    icon: 'bag',
    color: P.pink,
    kids: [
      ['服飾', 'shirt'],
      ['3C', 'phone'],
      ['美妝保養', 'sparkles'],
      ['禮物', 'gift'],
    ],
  },
  {
    name: '娛樂',
    icon: 'game',
    color: P.violet,
    kids: [
      ['串流訂閱', 'tv'],
      ['旅遊', 'plane'],
      ['遊戲', 'game'],
      ['電影展演', 'film'],
    ],
  },
  {
    name: '健康',
    icon: 'heartpulse',
    color: P.teal,
    kids: [
      ['掛號看診', 'stethoscope'],
      ['藥品', 'pill'],
      ['保健食品', 'capsules'],
      ['運動', 'dumbbell'],
    ],
  },
  {
    name: '學習',
    icon: 'book',
    color: P.yellow,
    kids: [
      ['書籍', 'book'],
      ['課程', 'teacher'],
    ],
  },
  {
    name: '人情',
    icon: 'handshake',
    color: P.crimson,
    kids: [
      ['紅包禮金', 'gift'],
      ['請客', 'users'],
      ['孝親費', 'heart'],
      ['捐款', 'charity'],
    ],
  },
  {
    name: '寵物',
    icon: 'paw',
    color: P.lime,
    kids: [
      ['飼料零食', 'soup'],
      ['寵物醫療', 'stethoscope'],
      ['寵物用品', 'bone'],
    ],
  },
  {
    name: '育兒',
    icon: 'baby',
    color: P.blush,
    kids: [
      ['奶粉尿布', 'baby'],
      ['托育教育', 'children'],
      ['玩具', 'puzzle'],
    ],
  },
  {
    name: '金融',
    icon: 'landmark',
    color: P.navy,
    kids: [
      ['保險', 'shield'],
      ['手續費', 'receipt'],
      ['利息', 'percent'],
      ['稅金', 'landmark'],
      ['貸款還款', 'handcoins'],
    ],
  },
  {
    name: '投資',
    icon: 'trending',
    color: P.forest,
    kids: [
      ['股票', 'trending'],
      ['基金', 'coins'],
    ],
  },
  { name: '其他', icon: 'more', color: P.gray, kids: [] },
]

const INCOME: Group[] = [
  {
    name: '工作收入',
    icon: 'briefcase',
    color: P.blue,
    kids: [
      ['薪資', 'banknote'],
      ['獎金', 'coins'],
      ['兼職', 'briefcase'],
    ],
  },
  {
    name: '投資收益',
    icon: 'trending',
    color: P.forest,
    kids: [
      ['股利配息', 'coins'],
      ['租金收入', 'house'],
      ['買賣價差', 'trending'],
    ],
  },
  {
    name: '利息收入',
    icon: 'piggy',
    color: P.yellow,
    kids: [
      ['活存利息', 'piggy'],
      ['定存利息', 'landmark'],
    ],
  },
  {
    name: '退款與補貼',
    icon: 'recycle',
    color: P.violet,
    kids: [
      ['退款', 'recycle'],
      ['退稅', 'receipt'],
      ['補助', 'handcoins'],
    ],
  },
  { name: '其他收入', icon: 'more', color: P.gray, kids: [] },
]

export function defaultCategories(): Category[] {
  const out: Category[] = []
  const t = stamp()
  let order = 0
  const add = (c: Omit<Category, 'id' | 'updatedAt' | 'order'>) => {
    const cat: Category = { ...c, id: uid(), updatedAt: t, order: order++ }
    out.push(cat)
    return cat
  }
  for (const [kind, groups] of [['expense', EXPENSE], ['income', INCOME]] as [CategoryKind, Group[]][]) {
    for (const g of groups) {
      const p = add({ name: g.name, kind, parentId: null, icon: g.icon, color: g.color })
      for (const [name, icon] of g.kids) {
        add({ name, kind, parentId: p.id, icon, color: g.color })
      }
    }
  }
  return out
}

/**
 * Put the starter income categories into groups, once. Existing categories keep their ids, so records stay where they
 * are; 投資收益 becomes the group itself. Skipped when any income category already has a parent (the person has
 * arranged them already).
 */
export async function groupStarterIncome(): Promise<void> {
  const cats = await db.categories.filter((c) => !c.deleted && c.kind === 'income').toArray()
  if (cats.some((c) => c.parentId !== null)) return
  const t = stamp()
  const all = new Map<string, Category>(cats.map((c) => [c.id, c]))
  const dirty = new Set<string>()
  const put = (c: Category) => {
    all.set(c.id, { ...c, updatedAt: t })
    dirty.add(c.id)
  }
  for (const g of INCOME) {
    if (!g.kids.length) continue
    let parent = [...all.values()].find((c) => c.parentId === null && c.name === g.name)
    if (!parent) {
      parent = { id: uid(), name: g.name, kind: 'income', parentId: null, icon: g.icon, color: g.color, order: 0, updatedAt: t }
      put(parent)
    }
    let n = 0
    for (const [name, icon] of g.kids) {
      const old = [...all.values()].find((c) => c.parentId === null && c.name === name && c.id !== parent.id)
      if (old) put({ ...old, parentId: parent.id, order: n++ })
      else put({ id: uid(), name, kind: 'income', parentId: parent.id, icon, color: g.color, order: n++, updatedAt: t })
    }
  }
  orderIncomeTops(all, put)
  if (!dirty.size) return
  await db.categories.bulkPut([...dirty].map((id) => all.get(id)!))
  markLocalChange()
}

/** the groups first, anything the person added after them, the catch-all 其他 last */
function orderIncomeTops(all: Map<string, Category>, put: (c: Category) => void) {
  const rank = (c: Category): [number, number] => {
    const i = INCOME.findIndex((g) => g.name === c.name && g.kids.length)
    return i >= 0 ? [0, i] : c.name.startsWith('其他') ? [2, 0] : [1, c.order]
  }
  const tops = [...all.values()].filter((c) => c.parentId === null).sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])
  tops.forEach((c, i) => {
    if (c.order !== i) put({ ...c, order: i })
  })
}

/**
 * Savings interest is not investment income: lift 利息收入 out of 投資收益 into a group of its own, once. Only for data
 * that groupStarterIncome already arranged the first way; the category keeps its id.
 */
export async function splitInterestIncome(): Promise<void> {
  const cats = await db.categories.filter((c) => !c.deleted && c.kind === 'income').toArray()
  const interest = cats.find((c) => c.name === '利息收入' && c.parentId !== null)
  if (!interest || cats.find((c) => c.id === interest.parentId)?.name !== '投資收益') return
  const group = INCOME.find((g) => g.name === '利息收入')!
  const t = stamp()
  const all = new Map<string, Category>(cats.map((c) => [c.id, c]))
  const dirty = new Set<string>()
  const put = (c: Category) => {
    all.set(c.id, { ...c, updatedAt: t })
    dirty.add(c.id)
  }
  put({ ...interest, parentId: null })
  group.kids.forEach(([name, icon], i) => {
    put({ id: uid(), name, kind: 'income', parentId: interest.id, icon, color: interest.color, order: i, updatedAt: t })
  })
  orderIncomeTops(all, put)
  await db.categories.bulkPut([...dirty].map((id) => all.get(id)!))
  markLocalChange()
}

/** Bumped whenever refreshStarterCategories has something new to do; each device runs it once per version. */
export const STARTER_VERSION = 13

/** Names the starter set changed, as [the old name, the new one]; only a sub-category under 交通 is renamed. */
const RENAMES: [string, string][] = [
  ['車輛維護', '車輛保養'],
  ['保養', '車輛保養'],
]

/** Icons the starter set changed, as [name, the icon it used to have, the one it has now]. */
const ICON_CHANGES: [string, string, string][] = [
  ['食材', 'basket', 'egg'],
  ['食材', 'carrot', 'egg'],
  ['食材', 'apple', 'egg'],
  ['食材', 'fish', 'egg'],
  ['飲料', 'cupsoda', 'coffee'],
  ['房租', 'building', 'house'],
  ['房租', 'key', 'house'],
  ['房租', 'contract', 'house'],
  ['日用品', 'package', 'pumpsoap'],
  ['保健食品', 'leaf', 'capsules'],
  ['課程', 'graduation', 'teacher'],
  ['飼料零食', 'bone', 'soup'],
  ['寵物用品', 'boxopen', 'bone'],
  ['奶粉尿布', 'milk', 'baby'],
  ['奶粉尿布', 'stroller', 'baby'],
  ['家具家電', 'sofa', 'plug'],
  ['家具家電', 'bed', 'plug'],
  ['家具家電', 'kitchenset', 'plug'],
  ['托育教育', 'school', 'children'],
  ['車輛維護', 'oilcan', 'wrench'],
  ['保養', 'oilcan', 'wrench'],
  ['車輛保養', 'oilcan', 'wrench'],
  ['車輛維護', 'screwdriver', 'wrench'],
  ['保養', 'screwdriver', 'wrench'],
  ['車輛保養', 'screwdriver', 'wrench'],
]

/**
 * Starter groups whose colour changed so each one reads as what it is, as [name, every colour the starter set has
 * used for it, the colour it has now]. A group still wearing one of the old colours gets the new one, and so do its
 * sub-categories that share it. A colour the person picked themselves is left alone.
 */
const RECOLORS: [string, string[], string][] = [
  ['居家', [P.green, '#aa7a4e', '#9c6f46', '#b38761', '#cba989'], P.brown],
  ['購物', [P.pink, P.magenta, '#be79b4'], P.pink],
  ['人情', [P.red, '#d9524e', '#d27674'], P.crimson],
  ['寵物', [P.orange, '#aa7a4e', '#9c6f46'], P.lime],
  ['育兒', [P.pink, P.lime], P.blush],
  ['金融', [P.indigo, '#4275d7', '#6a91d9'], P.navy],
  ['投資', [P.magenta, '#ba5ab8', '#be79b4', '#58a56a'], P.forest],
  ['工作收入', [P.green], P.blue],
  ['投資收益', [P.violet, '#9369dd', '#58a56a'], P.forest],
  ['利息收入', [P.teal], P.yellow],
  ['退款與補貼', [P.indigo, P.blue], P.violet],
]

/**
 * Bring data made from an earlier starter set in line with the current one, once: a starter icon that is still the old
 * one becomes the new one, 牙科 goes unless a record uses it, and 運動 moves from 娛樂 (once 休閒) to 健康. Anything the person
 * changed themselves (another icon, another parent) is left as it is.
 */
export async function refreshStarterCategories(): Promise<void> {
  const allCats = await db.categories.filter((c) => !c.deleted).toArray()
  const cats = allCats.filter((c) => c.kind === 'expense')
  // one record per category, so two changes to the same one (a new icon and a new name) both land
  const edits = new Map<string, Category>()
  const t = stamp()
  const patch = (c: Category, p: Partial<Category>) => edits.set(c.id, { ...(edits.get(c.id) ?? c), ...p, updatedAt: t })
  for (const [name, from, to] of ICON_CHANGES) {
    for (const c of cats) if (c.name === name && c.icon === from) patch(c, { icon: to })
  }
  const byName = (name: string) => cats.find((c) => c.parentId === null && c.name === name)
  const transport = byName('交通')
  for (const [from, to] of RENAMES) {
    const c = cats.find((x) => x.name === from && transport && x.parentId === transport.id)
    // not when the person already has one by the new name
    if (c && !cats.some((x) => x.name === to && x.parentId === c.parentId)) patch(c, { name: to })
  }
  // 休閒 is called 娛樂 now, unless the person already has one by that name
  const oldLeisure = byName('休閒')
  if (oldLeisure && !byName('娛樂')) patch(oldLeisure, { name: '娛樂' })
  // read before any edit, so a colour that moves on does not match the next group down the list
  for (const [name, olds, to] of RECOLORS) {
    const top = allCats.find((c) => c.parentId === null && c.name === name)
    if (!top || top.color === to || !olds.includes(top.color)) continue
    patch(top, { color: to })
    for (const c of allCats) if (c.parentId === top.id && olds.includes(c.color)) patch(c, { color: to })
  }
  const leisure = oldLeisure ?? byName('娛樂')
  const health = byName('健康')
  const sport = cats.find((c) => c.name === '運動' && leisure && c.parentId === leisure.id)
  if (sport && leisure && health) {
    const last = cats.filter((c) => c.parentId === health.id).reduce((m, c) => Math.max(m, c.order), 0)
    patch(sport, { parentId: health.id, color: sport.color === leisure.color ? health.color : sport.color, order: last + 1 })
  }
  const tooth = cats.find((c) => c.name === '牙科' && c.parentId !== null)
  if (tooth) {
    const used = await db.records.filter((r) => !r.deleted && r.lines.some((l) => l.categoryId === tooth.id)).first()
    if (!used) patch(tooth, { deleted: true })
  }
  // 股利 and 基金配息 are one thing for most people: 股利 becomes 股利配息 and an unused 基金配息 goes
  const income = await db.categories.filter((c) => !c.deleted && c.kind === 'income').toArray()
  const invest = income.find((c) => c.parentId === null && c.name === '投資收益')
  const under = (name: string) => income.find((c) => invest && c.parentId === invest.id && c.name === name)
  const dividend = under('股利')
  if (dividend && !under('股利配息')) patch(dividend, { name: '股利配息' })
  const fundPayout = under('基金配息')
  if (fundPayout) {
    const used = await db.records.filter((r) => !r.deleted && r.lines.some((l) => l.categoryId === fundPayout.id)).first()
    if (!used) patch(fundPayout, { deleted: true })
  }
  if (!edits.size) return
  await db.categories.bulkPut([...edits.values()])
  markLocalChange()
}

/**
 * Move the catch-all 其他 categories to the end of their lists, once. Anything added later (like 投資) had been
 * appended after it. Only the order changes, and only when something actually has to move.
 */
export async function moveOtherLast(): Promise<void> {
  const all = await db.categories.filter((c) => !c.deleted && c.parentId === null).toArray()
  const changed: Category[] = []
  for (const kind of ['expense', 'income'] as CategoryKind[]) {
    const list = all.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order)
    const sorted = [...list.filter((c) => !c.name.startsWith('其他')), ...list.filter((c) => c.name.startsWith('其他'))]
    sorted.forEach((c, i) => {
      if (c.order !== i) changed.push({ ...c, order: i, updatedAt: stamp() })
    })
  }
  if (changed.length) {
    await db.categories.bulkPut(changed)
    markLocalChange()
  }
}

/** The starter ledger used to be blue like the theme and the account tags; make it teal unless it was recoloured by hand. */
export async function recolorStarterLedger(): Promise<void> {
  const l = await db.ledgers.filter((x) => !x.deleted && x.name === '日常' && x.color === P.blue).first()
  if (!l) return
  await db.ledgers.put({ ...l, color: P.teal, updatedAt: stamp() })
  markLocalChange()
}

/** Add starter data on the very first run. Returns true when it did. */
export async function seedIfEmpty(): Promise<boolean> {
  const existing = await db.ledgers.count()
  if (existing > 0) return false
  const t = stamp()
  const ledger: Ledger = { id: uid(), name: '日常', order: 0, color: P.teal, updatedAt: t }
  const accounts: Account[] = [
    { id: uid(), name: '錢包', kind: 'cash', initial: 0, order: 0, color: P.green, updatedAt: t },
    { id: uid(), name: '銀行帳戶', kind: 'bank', initial: 0, order: 1, color: P.blue, updatedAt: t },
    {
      id: uid(),
      name: '信用卡',
      kind: 'card',
      initial: 0,
      order: 2,
      color: P.pink,
      statementDay: 1,
      dueDay: 15,
      updatedAt: t,
    },
  ]
  await db.transaction('rw', [db.ledgers, db.accounts, db.categories], async () => {
    await db.ledgers.add(ledger)
    await db.accounts.bulkAdd(accounts)
    await db.categories.bulkAdd(defaultCategories())
  })
  markLocalChange()
  return true
}
