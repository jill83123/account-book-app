import { beforeEach, describe, expect, it } from 'vitest'
import { db, stamp } from '@/db'
import { P } from '@/lib/colors'
import { defaultCategories, groupStarterIncome, refreshStarterCategories, splitInterestIncome } from '@/lib/seed'
import { line, rec } from './helpers'

beforeEach(async () => {
  await Promise.all([db.categories.clear(), db.records.clear()])
})

/** the starter set as it was before: old icons, 牙科 present, 運動 under 休閒 */
async function oldStarter() {
  const all = defaultCategories().map((c) => ({ ...c }))
  const get = (name: string) => all.find((c) => c.name === name)!
  get('食材').icon = 'basket'
  get('房租').icon = 'building'
  get('車輛保養').name = '車輛維護'
  get('車輛維護').icon = 'oilcan'
  const leisure = get('娛樂')
  leisure.name = '休閒'
  leisure.color = P.violet
  for (const c of all) if (c.parentId === leisure.id) c.color = P.violet
  get('人情').color = P.red
  get('居家').color = P.green
  for (const c of all) if (c.parentId === get('居家').id) c.color = P.green
  get('育兒').color = P.pink
  for (const c of all) if (c.parentId === get('育兒').id) c.color = P.pink
  get('運動').parentId = leisure.id
  get('運動').color = leisure.color
  all.push({ id: 'tooth', name: '牙科', kind: 'expense', parentId: get('健康').id, icon: 'tooth', color: get('健康').color, order: 99, updatedAt: stamp() })
  await db.categories.bulkAdd(all)
  return get
}

describe('refreshStarterCategories', () => {
  it('updates untouched starter icons, moves 運動 under 健康 and drops an unused 牙科', async () => {
    const get = await oldStarter()
    await refreshStarterCategories()
    const now = async (name: string) => (await db.categories.filter((c) => c.name === name && !c.deleted).toArray())[0]
    expect((await now('食材'))!.icon).toBe('egg')
    expect((await now('房租'))!.icon).toBe('house')
    const sport = (await now('運動'))!
    expect(sport.parentId).toBe(get('健康').id)
    expect(sport.color).toBe(get('健康').color)
    expect((await now('娛樂'))!.id).toBe(get('休閒').id)
    expect((await now('娛樂'))!.color).toBe(P.violet)
    expect((await now('遊戲'))!.color).toBe(P.violet)
    expect((await now('人情'))!.color).toBe(P.crimson)
    expect((await now('居家'))!.color).toBe(P.brown)
    expect((await now('房租'))!.color).toBe(P.brown)
    expect((await now('育兒'))!.color).toBe(P.blush)
    expect((await now('玩具'))!.color).toBe(P.blush)
    expect(await now('牙科')).toBeUndefined()
    expect(await now('車輛維護')).toBeUndefined()
    expect((await now('車輛保養'))!.icon).toBe('wrench')
  })

  it('leaves alone what the person changed, and a 牙科 that records use', async () => {
    const get = await oldStarter()
    await db.categories.update(get('食材').id, { icon: 'cheese' })
    await db.categories.update(get('運動').id, { parentId: get('其他').id })
    await db.records.put(rec({ id: 'r1', lines: [line(100, { categoryId: 'tooth' })] }))
    await refreshStarterCategories()
    expect((await db.categories.get(get('食材').id))!.icon).toBe('cheese')
    expect((await db.categories.get(get('運動').id))!.parentId).toBe(get('其他').id)
    expect((await db.categories.get('tooth'))!.deleted).toBeFalsy()
  })
})

