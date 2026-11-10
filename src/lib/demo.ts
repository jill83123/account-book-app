import { db, markLocalChange, remove, save, saveMany, stamp } from '@/db'
import type { Account, Category, CategoryKind, Ledger, Line, Loan, Rec, Recurring, RecordType } from '@/db/types'
import { addDays, today } from './date'
import { uid } from './id'
import { sharesFor } from './split'
import { learn } from './merchants'
import { buildRecord } from './recurrence'
import { P } from './colors'
import { moveOtherLast } from './seed'
import { ensureMembers } from './members'

/** [item name, category name, amount (in the entry's own currency), months to spread over, its parts as [name, amount]] */
type L = [name: string, category: string, amount: number, amortMonths?: number, parts?: [name: string, amount: number][]]

interface Entry {
  /** days before today */
  ago: number
  time: string
  type?: RecordType
  account: string
  to?: string
  ledger?: string
  shop?: string
  lines?: L[]
  /** transfers only */
  amount?: number
  note?: string
  /** who it was spent with */
  with?: string[]
  /** a shared bill: the people in `with` pay their parts back; `repaid` is what they have already given back */
  split?: 'even' | 'advance' | 'other'
  /** `other`: who paid it */
  payer?: string
  repaid?: Record<string, number>
}


/** the trip's ledger: the year is in the name, so a later trip gets its own */
const TRIP = '2026.09 日本'

