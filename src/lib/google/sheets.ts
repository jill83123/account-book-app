/* Minimal Google Sheets v4 / Drive v3 REST client (drive.file scope: only files this app created). */

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE = 'https://www.googleapis.com/drive/v3'

export class SheetsAuthError extends Error {}
export class SheetsNotFoundError extends Error {}

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 401) throw new SheetsAuthError('Google 授權已失效，請重新登入')
  if (res.status === 404) throw new SheetsNotFoundError('找不到試算表')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 403 && /insufficient|scope|permission/i.test(text) && !/rate|quota/i.test(text)) {
      throw new SheetsAuthError('Google 沒有給這個 App 試算表的權限，請重新登入並勾選權限')
    }
    throw new Error(`Google 錯誤 ${res.status}: ${text.slice(0, 300)}`)
  }
  return res
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })
const enc = encodeURIComponent

export interface SheetInfo {
  title: string
  sheetId: number
  hidden: boolean
  /** the whole tab already carries a protected range */
  protectedWhole?: boolean
}

export interface SpreadsheetInfo {
  id: string
  url: string
  trashed?: boolean
  sheets: SheetInfo[]
}

/** The spreadsheet this app made earlier (found again after the browser data was cleared). */
export async function findSpreadsheet(token: string): Promise<string | null> {
  const q = `appProperties has { key='accountBook' and value='1' } and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`
  const res = await call(
    token,
    `${DRIVE}/files?q=${enc(q)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`,
  )
  const data = (await res.json()) as { files?: { id: string }[] }
  return data.files?.[0]?.id ?? null
}

