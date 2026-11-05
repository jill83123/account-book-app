import Dexie, { type EntityTable } from 'dexie'
import type {
  Account,
  Base,
  Category,
  ImageRow,
  ImageTrash,
  Ledger,
  Loan,
  Member,
  Merchant,
  Rec,
  Recurring,
  TableMap,
  TableName,
} from './types'

export class AppDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  ledgers!: EntityTable<Ledger, 'id'>
  records!: EntityTable<Rec, 'id'>
  merchants!: EntityTable<Merchant, 'id'>
  recurrings!: EntityTable<Recurring, 'id'>
  loans!: EntityTable<Loan, 'id'>
  members!: EntityTable<Member, 'id'>
  images!: EntityTable<ImageRow, 'id'>
  imageTrash!: EntityTable<ImageTrash, 'id'>

  constructor() {
    super('account-book')
    this.version(1).stores({
      accounts: 'id, updatedAt',
      categories: 'id, updatedAt',
      ledgers: 'id, updatedAt',
      records: 'id, date, ledgerId, accountId, updatedAt',
      merchants: 'id, updatedAt',
      recurrings: 'id, updatedAt',
      loans: 'id, updatedAt',
    })
    // photos attached to records (the files are kept in Google Drive too once signed in)
    this.version(2).stores({ images: 'id, recordId' })
    // the people money is spent with or lent to (they used to be bare names inside records and loans)
    this.version(3).stores({ members: 'id, updatedAt' })
    // photos removed on this device whose Drive copy still has to go
    this.version(4).stores({ imageTrash: 'id' })
  }
}

export const db = new AppDB()

const LOCAL_CHANGE_KEY = 'ab.lastLocalChange'
export const CHANGE_EVENT = 'ab:local-change'

/** Record that local data changed (drives the "unsynced changes" indicator and auto sync). */
export function markLocalChange() {
  const now = Date.now()
  try {
    localStorage.setItem(LOCAL_CHANGE_KEY, String(now))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: now }))
}

export function lastLocalChange(): number {
  try {
    return Number(localStorage.getItem(LOCAL_CHANGE_KEY) ?? 0)
  } catch {
    return 0
  }
}

/** Monotonic-ish timestamp so two writes in the same ms still order correctly. */
let lastStamp = 0
export function stamp(): number {
  const now = Date.now()
  lastStamp = now > lastStamp ? now : lastStamp + 1
  return lastStamp
}

export function table<K extends TableName>(name: K) {
  return db[name] as unknown as EntityTable<TableMap[K] & Base, 'id'>
}

/** Insert or update, stamping the time. */
export async function save<K extends TableName>(name: K, item: Omit<TableMap[K], 'updatedAt'>) {
  await table(name).put({ ...item, updatedAt: stamp() } as TableMap[K] & Base)
  markLocalChange()
}

export async function saveMany<K extends TableName>(
  name: K,
  items: Omit<TableMap[K], 'updatedAt'>[],
) {
  if (!items.length) return
  await table(name).bulkPut(items.map((i) => ({ ...i, updatedAt: stamp() }) as TableMap[K] & Base))
  markLocalChange()
}

/** Mark as deleted (a tombstone) so the deletion reaches the other devices. */
export async function remove(name: TableName, id: string) {
  const t = table(name)
  const cur = await t.get(id)
  if (!cur) return
  await t.put({ ...cur, deleted: true, updatedAt: stamp() })
  // the loans of a shared bill go with the record
  if (name === 'records') {
    const lent = await table('loans').filter((l) => l.recordId === id && !l.deleted).toArray()
    for (const l of lent) await table('loans').put({ ...l, deleted: true, updatedAt: stamp() })
  }
  markLocalChange()
}
