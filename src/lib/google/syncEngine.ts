/*
 * Two-way sync through one file in Google Drive's hidden app data folder.
 *
 * The file holds one entry per entity (table, id, updatedAt, deleted, content); the devices merge with it, newest
 * `updatedAt` winning. Photos are separate files in the same folder, see imageSync.ts.
 *
 * An older version kept the same data in a spreadsheet. The first sync that finds no file yet reads that spreadsheet
 * once (when the sign-in still allows it) and carries its data over.
 */
import { db, table } from '@/db'
import { TABLES, type Base, type TableName } from '@/db/types'
import { DriveAuthError, downloadFile, findSyncFile, readJson, writeSyncFile } from './drive'
import { inBatches, syncImages } from './imageSync'
import { findSpreadsheet, listLegacyImages, readValues, usableSpreadsheet } from './legacy'

const FILE_VERSION = 1
/** another device may write while this one merges: merge its copy too, this many times at most */
const MAX_TRIES = 3

export interface SyncOptions {
  getToken: () => Promise<string>
  /** the sync file this device used before ('' when it has not synced yet) */
  fileId: string
  /** the spreadsheet an older version used, still to be carried over ('' when none) */
  legacySheetId: string
  /** the sign-in may still read the spreadsheet */
  legacyAccess: boolean
  /** the local data is only the starter data: let the cloud's data replace it */
  dropSeed?: boolean
  /** this device's daily-reminder settings, shared through the file */
  reminder?: { deviceId: string; time: string; timeAt: number; on: boolean }
}

/** What the devices share about reminders. */
interface ReminderShare {
  time?: string
  timeAt?: number
  devices?: Record<string, { on: boolean }>
}

export interface ReminderResult {
  time: string
  timeAt: number
  /** another device has the daily reminder on */
  onElsewhere: boolean
}

export interface SyncResult {
  fileId: string
  pulled: number
  pushed: boolean
  reminder?: ReminderResult
}

interface Row {
  t: TableName
  id: string
  updatedAt: number
  deleted: boolean
  entity: Base
}

interface FileRow {
  t: TableName
  id: string
  at: number
  /** 1 for a tombstone */
  d?: 1
  e?: Base
}

interface SyncFileBody {
  app: 'account-book'
  version: number
  reminder?: ReminderShare
  rows: FileRow[]
}

function fromFile(body: SyncFileBody): Row[] {
  const out: Row[] = []
  for (const r of body.rows ?? []) {
    if (!TABLES.includes(r.t) || !r.id) continue
    const deleted = r.d === 1
    const entity: Base = deleted || !r.e ? { id: r.id, updatedAt: r.at, deleted: true } : { ...r.e, id: r.id, updatedAt: r.at }
    out.push({ t: r.t, id: r.id, updatedAt: r.at, deleted: deleted || !r.e, entity })
  }
  return out
}

function toFile(rows: Row[], reminder: ReminderShare): SyncFileBody {
  return {
    app: 'account-book',
    version: FILE_VERSION,
    reminder,
    rows: rows.map((r) => (r.deleted ? { t: r.t, id: r.id, at: r.updatedAt, d: 1 as const } : { t: r.t, id: r.id, at: r.updatedAt, e: r.entity })),
  }
}

async function localRows(): Promise<Row[]> {
  const out: Row[] = []
  for (const t of TABLES) {
    for (const e of await table(t).toArray()) {
      out.push({ t, id: e.id, updatedAt: e.updatedAt, deleted: Boolean(e.deleted), entity: e })
    }
  }
  return out
}

