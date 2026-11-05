import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { ensureMembers } from '@/lib/members'

beforeEach(async () => {
  await db.members.clear()
})

describe('ensureMembers', () => {
  it('makes the missing members only and reuses the ones with that name', async () => {
    await db.members.put({ id: 'own-id', name: '小美', updatedAt: 1 })
    const ids = await ensureMembers(['小美', '大雄', ' '])
    expect(ids.get('小美')).toBe('own-id')
    expect(ids.get('大雄')).toBeTruthy()
    expect(await db.members.count()).toBe(2)
  })

  it('does not make a member twice when run again', async () => {
    await ensureMembers(['阿傑'])
    await ensureMembers(['阿傑'])
    expect(await db.members.count()).toBe(1)
  })
})
