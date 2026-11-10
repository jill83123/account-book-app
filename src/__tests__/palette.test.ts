import { beforeEach, describe, expect, it } from 'vitest'
import { db, stamp } from '@/db'
import { P } from '@/lib/colors'
import { migratePalette } from '@/lib/palette'

beforeEach(async () => {
  await db.categories.clear()
})

describe('migratePalette', () => {
  it('moves an old starter colour to the current one', async () => {
    await db.categories.add({ id: 'a', name: '飲食', kind: 'expense', parentId: null, icon: 'tag', color: '#ed9f68', order: 0, updatedAt: stamp() })
    await migratePalette()
    expect((await db.categories.get('a'))!.color).toBe(P.orange)
  })

  it('skips a row that has no colour instead of failing', async () => {
    await db.categories.add({ id: 'b', name: '舊資料', kind: 'expense', parentId: null, icon: 'tag', order: 0, updatedAt: stamp() } as never)
    await expect(migratePalette()).resolves.toBe(0)
  })
})