/** What an older version left in its spreadsheet's hidden data tab. */
async function readLegacy(token: string, wanted: string): Promise<{ rows: Row[]; reminder: ReminderShare } | null> {
  let id = wanted
  if (!id || !(await usableSpreadsheet(token, id).catch(() => false))) id = (await findSpreadsheet(token)) ?? ''
  if (!id) return null
  const rows: Row[] = []
  for (const v of await readValues(token, id, `'_data'!A2:E`)) {
    const t = String(v[0] ?? '') as TableName
    const rowId = String(v[1] ?? '').replace(/^'/, '')
    if (!TABLES.includes(t) || !rowId) continue
    const updatedAt = Number(v[2])
    const deleted = Number(v[3]) === 1
    try {
      const entity = deleted ? { id: rowId, updatedAt, deleted: true } : (JSON.parse(String(v[4])) as Base)
      rows.push({ t, id: rowId, updatedAt, deleted, entity: { ...entity, id: rowId, updatedAt } })
    } catch {
      continue
    }
  }
  let reminder: ReminderShare = {}
  try {
    const cell = String((await readValues(token, id, `'_data'!G2`))[0]?.[0] ?? '')
    reminder = cell ? (JSON.parse(cell) as ReminderShare) : {}
  } catch {
    reminder = {}
  }
  return { rows, reminder }
}

/** Photos an older version put in Drive come down to this device, where the normal photo sync uploads them. */
async function pullLegacyImages(token: string) {
  const remote = await listLegacyImages(token)
  const have = new Set((await db.images.toCollection().primaryKeys()) as string[])
  await inBatches(
    [...remote].filter(([id]) => !have.has(id)),
    async ([id, r]) => {
      const blob = await downloadFile(token, r.fileId)
      await db.images.put({ id, recordId: r.recordId, blob, createdAt: r.createdAt, synced: false })
    },
  )
}

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  const token = await opts.getToken()

  let file = await findSyncFile(token)
  // the file this device used is gone or was replaced (the cloud was cleared from somewhere): what is there now wins,
  // or old data would be fed back
  const lost = Boolean(opts.fileId) && Boolean(file) && file!.id !== opts.fileId

  // first run in the app data folder: carry the older spreadsheet's data over
  let legacy: { rows: Row[]; reminder: ReminderShare } | null = null
  if (!file && !opts.fileId && opts.legacyAccess) {
    try {
      legacy = await readLegacy(token, opts.legacySheetId)
    } catch (e) {
      if (e instanceof DriveAuthError) throw e
      console.warn('讀取舊的試算表失敗，這次先略過：', e)
    }
  }
  if (opts.legacySheetId || legacy) {
    // photos that were synced the old way are not in the app data folder yet
    await db.images.toCollection().modify({ synced: false })
    if (opts.legacyAccess) await pullLegacyImages(token).catch((e) => console.warn('舊的圖片讀取失敗：', e))
  }

  let pulled = 0
  let pushed = false
  let reminder: ReminderResult | undefined
  let fileId = file?.id ?? ''

  for (let attempt = 1; ; attempt++) {
    const body = file ? await readJson<SyncFileBody>(token, file.id) : null
    const remote = body ? fromFile(body) : (legacy?.rows ?? [])
    const share = body?.reminder ?? legacy?.reminder ?? {}

    // starter data, or a copy of a cloud that was cleared since: the cloud that is there now wins, or every starter item would appear twice
    if (attempt === 1 && (opts.dropSeed || lost) && remote.length) {
      await db.transaction('rw', db.tables, async () => {
        for (const t of TABLES) await table(t).clear()
      })
    }

    const local = await localRows()
    const localMap = new Map(local.map((r) => [`${r.t}:${r.id}`, r]))
    const remoteMap = new Map(remote.map((r) => [`${r.t}:${r.id}`, r]))

    const toLocal: Row[] = []
    let localNewer = false
    for (const r of remote) {
      const mine = localMap.get(`${r.t}:${r.id}`)
      if (!mine || mine.updatedAt < r.updatedAt) toLocal.push(r)
      else if (mine.updatedAt > r.updatedAt) localNewer = true
    }
    for (const r of local) if (!remoteMap.has(`${r.t}:${r.id}`)) localNewer = true

    if (toLocal.length) {
      await db.transaction('rw', db.tables, async () => {
        for (const t of TABLES) {
          const rows = toLocal.filter((r) => r.t === t).map((r) => r.entity)
          if (rows.length) await table(t).bulkPut(rows as never[])
        }
      })
      pulled += toLocal.length
    }

    const merged = opts.reminder ? mergeReminder(share, opts.reminder) : undefined
    reminder = merged?.result
    const needPush = localNewer || !file || Boolean(merged?.changed)
    if (!needPush) break

    // another device may have written while this one merged: merge its copy too instead of overwriting it
    const latest = await findSyncFile(token)
    if (latest?.id !== file?.id || latest?.modifiedTime !== file?.modifiedTime) {
      if (attempt >= MAX_TRIES) throw new Error('雲端資料一直在變動，請稍後再同步一次')
      file = latest
      continue
    }
    fileId = await writeSyncFile(token, file?.id ?? null, toFile(toLocal.length ? await localRows() : local, merged?.share ?? share))
    pushed = true
    break
  }

  // photos go through Drive in the background; they can be many and must not hold up the sync itself
  void syncImages(token)

  return { fileId, pulled, pushed, reminder }
}

/** The reminder time is shared (the newest change wins); each device only ever writes its own on/off. */
export function mergeReminder(
  remote: ReminderShare,
  mine: NonNullable<SyncOptions['reminder']>,
): { result: ReminderResult; share: ReminderShare; changed: boolean } {
  const devices = { ...(remote.devices ?? {}) }
  let changed = false

  let time = mine.time
  let timeAt = mine.timeAt
  const remoteAt = remote.timeAt ?? 0
  if (remote.time && remoteAt > timeAt) {
    time = remote.time
    timeAt = remoteAt
  } else if (timeAt > remoteAt) changed = true

  if (devices[mine.deviceId]?.on !== mine.on) {
    devices[mine.deviceId] = { on: mine.on }
    changed = true
  }

  return {
    result: {
      time,
      timeAt,
      onElsewhere: Object.entries(devices).some(([device, d]) => device !== mine.deviceId && d.on),
    },
    share: { time, timeAt, devices },
    changed,
  }
}
