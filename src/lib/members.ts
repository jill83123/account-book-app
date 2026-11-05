import { db, markLocalChange, stamp } from '@/db'
import type { Member } from '@/db/types'
import { uid } from './id'

/** The members of these names (made now when missing), as name -> id. */
export async function ensureMembers(names: string[]): Promise<Map<string, string>> {
  const have = (await db.members.toArray()).filter((m) => !m.deleted)
  const out = new Map(have.map((m) => [m.name, m.id]))
  const fresh: Member[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name || out.has(name)) continue
    const id = uid()
    out.set(name, id)
    fresh.push({ id, name, updatedAt: stamp() })
  }
  if (fresh.length) {
    await db.members.bulkPut(fresh)
    markLocalChange()
  }
  return out
}
