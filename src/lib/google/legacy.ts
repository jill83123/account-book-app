/*
 * Reading what the older versions kept in a Google spreadsheet (drive.file scope), so it can be moved into the app
 * data folder once. Nothing here writes to the spreadsheet.
 */
import { DriveNotFoundError, driveCall } from './drive'

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const enc = encodeURIComponent
const SHEET_Q = `appProperties has { key='accountBook' and value='1' } and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`
const FOLDER_Q = `appProperties has { key='accountBookFolder' and value='1' } and trashed=false and mimeType='application/vnd.google-apps.folder'`

/** The spreadsheet an older version made (the newest one). */
export async function findSpreadsheet(token: string): Promise<string | null> {
  const res = await driveCall(token, `${DRIVE}/files?q=${enc(SHEET_Q)}&fields=files(id)&orderBy=modifiedTime desc&pageSize=5`)
  return ((await res.json()) as { files?: { id: string }[] }).files?.[0]?.id ?? null
}

/** The spreadsheet if it is still there and not in the trash. */
export async function usableSpreadsheet(token: string, id: string): Promise<boolean> {
  try {
    const res = await driveCall(token, `${DRIVE}/files/${id}?fields=trashed`)
    return !((await res.json()) as { trashed?: boolean }).trashed
  } catch (e) {
    if (e instanceof DriveNotFoundError) return false
    throw e
  }
}

export async function readValues(token: string, id: string, range: string): Promise<unknown[][]> {
  const res = await driveCall(token, `${SHEETS}/${id}/values/${enc(range)}?valueRenderOption=UNFORMATTED_VALUE`)
  return ((await res.json()) as { values?: unknown[][] }).values ?? []
}

/** The photos an older version put in Drive, by photo id. */
export async function listLegacyImages(token: string): Promise<Map<string, { fileId: string; recordId: string; createdAt: number }>> {
  const q = `appProperties has { key='accountBookImage' and value='1' } and trashed=false`
  const out = new Map<string, { fileId: string; recordId: string; createdAt: number }>()
  let page = ''
  do {
    const res = await driveCall(
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

/** Every spreadsheet, photo and folder an older version made, for the full reset. */
export async function listLegacyFiles(token: string): Promise<string[]> {
  const ids = new Set<string>()
  const sheets = await driveCall(token, `${DRIVE}/files?q=${enc(SHEET_Q)}&fields=files(id)&pageSize=100`)
  for (const f of ((await sheets.json()) as { files?: { id: string }[] }).files ?? []) ids.add(f.id)
  for (const r of (await listLegacyImages(token)).values()) ids.add(r.fileId)
  const folders = await driveCall(token, `${DRIVE}/files?q=${enc(FOLDER_Q)}&fields=files(id)&pageSize=100`)
  for (const f of ((await folders.json()) as { files?: { id: string }[] }).files ?? []) ids.add(f.id)
  return [...ids]
}

/** Move a file to the Drive trash (still recoverable there for 30 days). A file that is already gone counts as done. */
export async function trashFile(token: string, fileId: string) {
  try {
    await driveCall(token, `${DRIVE}/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (!(e instanceof DriveNotFoundError)) throw e
  }
}