const ENTRIES: Entry[] = [
  // income
  { ago: 20, time: '18:30', type: 'income', account: '銀行帳戶', lines: [['績效獎金', '獎金', 5000]] },
  { ago: 15, time: '12:00', type: 'income', account: '證券戶', lines: [['0050 股利', '投資收益', 2400]] },
  { ago: 3, time: '20:00', type: 'income', account: '銀行帳戶', lines: [['家教', '兼職', 1800]] },
  // transfers
  { ago: 33, time: '10:00', type: 'transfer', account: '銀行帳戶', to: '證券戶', amount: 30000, note: '證券戶入金' },
  { ago: 32, time: '10:30', type: 'transfer', account: '銀行帳戶', to: '錢包', amount: 3000, note: '提款' },
  // stocks and funds
  { ago: 31, time: '09:30', account: '證券戶', shop: '元大證券', lines: [['0050 買進', '股票', 12000], ['手續費', '手續費', 20]] },
  { ago: 14, time: '10:10', account: '證券戶', shop: '元大證券', lines: [['台積電 買進', '股票', 8000], ['手續費', '手續費', 20]] },
  { ago: 9, time: '10:00', account: '證券戶', shop: '元大證券', lines: [['ETF 定期定額', '基金', 3000]] },
  // home
  { ago: 12, time: '14:00', account: '信用卡', shop: 'IKEA', lines: [['桌燈', '家具家電', 799], ['收納盒', '日用品', 299]] },
  { ago: 26, time: '11:00', account: '錢包', shop: '五金行', lines: [['LED 燈泡', '修繕', 120]] },
  // food
  { ago: 0, time: '08:10', account: '錢包', shop: '美而美', lines: [['', '早餐', 60, undefined, [['蛋餅', 35], ['奶茶', 25]]]] },
  { ago: 1, time: '12:20', account: '錢包', shop: '池上便當', lines: [['', '午餐', 95, undefined, [['排骨便當', 75], ['燙青菜', 20]]]] },
  { ago: 1, time: '19:10', account: '信用卡', shop: '鼎泰豐', with: ['小美'], split: 'even', lines: [['', '晚餐', 680, undefined, [['小籠包', 420], ['蝦仁炒飯', 260]]]] },
  { ago: 2, time: '15:30', account: '錢包', shop: '五十嵐', lines: [['珍珠奶茶', '飲料', 60]] },
  { ago: 3, time: '23:00', account: '錢包', shop: '鹽酥雞', lines: [['鹽酥雞', '宵夜', 120]] },
  { ago: 4, time: '12:15', account: '錢包', shop: '麥當勞', lines: [['', '午餐', 169, undefined, [['大麥克', 79], ['薯條', 45], ['可樂', 45]]]] },
  { ago: 5, time: '18:40', account: '信用卡', shop: '全聯', lines: [['蔬菜', '食材', 230], ['牛奶', '食材', 85], ['洗碗精', '日用品', 49]] },
  { ago: 6, time: '08:00', account: '錢包', shop: '7-ELEVEN', lines: [['', '早餐', 80, undefined, [['御飯糰', 35], ['咖啡', 45]]]] },
  {
    ago: 7,
    time: '16:20',
    account: '信用卡',
    shop: '好市多',
    lines: [['杏鮑菇', '食材', 120], ['蘋果汁', '飲料', 150], ['洋芋片', '零食', 100], ['冷凍牛排', '食材', 680], ['衛生紙', '日用品', 359]],
  },
  { ago: 13, time: '12:00', account: '錢包', shop: '八方雲集', lines: [['', '午餐', 120, undefined, [['鍋貼', 90], ['酸辣湯', 30]]]] },
  { ago: 16, time: '19:30', account: '信用卡', shop: '老井燒肉', with: ['阿傑', '小美', '大雄'], split: 'even', repaid: { 阿傑: 370, 小美: 200 }, lines: [['同事聚餐', '請客', 1480]] },
  { ago: 3, time: '20:30', account: '錢包', shop: '威秀影城', with: ['小美'], split: 'other', payer: '小美', lines: [['電影票', '娛樂', 280]] },
  { ago: 6, time: '15:20', account: '信用卡', shop: '蝦皮購物', with: ['阿傑'], split: 'advance', lines: [['代買保健食品', '健康', 850]] },
  { ago: 18, time: '10:00', account: '信用卡', shop: '好市多', lines: [['雞胸肉', '食材', 420], ['氣泡水', '飲料', 199], ['巧克力', '零食', 250]] },
  { ago: 25, time: '08:20', account: '錢包', shop: '早餐店', lines: [['', '早餐', 55, undefined, [['三明治', 35], ['紅茶', 20]]]] },
  // transport
  { ago: 2, time: '09:00', account: '錢包', shop: '悠遊卡', lines: [['加值', '大眾運輸', 500]] },
  { ago: 8, time: '17:00', account: '信用卡', shop: '中油', lines: [['95 無鉛汽油', '加油', 600]] },
  { ago: 8, time: '17:30', account: '錢包', shop: '停車場', lines: [['停車費', '停車', 80]] },
  { ago: 11, time: '23:30', account: '信用卡', shop: 'Uber', lines: [['夜間叫車', '計程車', 220]] },
  { ago: 17, time: '07:30', account: '信用卡', shop: '台灣高鐵', lines: [['台北到台中', '大眾運輸', 700]] },
  // shopping
  { ago: 10, time: '20:00', account: '信用卡', shop: 'UNIQLO', lines: [['防風外套', '服飾', 1290]] },
  { ago: 19, time: '21:30', account: '信用卡', shop: '蝦皮購物', lines: [['藍牙耳機', '3C', 1590]] },
  { ago: 23, time: '15:00', account: '錢包', shop: '屈臣氏', lines: [['化妝水', '美妝保養', 480], ['護手霜', '美妝保養', 199]] },
  { ago: 27, time: '14:00', account: '錢包', shop: '誠品', lines: [['朋友生日禮物', '禮物', 600]] },
  // leisure
  { ago: 15, time: '22:00', account: '信用卡', shop: 'Steam', lines: [['單機遊戲', '遊戲', 330]] },
  // health, learning, people, finance
  { ago: 21, time: '10:00', account: '錢包', shop: '家庭診所', lines: [['掛號費', '掛號看診', 150], ['藥費', '藥品', 250]] },
  { ago: 12, time: '13:00', account: '信用卡', shop: '博客來', lines: [['原子習慣', '書籍', 380], ['被討厭的勇氣', '書籍', 320]] },
  { ago: 26, time: '22:00', account: '信用卡', shop: 'Udemy', lines: [['Python 課程', '課程', 490]] },
  { ago: 20, time: '12:00', account: '錢包', lines: [['同事婚禮紅包', '紅包禮金', 2000]] },
  { ago: 40, time: '10:00', account: '銀行帳戶', shop: '富邦產險', lines: [['機車保險（年繳）', '保險', 12000, 12]] },
  // a trip: what was spent there is written down in yen in the trip's own ledger, with no account; back home, the whole trip is one entry in TWD in the everyday ledger, in one category, with its parts as details
  { ago: 43, time: '09:10', account: '', ledger: TRIP, shop: '全家便利商店', lines: [['', '早餐', 500, undefined, [['御飯糰', 360], ['熱咖啡', 140]]]] },
  { ago: 43, time: '10:00', account: '', ledger: TRIP, shop: 'Suica', lines: [['交通卡加值', '大眾運輸', 3000]] },
  { ago: 43, time: '12:40', account: '', ledger: TRIP, shop: '築地銀だこ', lines: [['章魚燒', '零食', 680]] },
  { ago: 43, time: '19:20', account: '', ledger: TRIP, shop: '串カツ田中', with: ['小美'], lines: [['', '晚餐', 3600, undefined, [['串炸套餐', 2800], ['啤酒', 800]]]] },
  { ago: 42, time: '13:00', account: '', ledger: TRIP, shop: '一蘭拉麵', with: ['小美'], lines: [['', '午餐', 1180, undefined, [['拉麵', 980], ['加麵', 200]]]] },
  { ago: 42, time: '16:30', account: '', ledger: TRIP, shop: 'teamLab', with: ['小美'], lines: [['門票 2 張', '旅遊', 7600]] },
  { ago: 42, time: '19:00', account: '', ledger: TRIP, shop: '唐吉訶德', with: ['小美'], lines: [['藥妝', '美妝保養', 9800], ['零食', '零食', 3000]] },
  { ago: 42, time: '22:00', account: '', ledger: TRIP, shop: 'ローソン', lines: [['飲料', '飲料', 420]] },
  { ago: 41, time: '10:00', account: '', ledger: TRIP, shop: '星巴克', lines: [['咖啡', '飲料', 650]] },
  { ago: 41, time: '12:30', account: '', ledger: TRIP, shop: '吉野家', lines: [['牛丼', '午餐', 580]] },
  { ago: 41, time: '17:00', account: '', ledger: TRIP, shop: '機場免稅店', lines: [['伴手禮', '禮物', 15000]] },
  { ago: 40, time: '20:00', account: '信用卡', note: '回國後一次記', lines: [['日本旅遊', '旅遊', 35930, undefined, [['來回機票', 9800], ['住宿 4 晚', 16000], ['餐飲', 1680], ['交通', 660], ['藥妝、零食', 2820], ['teamLab 門票', 1670], ['伴手禮', 3300]]]] },
  // breakfasts: one item in one category, written down in parts
  { ago: 0, time: '08:05', account: '錢包', shop: '麥當勞', lines: [['', '早餐', 85, undefined, [['麥香雞堡', 55], ['紅茶', 30]]]] },
  { ago: 2, time: '07:50', account: '錢包', shop: '美而美', lines: [['', '早餐', 75, undefined, [['豬排蛋吐司', 45], ['奶茶', 30]]]] },
  { ago: 3, time: '08:20', account: '錢包', shop: '早餐店', lines: [['', '早餐', 85, undefined, [['鐵板麵', 55], ['蛋餅', 30]]]] },
  { ago: 4, time: '07:40', account: '錢包', shop: '7-ELEVEN', lines: [['', '早餐', 80, undefined, [['御飯糰', 35], ['美式咖啡', 45]]]] },
  { ago: 6, time: '08:10', account: '錢包', shop: '麥當勞', lines: [['', '早餐', 95, undefined, [['豬肉滿福堡', 50], ['薯餅', 20], ['紅茶', 25]]]] },
  { ago: 8, time: '07:55', account: '錢包', shop: '美而美', lines: [['', '早餐', 70, undefined, [['漢堡', 40], ['紅茶', 30]]]] },
  { ago: 10, time: '08:30', account: '錢包', shop: '早餐店', lines: [['', '早餐', 90, undefined, [['蘿蔔糕', 35], ['蛋餅', 30], ['豆漿', 25]]]] },
  { ago: 13, time: '07:45', account: '錢包', shop: '7-ELEVEN', lines: [['', '早餐', 75, undefined, [['茶葉蛋', 15], ['三明治', 35], ['鮮奶茶', 25]]]] },
]

