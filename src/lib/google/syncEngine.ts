/*
 * Two-way sync with the spreadsheet.
 *
 * The hidden `_data` tab holds one row per entity (table, id, updatedAt, deleted, JSON); that is what
 * the devices merge with, newest `updatedAt` winning. The readable tabs are regenerated from the
 * merged data whenever anything changed.
 */
import { db, table } from '@/db'
import { TABLES, type Base, type TableName } from '@/db/types'
import { buildTables, LAYOUT_VERSION, type Snapshot } from './export'
import { sizeRequests, styleRequests } from './format'
import { syncImages } from './imageSync'
import {
  batchUpdate,
  clearValues,
  createFolder,
  createSpreadsheet,
  findFolder,
  findSpreadsheet,
  getInfo,
  getParents,
  getRootId,
  moveToFolder,
  readValues,
  SheetsAuthError,
  SheetsNotFoundError,
  writeRange,
  writeValues,
  type Cell,
  type SpreadsheetInfo,
} from './sheets'

const DATA_TITLE = '_data'
const DATA_SHEET_ID = 100
const HEADER: Cell[] = ['表', 'ID', '更新時間', '已刪除', '內容']

export interface SyncOptions {
  getToken: () => Promise<string>
  spreadsheetId: string
  /** the folder the sheet was put in on an earlier sync ('' when it has not been yet) */
  folderId?: string
  amortize: boolean
  /** rebuild the readable tabs even if nothing changed */
  forceViews?: boolean
  /** the local data is only the starter data: let the sheet's data replace it */
  dropSeed?: boolean
}

export interface SyncResult {
  spreadsheetId: string
  folderId: string
  url: string
  pulled: number
  pushed: boolean
}

interface Row {
  t: TableName
  id: string
  updatedAt: number
  deleted: boolean
  entity: Base
}

function parseRows(values: unknown[][]): Row[] {
  const out: Row[] = []
  for (const v of values) {
    const t = String(v[0] ?? '') as TableName
    const id = String(v[1] ?? '').replace(/^'/, '')
    if (!TABLES.includes(t) || !id) continue
    const updatedAt = Number(v[2])
    const deleted = Number(v[3]) === 1
    let entity: Base
    try {
      entity = deleted ? { id, updatedAt, deleted: true } : (JSON.parse(String(v[4])) as Base)
    } catch {
      continue
    }
    out.push({ t, id, updatedAt, deleted, entity: { ...entity, id, updatedAt } })
  }
  return out
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

async function snapshot(): Promise<Snapshot> {
  const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted)
  return {
    accounts: alive(await db.accounts.toArray()),
    categories: alive(await db.categories.toArray()),
    ledgers: alive(await db.ledgers.toArray()),
    records: alive(await db.records.toArray()),
    merchants: alive(await db.merchants.toArray()),
    recurrings: alive(await db.recurrings.toArray()),
    loans: alive(await db.loans.toArray()),
    members: alive(await db.members.toArray()),
  }
}

async function openSpreadsheet(
  token: string,
  wanted: string,
): Promise<{ id: string; info: SpreadsheetInfo; created: boolean }> {
  let id = wanted
  if (id) {
    try {
      const info = await getInfo(token, id)
      if (!info.trashed) return { id, info, created: false }
    } catch (e) {
      if (!(e instanceof SheetsNotFoundError)) throw e
    }
    id = ''
  }
  const found = await findSpreadsheet(token)
  if (found) return { id: found, info: await getInfo(token, found), created: false }
  id = await createSpreadsheet(token, '記帳本', { sheetId: DATA_SHEET_ID, title: DATA_TITLE })
  return { id, info: await getInfo(token, id), created: true }
}

/** A folder is only a place to keep things tidy, so a failure here never stops a sync. */
const NO_FOLDER = 'none'
async function ensureFolder(token: string, sheetId: string, created: boolean, known: string): Promise<string> {
  // done once: after that the folder and the sheet are the user's to move around
  if (known && !created) return known
  try {
    // the top of My Drive may be off limits with the drive.file scope; then every place counts as "not yet tidied"
    const [parents, root] = await Promise.all([getParents(token, sheetId), getRootId(token).catch(() => '')])
    // already put somewhere by the user: leave it there
    if (root && parents.length && !parents.includes(root)) return NO_FOLDER
    const folder = (await findFolder(token)) ?? (await createFolder(token, '記帳本'))
    await moveToFolder(token, sheetId, folder, parents)
    return folder
  } catch (e) {
    if (e instanceof SheetsAuthError) throw e
    console.warn('記帳本資料夾建立失敗，下次同步會再試：', e)
    return known
  }
}

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  const token = await opts.getToken()
  const { id, info, created } = await openSpreadsheet(token, opts.spreadsheetId)
  const folderId = await ensureFolder(token, id, created, opts.folderId ?? '')

  if (!info.sheets.some((s) => s.title === DATA_TITLE)) {
    await batchUpdate(token, id, [
      { addSheet: { properties: { sheetId: DATA_SHEET_ID, title: DATA_TITLE } } },
    ])
    info.sheets.push({ title: DATA_TITLE, sheetId: DATA_SHEET_ID, hidden: false })
  }
  const dataSheet = info.sheets.find((s) => s.title === DATA_TITLE)!

  const remote = parseRows(await readValues(token, id, `'${DATA_TITLE}'!A2:E`))
  const marker = String((await readValues(token, id, `'${DATA_TITLE}'!G1`))[0]?.[0] ?? '')

  if (opts.dropSeed && remote.length) {
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
  }

  const rows = toLocal.length ? await localRows() : local
  const newest = rows.reduce((m, r) => Math.max(m, r.updatedAt), 0)
  const wantMarker = `${LAYOUT_VERSION}:${newest}`
  const [haveVersion] = marker.split(':')
  const layoutChanged = haveVersion !== String(LAYOUT_VERSION)
  const viewsStale = marker !== wantMarker

  let pushed = false
  // the data tab is rewritten whole whenever this device has something the sheet lacks
  const needData = localNewer || !remote.length
  const needViews = needData || viewsStale || layoutChanged || Boolean(opts.forceViews)

  if (needData) {
    await batchUpdate(token, id, [
      {
        updateSheetProperties: {
          properties: {
            sheetId: dataSheet.sheetId,
            gridProperties: { rowCount: Math.max(rows.length + 50, 200), columnCount: 7 },
          },
          fields: 'gridProperties(rowCount,columnCount)',
        },
      },
    ])
    await clearValues(token, id, [`'${DATA_TITLE}'!A:E`])
    const dataRows: Cell[][] = rows.map((r) => [
      r.t,
      `'${r.id}`,
      r.updatedAt,
      r.deleted ? 1 : 0,
      r.deleted ? '' : JSON.stringify(r.entity),
    ])
    await writeValues(token, id, DATA_TITLE, [HEADER, ...dataRows], 'RAW')
    pushed = true
  }

  if (needViews) {
    await writeViews(token, id, info, dataSheet, await snapshot(), opts.amortize, layoutChanged)
    await writeRange(token, id, `'${DATA_TITLE}'!G1`, [[wantMarker]])
    pushed = true
  }

  // photos go through Drive in the background; they can be many and must not hold up the sync itself
  void syncImages(token, folderId)

  return { spreadsheetId: id, folderId, url: info.url, pulled: toLocal.length, pushed }
}

