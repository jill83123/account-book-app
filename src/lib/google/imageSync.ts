/*
 * Photos travel through Google Drive, next to the spreadsheet: one JPEG per photo, tagged with the photo's id and its
 * record. The sheet only holds the text data; this keeps the two sets of photos (this device's and Drive's) alike.
 *
 *   - a photo added here and not yet in Drive is uploaded;
 *   - a photo in Drive that this device lacks is downloaded;
 *   - a photo removed here is removed from Drive (remembered in `imageTrash` until that has happened);
 *   - a photo that was in Drive before and has gone is one another device removed, so it goes here too.
 *
 * It never deletes anything it cannot be sure about: an unreadable list stops the run, and an empty Drive is read as
 * "not uploaded yet" rather than "everything was deleted".
 */
import { db } from '@/db'
import { deleteFile, downloadFile, listImageFiles, uploadImage } from './sheets'

const PARALLEL = 3

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL) {
    await Promise.all(
      items.slice(i, i + PARALLEL).map((item) =>
        run(item).catch((e) => {
          // one photo failing must not hold up the rest; it is tried again on the next sync
          console.warn('圖片同步失敗：', e)
        }),
      ),
    )
  }
}

async function run(token: string, folderId: string) {
  const remote = await listImageFiles(token)

  // removed here: take the Drive copy away too
  const trash = await db.imageTrash.toArray()
  const trashed = new Set(trash.map((t) => t.id))
  await inBatches(trash, async (t) => {
    const r = remote.get(t.id)
    if (r) await deleteFile(token, r.fileId)
    remote.delete(t.id)
    await db.imageTrash.delete(t.id)
  })

  const local = (await db.images.toArray()).filter((l) => !trashed.has(l.id))
  const driveEmpty = remote.size === 0

  const toUpload: typeof local = []
  for (const l of local) {
    if (remote.has(l.id)) {
      if (!l.synced) await db.images.update(l.id, { synced: true })
    } else if (l.synced && !driveEmpty) {
      // it was in Drive and is not any more: removed on another device
      await db.images.delete(l.id)
    } else {
      toUpload.push(l)
    }
  }
  await inBatches(toUpload, async (l) => {
    await uploadImage(token, l, folderId)
    await db.images.update(l.id, { synced: true })
  })

  // in Drive and not here
  const have = new Set(local.map((l) => l.id))
  const toGet = [...remote].filter(([id]) => !have.has(id) && !trashed.has(id))
  await inBatches(toGet, async ([id, r]) => {
    const blob = await downloadFile(token, r.fileId)
    await db.images.put({ id, recordId: r.recordId, blob, createdAt: r.createdAt, synced: true })
  })
}

let running: Promise<void> | null = null

/** One run at a time; photos can be many, so the caller does not wait for this. */
export function syncImages(token: string, folderId: string): Promise<void> {
  running ??= run(token, folderId)
    .catch((e) => console.warn('圖片同步中斷，下次同步會再試：', e))
    .finally(() => (running = null))
  return running
}