describe('groupStarterIncome', () => {
  /** the flat income list as it used to be, with the ids records point at */
  async function flatIncome() {
    const names = ['薪資', '獎金', '兼職', '投資收益', '利息收入', '租金收入', '退款', '其他收入']
    await db.categories.bulkAdd(
      names.map((name, i) => ({ id: name, name, kind: 'income' as const, parentId: null, icon: 'tag', color: '#000', order: i, updatedAt: stamp() })),
    )
  }
  const live = async () => (await db.categories.toArray()).filter((c) => !c.deleted)

  it('groups the old flat list without changing any id', async () => {
    await flatIncome()
    await groupStarterIncome()
    const all = await live()
    const parentOf = (id: string) => all.find((c) => c.id === id)!.parentId
    const work = all.find((c) => c.name === '工作收入')!
    expect(parentOf('薪資')).toBe(work.id)
    expect(parentOf('投資收益')).toBeNull()
    expect(parentOf('利息收入')).toBeNull()
    expect(all.some((c) => c.name === '活存利息' && c.parentId === '利息收入')).toBe(true)
    expect(parentOf('租金收入')).toBe('投資收益')
    expect(parentOf('退款')).toBe(all.find((c) => c.name === '退款與補貼')!.id)
    expect(all.some((c) => c.name === '股利配息' && c.parentId === '投資收益')).toBe(true)
    const tops = all.filter((c) => !c.parentId).sort((a, b) => a.order - b.order).map((c) => c.name)
    expect(tops).toEqual(['工作收入', '投資收益', '利息收入', '退款與補貼', '其他收入'])
  })

  it('leaves income alone once the person has their own groups', async () => {
    await flatIncome()
    await db.categories.update('獎金', { parentId: '薪資' })
    await groupStarterIncome()
    expect((await live()).some((c) => c.name === '工作收入')).toBe(false)
  })
})

describe('splitInterestIncome', () => {
  it('lifts 利息收入 out of 投資收益 into its own group, keeping its id', async () => {
    const all = defaultCategories().map((c) => ({ ...c }))
    const get = (name: string) => all.find((c) => c.name === name)!
    // the layout the first grouping produced: 利息收入 was a kid of 投資收益
    const interest = get('利息收入')
    const kids = all.filter((c) => c.parentId === interest.id)
    const rest = all.filter((c) => !kids.includes(c))
    interest.parentId = get('投資收益').id
    await db.categories.bulkAdd(rest)
    await splitInterestIncome()
    const now = (await db.categories.toArray()).filter((c) => !c.deleted)
    expect(now.find((c) => c.id === interest.id)!.parentId).toBeNull()
    expect(now.filter((c) => c.parentId === interest.id).map((c) => c.name).sort()).toEqual(['定存利息', '活存利息'])
  })

  it('does nothing when 利息收入 is already its own group', async () => {
    await db.categories.bulkAdd(defaultCategories())
    const before = (await db.categories.toArray()).length
    await splitInterestIncome()
    expect(await db.categories.count()).toBe(before)
  })
})

describe('股利配息', () => {
  const setup = async () => {
    await db.categories.bulkAdd([
      { id: 'inv', name: '投資收益', kind: 'income', parentId: null, icon: 'trending', color: '#000', order: 0, updatedAt: stamp() },
      { id: 'div', name: '股利', kind: 'income', parentId: 'inv', icon: 'coins', color: '#000', order: 0, updatedAt: stamp() },
      { id: 'fund', name: '基金配息', kind: 'income', parentId: 'inv', icon: 'percent', color: '#000', order: 1, updatedAt: stamp() },
    ])
  }
  it('merges the two into 股利配息 when nothing uses 基金配息', async () => {
    await setup()
    await refreshStarterCategories()
    expect((await db.categories.get('div'))!.name).toBe('股利配息')
    expect((await db.categories.get('fund'))!.deleted).toBe(true)
  })
  it('keeps 基金配息 when a record uses it', async () => {
    await setup()
    await db.records.put(rec({ id: 'r2', type: 'income', lines: [line(500, { categoryId: 'fund' })] }))
    await refreshStarterCategories()
    expect((await db.categories.get('fund'))!.deleted).toBeFalsy()
  })
})