/** the same pseudo-random numbers every time, so loading the demo again gives the same records */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const day = (ago: number) => addDays(today(), -ago)
const weekdayOf = (ago: number) => new Date(`${day(ago)}T12:00:00`).getDay()

/**
 * Half a year of everyday spending on top of the hand-written entries above (appended, so their ids never change).
 * Days follow a week: on workdays a quick breakfast and a cheap lunch, at the weekend later and larger meals, more
 * shopping and outings. What comes once a month (rent, salary, bills) is placed by calendar day, one each month.
 */
function extraEntries(): Entry[] {
  const rand = rng(20260101)
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]!
  const money = (min: number, max: number, step = 5) => Math.round((min + rand() * (max - min)) / step) * step
  const maybe = (p: number) => rand() < p
  const out: Entry[] = []

  const DISHES: Record<string, string[]> = {
    早餐: ['蛋餅', '豬排蛋吐司', '鐵板麵', '漢堡', '蘿蔔糕', '御飯糰', '三明治'],
    午餐: ['排骨便當', '鍋貼', '牛肉麵', '雞腿飯', '拉麵', '炒飯', '滷肉飯'],
    晚餐: ['小籠包', '燒肉', '壽司', '火鍋', '義大利麵', '麻辣燙', '牛排'],
    飲料: ['珍珠奶茶', '拿鐵', '紅茶', '美式咖啡', '綠茶', '檸檬愛玉'],
    宵夜: ['鹽酥雞', '烤玉米', '蚵仔煎', '滷味', '炒泡麵'],
  }
  // a meal is often a dish and something to go with it, written down as the parts of one item
  const SIDES: Record<string, [string[], number, number]> = {
    早餐: [['奶茶', '紅茶', '豆漿', '美式咖啡'], 20, 45],
    午餐: [['燙青菜', '貢丸湯', '紅茶', '滷蛋'], 15, 50],
    晚餐: [['啤酒', '味噌湯', '涼拌小菜', '可樂'], 40, 120],
  }
  const meal = (ago: number, time: string, shop: string, category: string, min: number, max: number, account = '錢包', note?: string) => {
    const total = money(min, max)
    const side = SIDES[category]
    const dish = pick(DISHES[category]!)
    const entry: Entry = { ago, time, account, shop, ...(note ? { note } : {}) }
    if (side && maybe(0.55)) {
      const sideAmount = Math.min(money(side[1], side[2]), total - 25)
      entry.lines = [['', category, total, undefined, [[dish, total - sideAmount], [pick(side[0]), sideAmount]]]]
    } else entry.lines = [[dish, category, total]]
    out.push(entry)
  }

  for (let ago = 0; ago <= 180; ago++) {
    const wd = weekdayOf(ago)
    const weekend = wd === 0 || wd === 6
    if (maybe(weekend ? 0.3 : 0.62)) meal(ago, (weekend ? '09:' : '08:') + pick(['00', '10', '20', '30', '40']), pick(['美而美', '7-ELEVEN', '早餐店', '麥當勞']), '早餐', 50, 100)
    if (maybe(0.88)) {
      if (weekend) meal(ago, '12:' + pick(['10', '30', '45']), pick(['一蘭拉麵', '八方雲集', '壽司郎', '路邊麵店', '麥當勞']), '午餐', 140, 280)
      else meal(ago, '12:' + pick(['00', '10', '20']), pick(['池上便當', '八方雲集', '麥當勞', '路邊麵店', '公司附近小吃']), '午餐', 80, 150)
    }
    if (maybe(weekend ? 0.65 : 0.3)) {
      const withFriends = weekend && maybe(0.25)
      meal(
        ago,
        (weekend ? '18:' : '19:') + pick(['00', '15', '30', '45']),
        pick(['鼎泰豐', '老井燒肉', '壽司郎', '夜市', '火鍋店']),
        '晚餐',
        weekend ? 250 : 120,
        weekend ? 800 : 350,
        pick(['錢包', '信用卡']),
        withFriends ? pick(['朋友聚餐', '慶祝', '難得出來吃']) : undefined,
      )
    }
    if (maybe(0.28)) meal(ago, (weekend ? '14:' : '15:') + pick(['00', '30']), pick(['五十嵐', '星巴克', '路易莎']), '飲料', 45, 160)
    if (maybe(weekend ? 0.15 : 0.07)) meal(ago, '23:00', pick(['鹽酥雞', '夜市']), '宵夜', 80, 200)
    if (!weekend && maybe(0.12)) out.push({ ago, time: '08:00', account: '錢包', shop: '悠遊卡', lines: [['加值', '大眾運輸', pick([100, 200, 300, 500])]] })
    if (maybe(weekend ? 0.1 : 0.05)) out.push({ ago, time: '22:30', account: '信用卡', shop: 'Uber', lines: [['叫車', '計程車', money(150, 450)]] })
    if (maybe(0.06)) out.push({ ago, time: '17:00', account: '信用卡', shop: '中油', lines: [['汽油', '加油', money(400, 900, 50)]] })
    if (maybe(weekend ? 0.3 : 0.07)) {
      const things: [string, string, [number, number]][] = [
        ['蔬菜', '食材', [60, 180]],
        ['雞蛋', '食材', [60, 100]],
        ['牛奶', '食材', [60, 110]],
        ['水果', '食材', [100, 300]],
        ['衛生紙', '日用品', [150, 380]],
        ['洗衣精', '日用品', [120, 260]],
      ]
      const picked = [...things].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 3))
      out.push({ ago, time: weekend ? '10:30' : '18:30', account: '信用卡', shop: pick(['全聯', '好市多', '家樂福']), lines: picked.map(([n, c, [lo, hi]]) => [n, c, money(lo, hi)] as L) })
    }
    if (maybe(weekend ? 0.08 : 0.02)) out.push({ ago, time: '15:00', account: '信用卡', shop: pick(['UNIQLO', '蝦皮購物', 'IKEA']), lines: [['購物', pick(['服飾', '3C', '家具家電']), money(300, 2500, 10)]] })
    if (maybe(weekend ? 0.12 : 0.02)) out.push({ ago, time: '14:00', account: '錢包', shop: pick(['威秀影城', 'KTV', '桌遊店']), lines: [['娛樂', '娛樂', money(250, 800, 10)]] })
  }

  // what comes once a month, on its own day of the month
  const base = new Date(`${today()}T00:00:00`)
  const agoOf = (back: number, dom: number) => Math.round((base.getTime() - new Date(base.getFullYear(), base.getMonth() - back, dom).getTime()) / 86400000)
  for (let back = 0; back <= 6; back++) {
    const at = (dom: number, e: Omit<Entry, 'ago'>) => {
      const ago = agoOf(back, dom)
      if (ago >= 0 && ago <= 185) out.push({ ago, ...e })
    }
    at(1, { time: '08:00', account: '銀行帳戶', shop: '房東', lines: [['房租', '房租', 12000]] })
    at(3, { time: '00:05', account: '信用卡', shop: 'Netflix', lines: [['Netflix 月費', '串流訂閱', 390]] })
    at(5, { time: '09:00', type: 'income', account: '銀行帳戶', lines: [['薪資', '薪資', 55000]] })
    at(8, { time: '19:00', account: '信用卡', shop: 'World Gym', lines: [['月費', '運動', 1200]] })
    at(12, { time: '12:00', account: '銀行帳戶', shop: '台灣電力', lines: [['電費', '水電瓦斯', money(900, 1700, 10)]] })
    if (back % 2 === 0) at(13, { time: '12:10', account: '銀行帳戶', shop: '自來水公司', lines: [['水費', '水電瓦斯', money(200, 320, 10)]] })
    at(20, { time: '21:00', type: 'transfer', account: '銀行帳戶', to: '信用卡', amount: money(7000, 12000, 100), note: '信用卡繳款' })
  }
  out.push({ ago: 100, time: '10:00', type: 'income', account: '銀行帳戶', lines: [['年終獎金', '獎金', 60000]] })
  out.push({ ago: 75, time: '12:00', type: 'income', account: '證券戶', lines: [['股利', '投資收益', 3200]] })
  return out
}