async function writeViews(
  token: string,
  id: string,
  info: SpreadsheetInfo,
  dataSheet: { sheetId: number; hidden: boolean },
  snap: Snapshot,
  amortize: boolean,
  rebuild: boolean,
) {
  const specs = buildTables(snap, amortize)
  const existing = new Map(info.sheets.filter((s) => s.title !== DATA_TITLE).map((s) => [s.title, s]))
  const requests: object[] = []

  if (rebuild) {
    for (const s of existing.values()) requests.push({ deleteSheet: { sheetId: s.sheetId } })
    existing.clear()
  }

  const fresh: typeof specs = []
  specs.forEach((spec, index) => {
    const have = existing.get(spec.title)
    if (have) spec.sheetId = have.sheetId
    else {
      requests.push({
        addSheet: { properties: { sheetId: spec.sheetId, title: spec.title, index } },
      })
      fresh.push(spec)
    }
  })
  for (const spec of specs) requests.push(...sizeRequests(spec))
  for (const spec of fresh) requests.push(...styleRequests(spec))
  // These tabs are rebuilt from the hidden data tab, so a hand edit is lost on the next sync: editing one
  // asks for confirmation first (a warning, not a lock, so the app's own writes are never refused).
  const protect = specs
    .filter((spec) => !existing.get(spec.title)?.protectedWhole)
    .map((spec) => ({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: spec.sheetId },
          description: '由記帳本自動產生，在這裡修改會在下次同步時被覆蓋，請回到 App 修改',
          warningOnly: true,
        },
      },
    }))
  if (!dataSheet.hidden) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: dataSheet.sheetId, hidden: true },
        fields: 'hidden',
      },
    })
  }
  await batchUpdate(token, id, requests)
  // only a courtesy: if Google refuses it, the sync itself must still go through
  await batchUpdate(token, id, protect).catch(() => {})

  await clearValues(
    token,
    id,
    specs.map((s) => `'${s.title}'`),
  )
  for (const spec of specs) {
    await writeValues(
      token,
      id,
      spec.title,
      [spec.cols.map((c) => c.title), ...spec.rows],
      'USER_ENTERED',
    )
  }
}