export async function tagSpreadsheet(token: string, id: string) {
  await call(token, `${DRIVE}/files/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ appProperties: { accountBook: '1' } }),
  })
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** The folder this app made for its files (found again on another device). */
export async function findFolder(token: string): Promise<string | null> {
  const q = `appProperties has { key='accountBookFolder' and value='1' } and trashed=false and mimeType='${FOLDER_MIME}'`
  const res = await call(token, `${DRIVE}/files?q=${enc(q)}&fields=files(id)&orderBy=createdTime&pageSize=5`)
  const data = (await res.json()) as { files?: { id: string }[] }
  return data.files?.[0]?.id ?? null
}

export async function createFolder(token: string, name: string): Promise<string> {
  const res = await call(
    token,
    `${DRIVE}/files?fields=id`,
    json({ name, mimeType: FOLDER_MIME, appProperties: { accountBookFolder: '1' } }),
  )
  return ((await res.json()) as { id: string }).id
}

/** The folders a file sits in, and the id of the top level of My Drive. */
export async function getParents(token: string, id: string): Promise<string[]> {
  const res = await call(token, `${DRIVE}/files/${id}?fields=parents`)
  return ((await res.json()) as { parents?: string[] }).parents ?? []
}

export async function getRootId(token: string): Promise<string> {
  const res = await call(token, `${DRIVE}/files/root?fields=id`)
  return ((await res.json()) as { id: string }).id
}

export async function moveToFolder(token: string, id: string, folderId: string, from: string[]) {
  const remove = from.length ? `&removeParents=${enc(from.join(','))}` : ''
  await call(token, `${DRIVE}/files/${id}?addParents=${enc(folderId)}${remove}&fields=id`, { method: 'PATCH', body: '{}' })
}

export async function createSpreadsheet(
  token: string,
  title: string,
  firstSheet: { sheetId: number; title: string },
): Promise<string> {
  const res = await call(
    token,
    SHEETS,
    json({
      properties: { title, locale: 'zh_TW', timeZone: 'Asia/Taipei' },
      sheets: [{ properties: firstSheet }],
    }),
  )
  const data = (await res.json()) as { spreadsheetId: string }
  await tagSpreadsheet(token, data.spreadsheetId).catch(() => {})
  return data.spreadsheetId
}

export async function getInfo(token: string, id: string): Promise<SpreadsheetInfo> {
  const res = await call(
    token,
    `${SHEETS}/${id}?fields=spreadsheetUrl,sheets(properties(sheetId,title,hidden),protectedRanges(range))`,
  )
  const data = (await res.json()) as {
    spreadsheetUrl: string
    sheets: {
      properties: { sheetId: number; title: string; hidden?: boolean }
      // a range with no row or column limits is the whole tab
      protectedRanges?: { range?: { startRowIndex?: number; startColumnIndex?: number } }[]
    }[]
  }
  // a spreadsheet moved to the trash can still be read; treat it as gone
  const meta = await call(token, `${DRIVE}/files/${id}?fields=trashed`).catch(() => null)
  const trashed = meta ? ((await meta.json()) as { trashed?: boolean }).trashed : undefined
  return {
    id,
    url: data.spreadsheetUrl,
    trashed,
    sheets: data.sheets.map((s) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
      hidden: Boolean(s.properties.hidden),
      protectedWhole: Boolean(
        s.protectedRanges?.some((p) => p.range?.startRowIndex == null && p.range?.startColumnIndex == null),
      ),
    })),
  }
}

export async function batchUpdate(token: string, id: string, requests: object[]) {
  if (!requests.length) return
  await call(token, `${SHEETS}/${id}:batchUpdate`, json({ requests }))
}

export async function readValues(token: string, id: string, range: string): Promise<unknown[][]> {
  const res = await call(
    token,
    `${SHEETS}/${id}/values/${enc(range)}?valueRenderOption=UNFORMATTED_VALUE`,
  )
  const data = (await res.json()) as { values?: unknown[][] }
  return data.values ?? []
}

export async function clearValues(token: string, id: string, ranges: string[]) {
  await call(token, `${SHEETS}/${id}/values:batchClear`, json({ ranges }))
}

export type Cell = string | number | null

export async function writeRange(
  token: string,
  id: string,
  range: string,
  values: Cell[][],
  input: 'RAW' | 'USER_ENTERED' = 'RAW',
) {
  await call(
    token,
    `${SHEETS}/${id}/values:batchUpdate`,
    json({ valueInputOption: input, data: [{ range, values }] }),
  )
}

/** Write in chunks so one request stays well under the size limit. */
export async function writeValues(
  token: string,
  id: string,
  title: string,
  rows: Cell[][],
  input: 'RAW' | 'USER_ENTERED',
) {
  const CHUNK = 2000
  for (let i = 0; i < rows.length || i === 0; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK)
    if (!part.length) break
    await call(
      token,
      `${SHEETS}/${id}/values:batchUpdate`,
      json({
        valueInputOption: input,
        data: [{ range: `'${title}'!A${i + 1}`, values: part.map((r) => r.map((c) => c ?? '')) }],
      }),
    )
  }
}

// ---- photos kept in Drive ---------------------------------------------------

export interface RemoteImage {
  fileId: string
  recordId: string
  createdAt: number
}

/** Every photo this app has put in Drive, by photo id. Throws when the list cannot be read completely. */
export async function listImageFiles(token: string): Promise<Map<string, RemoteImage>> {
  const q = `appProperties has { key='accountBookImage' and value='1' } and trashed=false`
  const out = new Map<string, RemoteImage>()
  let page = ''
  do {
    const res = await call(
      token,
      `${DRIVE}/files?q=${enc(q)}&fields=nextPageToken,files(id,appProperties)&pageSize=1000${page ? `&pageToken=${enc(page)}` : ''}`,
    )
    const data = (await res.json()) as {
      nextPageToken?: string
      files?: { id: string; appProperties?: Record<string, string> }[]
    }
    for (const f of data.files ?? []) {
      const p = f.appProperties ?? {}
      if (p.imageId) out.set(p.imageId, { fileId: f.id, recordId: p.recordId ?? '', createdAt: Number(p.createdAt) || Date.now() })
    }
    page = data.nextPageToken ?? ''
  } while (page)
  return out
}

export async function uploadImage(
  token: string,
  img: { id: string; recordId: string; createdAt: number; blob: Blob },
  folderId: string,
) {
  const boundary = `ab${Math.random().toString(36).slice(2)}`
  const meta = {
    name: `${img.id}.jpg`,
    mimeType: 'image/jpeg',
    appProperties: { accountBookImage: '1', imageId: img.id, recordId: img.recordId, createdAt: String(img.createdAt) },
    ...(folderId && folderId !== 'none' ? { parents: [folderId] } : {}),
  }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    img.blob,
    `\r\n--${boundary}--`,
  ])
  await call(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  })
}

export async function downloadFile(token: string, fileId: string): Promise<Blob> {
  const res = await call(token, `${DRIVE}/files/${fileId}?alt=media`)
  return await res.blob()
}

/** A file that is already gone counts as deleted. */
export async function deleteFile(token: string, fileId: string) {
  try {
    await call(token, `${DRIVE}/files/${fileId}`, { method: 'DELETE' })
  } catch (e) {
    if (!(e instanceof SheetsNotFoundError)) throw e
  }
}

/** Move a file to the Drive trash (still recoverable there for 30 days). A file that is already gone counts as done. */
export async function trashFile(token: string, fileId: string) {
  try {
    await call(token, `${DRIVE}/files/${fileId}`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) })
  } catch (e) {
    if (!(e instanceof SheetsNotFoundError)) throw e
  }
}

/** Every spreadsheet this app made (not only the newest one). */
export async function listSpreadsheets(token: string): Promise<string[]> {
  const q = `appProperties has { key='accountBook' and value='1' } and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`
  const res = await call(token, `${DRIVE}/files?q=${enc(q)}&fields=files(id)&pageSize=100`)
  return ((await res.json()) as { files?: { id: string }[] }).files?.map((f) => f.id) ?? []
}