/** one breakfast, lunch and dinner a day at most: the hand-written ones come first and keep their place */
function dedupeMeals(list: Entry[]): Entry[] {
  const seen = new Set<string>()
  return list.filter((e) => {
    const category = e.lines?.[0]?.[1]
    if (!category || !['早餐', '午餐', '晚餐'].includes(category) || e.ledger || e.type) return true
    const key = `${e.ago}:${category}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const ALL_ENTRIES = dedupeMeals([...ENTRIES, ...extraEntries()])

/** everyone who appears in the demo records and loans */
const DEMO_PEOPLE = ['阿傑', '小美', '大雄', '小明', '媽媽', '阿嬤', '同事小王']

export async function hasDemo(): Promise<boolean> {
  const r = await db.records.get('demo-1')
  return Boolean(r && !r.deleted)
}

/** Fill the app with a believable two months of records, so every screen has something to show. */
export async function loadDemo(): Promise<number> {
  const reload = await hasDemo()
  // categories: make sure the investment ones exist even if the data was created before they did
  let cats = await db.categories.filter((c) => !c.deleted).toArray()
  const find = (name: string, kind: CategoryKind) => cats.find((c) => c.name === name && c.kind === kind)
  if (!find('投資', 'expense')) {
    const parent: Category = { id: uid(), name: '投資', kind: 'expense', parentId: null, icon: 'trending', color: P.magenta, order: cats.length, updatedAt: 0 }
    const kids: Category[] = [
      { id: uid(), name: '股票', kind: 'expense', parentId: parent.id, icon: 'trending', color: P.magenta, order: cats.length + 1, updatedAt: 0 },
      { id: uid(), name: '基金', kind: 'expense', parentId: parent.id, icon: 'coins', color: P.magenta, order: cats.length + 2, updatedAt: 0 },
    ]
    await saveMany('categories', [parent, ...kids])
    await moveOtherLast()
    cats = await db.categories.filter((c) => !c.deleted).toArray()
  }
  // the people of the demo are members; records and loans point at their ids
  const people = await ensureMembers(DEMO_PEOPLE)
  const mid = (name: string) => people.get(name) ?? name
  const nameById = new Map([...people].map(([n, id]) => [id, n]))
  const catId = (name: string, kind: CategoryKind) => {
    const c = find(name, kind) ?? cats.find((x) => x.name === name)
    if (!c) throw new Error(`找不到分類：${name}`)
    return c.id
  }

  // a few budgets so the budget tab has bars
  const budgets: [string, number][] = [['飲食', 8000], ['購物', 5000], ['娛樂', 3000]]
  const withBudget: Category[] = []
  for (const [name, budget] of budgets) {
    const c = find(name, 'expense')
    if (c && !c.budget) withBudget.push({ ...c, budget })
  }
  await saveMany('categories', withBudget)

  // accounts
  let accounts = await db.accounts.filter((a) => !a.deleted).toArray()
  if (!accounts.some((a) => a.name === '證券戶')) {
    const a: Account = { id: uid(), name: '證券戶', kind: 'bank', initial: 0, order: accounts.length, color: P.magenta, updatedAt: 0 }
    await save('accounts', a)
    accounts = await db.accounts.filter((x) => !x.deleted).toArray()
  }
  const startMoney: [string, number][] = [['銀行帳戶', 40000], ['錢包', 2000]]
  for (const [name, initial] of startMoney) {
    const a = accounts.find((x) => x.name === name)
    if (a && a.initial === 0) await save('accounts', { ...a, initial })
  }
  const acc = (name: string) => {
    const a = accounts.find((x) => x.name === name)
    if (!a) throw new Error(`找不到帳戶：${name}`)
    return a.id
  }

  // ledgers
  // the table is keyed by random ids, so "first" must mean the first in the user's own order
  const readLedgers = async () => (await db.ledgers.filter((l) => !l.deleted).toArray()).sort((a, b) => a.order - b.order)
  let ledgers = await readLedgers()
  const daily = ledgers[0]
  if (daily && !daily.budget) await save('ledgers', { ...daily, budget: 30000 })
  // earlier demos called it by another name: it is the same ledger, not a second one
  const earlier = ledgers.find((l) => ['日本旅行', '2026 日本旅行', '2026 日本自由行', '2026 日本'].includes(l.name))
  if (earlier) {
    await save('ledgers', { ...earlier, name: TRIP })
    ledgers = await readLedgers()
  }
  if (!ledgers.some((l) => l.name === TRIP)) {
    const l: Ledger = { id: uid(), name: TRIP, order: ledgers.length, color: P.pink, currency: 'JPY', updatedAt: 0 }
    await save('ledgers', l)
    ledgers = await readLedgers()
  }
  // an earlier demo gave the trip a yen wallet to start from; it has none now
  const trip = ledgers.find((l) => l.name === TRIP)
  if (trip?.accountId) {
    await save('ledgers', { ...trip, accountId: undefined })
    ledgers = await readLedgers()
  }
  const ledgerId = (name?: string) => (name ? ledgers.find((l) => l.name === name) : ledgers[0])?.id ?? ledgers[0]!.id

  // records (merchants and the items bought there are remembered as we go)
  const records: Rec[] = []
  const splitLoans: Loan[] = []
  for (const [i, e] of ALL_ENTRIES.entries()) {
    const type = e.type ?? 'expense'
    const kind: CategoryKind = type === 'income' ? 'income' : 'expense'
    const lines: Line[] =
      type === 'transfer'
        ? []
        : (e.lines ?? []).map(([name, category, price, amortMonths, parts]) => ({
            id: uid(),
            name,
            categoryId: catId(category, kind),
            amount: price,
            ...(amortMonths ? { amortMonths } : {}),
            ...(parts ? { details: parts.map(([n, a]) => ({ name: n, amount: a })) } : {}),
          }))
    const rec: Rec = {
      id: `demo-${i + 1}`,
      type,
      date: day(e.ago),
      time: e.time,
      ledgerId: ledgerId(e.ledger),
      accountId: e.account ? acc(e.account) : '',
      ...(e.to ? { toAccountId: acc(e.to) } : {}),
      lines,
      total: type === 'transfer' ? (e.amount ?? 0) : lines.reduce((n, l) => n + l.amount, 0),
      ...(e.note ? { note: e.note } : {}),
      ...(e.with ? { companions: e.with.map(mid) } : {}),
      ...(e.split && e.with
        ? {
            split:
              e.split === 'other'
                ? { mode: 'other' as const, shares: [], payer: e.payer ? mid(e.payer) : undefined, mine: lines.reduce((n, l) => n + l.amount, 0) }
                : { mode: e.split, shares: sharesFor(e.split, lines.reduce((n, l) => n + l.amount, 0), e.with.map(mid)) },
          }
        : {}),
      updatedAt: 0,
    }
    if (e.shop && type !== 'transfer') {
      // loading again must not count the same purchases twice, so reuse a merchant that is already there
      const known = reload ? await db.merchants.filter((m) => !m.deleted && m.name === e.shop).first() : undefined
      const merchantId = known?.id ?? (await learn(e.shop, undefined, rec))
      if (merchantId) rec.merchantId = merchantId
    }
    records.push(rec)
    // the others' parts of a shared bill are lent out, and some have been paid back
    if (rec.split?.mode === 'other' && rec.split.payer) {
      splitLoans.push({ id: `demo-split-${rec.id}-${rec.split.payer}`, direction: 'borrow', personId: rec.split.payer, principal: rec.split.mine ?? rec.total, date: rec.date, note: '分帳', recordId: rec.id, repayments: [], updatedAt: 0 })
    } else if (rec.split) {
      for (const p of rec.split.shares) {
        const back = e.repaid?.[nameById.get(p.memberId) ?? '']
        splitLoans.push({
          id: `demo-split-${rec.id}-${p.memberId}`,
          direction: 'lend',
          personId: p.memberId,
          principal: p.amount,
          date: rec.date,
          note: '分帳',
          recordId: rec.id,
          repayments: back ? [{ id: uid(), date: day(Math.max(0, e.ago - 2)), amount: back, accountId: acc('錢包') }] : [],
          updatedAt: 0,
        })
      }
    }
  }

  // a phone paid in 12 instalments (three already posted) and a monthly rent rule that is not yet due
  const installment: Recurring = {
    id: 'demo-installment',
    name: '手機分期',
    kind: 'installment',
    template: {
      type: 'expense',
      accountId: acc('信用卡'),
      ledgerId: ledgerId(),
      lines: [{ id: uid(), name: '手機分期', categoryId: catId('3C', 'expense'), amount: 2000 }],
    },
    freq: 'monthly',
    interval: 1,
    startDate: day(65),
    count: 12,
    generated: 3,
    autoPost: true,
    active: true,
    installment: { total: 24000, periods: 12, fee: 0 },
    updatedAt: 0,
  }
  for (const n of [0, 1, 2]) records.push(buildRecord(installment, n))
  const rent: Recurring = {
    id: 'demo-rent',
    name: '房租',
    kind: 'recurring',
    template: {
      type: 'expense',
      accountId: acc('銀行帳戶'),
      ledgerId: ledgerId(),
      lines: [{ id: uid(), name: '房租', categoryId: catId('房租', 'expense'), amount: 12000 }],
    },
    freq: 'monthly',
    interval: 1,
    startDate: addDays(today(), 1),
    generated: 0,
    autoPost: false,
    active: true,
    updatedAt: 0,
  }

  // older loans, most of them already paid back, so the settled list has something to fold
  const paid = (id: string, direction: Loan['direction'], person: string, principal: number, ago: number, note: string): Loan => ({
    id,
    direction,
    personId: mid(person),
    principal,
    date: day(ago),
    accountId: acc('錢包'),
    note,
    repayments: [{ id: `${id}-r`, date: day(Math.max(0, ago - 20)), amount: principal, accountId: acc('錢包') }],
    updatedAt: 0,
  })
  const oldLoans: Loan[] = [
    paid('demo-loan-3', 'lend', '阿傑', 1500, 90, '演唱會門票'),
    paid('demo-loan-4', 'lend', '小美', 800, 80, '聚餐'),
    paid('demo-loan-5', 'borrow', '阿嬤', 5000, 120, '週轉'),
    paid('demo-loan-6', 'lend', '大雄', 2200, 110, '代買'),
    paid('demo-loan-7', 'lend', '同事小王', 600, 70, '午餐代墊'),
    paid('demo-loan-8', 'borrow', '小明', 1200, 60, '先幫我付'),
    paid('demo-loan-9', 'lend', '阿傑', 3500, 150, '機票代墊'),
    paid('demo-loan-10', 'lend', '小美', 450, 55, '電影票'),
    { id: 'demo-loan-11', direction: 'lend', personId: mid('大雄'), principal: 2000, date: day(30), note: '借他週轉', repayments: [{ id: 'demo-loan-11-r', date: day(12), amount: 800, accountId: acc('錢包') }], updatedAt: 0 },
  ]

  const loans: Loan[] = [
    ...splitLoans,
    ...oldLoans,
    { id: 'demo-loan-1', direction: 'lend', personId: mid('小明'), principal: 3000, date: day(10), dueDate: addDays(today(), 7), accountId: acc('錢包'), note: '聚餐代墊', repayments: [], updatedAt: 0 },
    {
      id: 'demo-loan-2',
      direction: 'borrow',
      personId: mid('媽媽'),
      principal: 10000,
      date: day(40),
      accountId: acc('銀行帳戶'),
      repayments: [{ id: uid(), date: day(15), amount: 3000, accountId: acc('銀行帳戶') }],
      updatedAt: 0,
    },
  ]

  await db.transaction('rw', db.records, db.recurrings, db.loans, async () => {
    // loading again after the demo changed: records of the earlier demo that no longer exist go away
    const keepRecords = new Set(records.map((r) => r.id))
    const staleRecords = await db.records.filter((r) => r.id.startsWith('demo-') && !keepRecords.has(r.id) && !r.deleted).toArray()
    await db.records.bulkPut([...staleRecords.map((r) => ({ ...r, deleted: true, updatedAt: stamp() })), ...records.map((r) => ({ ...r, updatedAt: stamp() }))])
    await db.recurrings.bulkPut([installment, rent].map((r) => ({ ...r, updatedAt: stamp() })))
    // loading again after the demo changed: loans of the earlier demo that no longer exist go away
    const keep = new Set(loans.map((l) => l.id))
    const old = await db.loans.filter((l) => l.id.startsWith('demo-') && !keep.has(l.id) && !l.deleted).toArray()
    await db.loans.bulkPut([...old.map((l) => ({ ...l, deleted: true, updatedAt: stamp() })), ...loans.map((l) => ({ ...l, updatedAt: stamp() }))])
  })
  markLocalChange()
  // an earlier demo had a yen wallet. It goes, unless something the person wrote down uses it
  const yenWallet = accounts.find((a) => a.name === '日圓現金')
  if (yenWallet) {
    const used = await db.records
      .filter((r) => !r.deleted && !r.id.startsWith('demo-') && (r.accountId === yenWallet.id || r.toAccountId === yenWallet.id))
      .count()
    if (!used) await remove('accounts', yenWallet.id)
  }
  return records.length
}
