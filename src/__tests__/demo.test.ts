import { describe, expect, it } from 'vitest'
import { db } from '@/db'
import { seedIfEmpty } from '@/lib/seed'
import { loadDemo } from '@/lib/demo'

describe('demo data', () => {
  it('has no doubled meals or monthly items, and reloading adds nothing', async () => {
    await seedIfEmpty()
    const n1 = await loadDemo()
    const alive = async () => (await db.records.filter((r) => !r.deleted && r.id.startsWith('demo-')).toArray())
    const first = await alive()
    const cats = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]))
    const mealsPerDay = new Map<string, number>()
    for (const r of first) {
      if (r.ledgerId !== first[0]!.ledgerId) continue
      const c = cats.get(r.lines[0]?.categoryId ?? '')
      if (c && ['早餐', '午餐', '晚餐'].includes(c)) mealsPerDay.set(`${r.date}:${c}`, (mealsPerDay.get(`${r.date}:${c}`) ?? 0) + 1)
    }
    const doubled = [...mealsPerDay].filter(([, v]) => v > 1)
    const salaries = first.filter((r) => r.type === 'income' && r.lines[0]?.name === '薪資').map((r) => r.date.slice(0, 7))
    const rents = first.filter((r) => r.lines[0]?.name === '房租').map((r) => r.date.slice(0, 7))
    expect(doubled).toEqual([])
    expect(new Set(salaries).size).toBe(salaries.length)
    expect(new Set(rents).size).toBe(rents.length)
    await loadDemo()
    expect((await alive()).length).toBe(first.length)
  })
})
