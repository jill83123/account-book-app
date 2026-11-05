import { db, markLocalChange, stamp, table } from '@/db'
import { TABLES, type Base, type TableName } from '@/db/types'

interface Backup {
  app: 'account-book'
  version: 1
  exportedAt: string
  data: Partial<Record<TableName, Base[]>>
}

export async function exportBackup(): Promise<string> {
  const data: Backup['data'] = {}
  for (const t of TABLES) data[t] = (await table(t).toArray()).filter((r) => !r.deleted)
  const out: Backup = { app: 'account-book', version: 1, exportedAt: new Date().toISOString(), data }
  return JSON.stringify(out, null, 1)
}

/** Replace everything on this device with the backup. Deleted-on-purpose rows stay as tombstones so a sync removes them elsewhere too. */
export async function importBackup(text: string): Promise<number> {
  let parsed: Backup
  try {
    parsed = JSON.parse(text) as Backup
  } catch {
    throw new Error('檔案不是有效的 JSON')
  }
  if (parsed.app !== 'account-book' || typeof parsed.data !== 'object') {
    throw new Error('這不是記帳本的備份檔')
  }
  let count = 0
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) {
      const incoming = parsed.data[t] ?? []
      const keep = new Set(incoming.map((r) => r.id))
      const now = await table(t).toArray()
      // rows missing from the backup become tombstones
      const gone = now.filter((r) => !r.deleted && !keep.has(r.id)).map((r) => ({ ...r, deleted: true, updatedAt: stamp() }))
      await table(t).bulkPut([...gone, ...incoming.map((r) => ({ ...r, deleted: false, updatedAt: stamp() }))] as never[])
      count += incoming.length
    }
  })
  markLocalChange()
  return count
}

export function download(name: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
