/* Minimal Drive v3 REST client for the hidden app data folder (drive.appdata scope). */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SPACE = 'appDataFolder'

export class DriveAuthError extends Error {}
export class DriveNotFoundError extends Error {}

export async function driveCall(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 401) throw new DriveAuthError('Google 授權已失效，請重新登入')
  if (res.status === 404) throw new DriveNotFoundError('找不到雲端檔案')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 403 && /insufficient|scope|permission/i.test(text) && !/rate|quota/i.test(text)) {
      throw new DriveAuthError('Google 沒有給這個 App 雲端硬碟的權限，請重新登入並勾選權限')
    }
    throw new Error(`Google 錯誤 ${res.status}: ${text.slice(0, 300)}`)
  }
  return res
}

const enc = encodeURIComponent

export interface SyncFile {
  id: string
  modifiedTime: string
}

const SYNC_NAME = 'sync.json'

/** The one file that holds the data of every device. The oldest wins if two were ever made at once. */
export async function findSyncFile(token: string): Promise<SyncFile | null> {
  const q = `name='${SYNC_NAME}' and trashed=false`
  const res = await driveCall(
    token,
    `${API}/files?spaces=${SPACE}&q=${enc(q)}&fields=files(id,modifiedTime)&orderBy=createdTime&pageSize=5`,
  )
  return ((await res.json()) as { files?: SyncFile[] }).files?.[0] ?? null
}

export async function readJson<T>(token: string, id: string): Promise<T> {
  const res = await driveCall(token, `${API}/files/${id}?alt=media`)
  return (await res.json()) as T
}

/** Create or replace the sync file. */
export async function writeSyncFile(token: string, existing: string | null, body: unknown): Promise<string> {
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
  if (existing) {
    await driveCall(token, `${UPLOAD}/files/${existing}?uploadType=media&fields=id`, { method: 'PATCH', body: blob })
    return existing
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name: SYNC_NAME, parents: [SPACE] })], { type: 'application/json' }))
  form.append('file', blob)
  const res = await driveCall(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form })
  return ((await res.json()) as { id: string }).id
}

// ---- photos ------------------------------------------------------------------

export interface RemoteImage {
  fileId: string
  recordId: string
  createdAt: number
}

/** Every photo in the app data folder, by photo id. Throws when the list cannot be read completely. */
export async function listImageFiles(token: string): Promise<Map<string, RemoteImage>> {
  const q = `appProperties has { key='accountBookImage' and value='1' } and trashed=false`
  const out = new Map<string, RemoteImage>()
  let page = ''
  do {
    const res = await driveCall(
      token,
      `${API}/files?spaces=${SPACE}&q=${enc(q)}&fields=nextPageToken,files(id,appProperties)&pageSize=1000${page ? `&pageToken=${enc(page)}` : ''}`,
    )
    const data = (await res.json()) as {
      nextPageToken?: string
      files?: { id: string; appProperties?: Record<string, string> }[]
    }
    for (const f of data.files ?? []) {
      const p = f.appProperties ?? {}
      if (p.imageId) {
        out.set(p.imageId, { fileId: f.id, recordId: p.recordId ?? '', createdAt: Number(p.createdAt) || Date.now() })
      }
    }
    page = data.nextPageToken ?? ''
  } while (page)
  return out
}

export async function uploadImage(token: string, img: { id: string; recordId: string; createdAt: number; blob: Blob }) {
  const meta = {
    name: `${img.id}.jpg`,
    mimeType: 'image/jpeg',
    parents: [SPACE],
    appProperties: { accountBookImage: '1', imageId: img.id, recordId: img.recordId, createdAt: String(img.createdAt) },
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', img.blob)
  await driveCall(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form })
}

export async function downloadFile(token: string, fileId: string): Promise<Blob> {
  const res = await driveCall(token, `${API}/files/${fileId}?alt=media`)
  return await res.blob()
}

/** A file that is already gone counts as deleted. */
export async function deleteFile(token: string, fileId: string) {
  try {
    await driveCall(token, `${API}/files/${fileId}`, { method: 'DELETE' })
  } catch (e) {
    if (!(e instanceof DriveNotFoundError)) throw e
  }
}

// ---- backups -----------------------------------------------------------------

export interface BackupFile {
  id: string
  name: string
  size: number
  records: number
}

const BACKUP_PREFIX = 'backup-'

export async function listBackupFiles(token: string): Promise<BackupFile[]> {
  const res = await driveCall(
    token,
    `${API}/files?spaces=${SPACE}&q=${enc(`name contains '${BACKUP_PREFIX}' and trashed=false`)}&fields=files(id,name,size,appProperties)&pageSize=100`,
  )
  const files = ((await res.json()) as { files?: { id: string; name: string; size?: string; appProperties?: Record<string, string> }[] }).files ?? []
  return files
    .filter((f) => f.name.startsWith(BACKUP_PREFIX))
    .map((f) => ({ id: f.id, name: f.name, size: Number(f.size ?? 0), records: Number(f.appProperties?.records ?? 0) }))
}

export async function createBackupFile(token: string, name: string, text: string, records: number) {
  const form = new FormData()
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name, parents: [SPACE], appProperties: { records: String(records) } })], { type: 'application/json' }),
  )
  form.append('file', new Blob([text], { type: 'application/json' }))
  await driveCall(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form })
}

export async function readText(token: string, id: string): Promise<string> {
  return await (await driveCall(token, `${API}/files/${id}?alt=media`)).text()
}

/** Everything this app keeps in the app data folder, except the backups. */
export async function deleteAllAppFiles(token: string) {
  let page = ''
  const ids: string[] = []
  do {
    const res = await driveCall(token, `${API}/files?spaces=${SPACE}&fields=nextPageToken,files(id,name)&pageSize=200${page ? `&pageToken=${enc(page)}` : ''}`)
    const data = (await res.json()) as { nextPageToken?: string; files?: { id: string; name: string }[] }
    for (const f of data.files ?? []) if (!f.name.startsWith(BACKUP_PREFIX)) ids.push(f.id)
    page = data.nextPageToken ?? ''
  } while (page)
  for (const id of ids) await deleteFile(token, id)
}
