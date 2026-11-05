import { db } from '@/db'
import { uid } from './id'

/** Shrink a photo so a receipt takes a few hundred KB, not several MB. */
export async function shrinkImage(file: Blob, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('無法處理這張圖片'))), 'image/jpeg', 0.8),
  )
}

export interface Photo {
  id: string
  /** an object URL to show it with */
  url: string
  /** only for a photo that has not been saved yet */
  blob?: Blob
}

export async function loadPhotos(recordId: string): Promise<Photo[]> {
  const rows = await db.images.where('recordId').equals(recordId).sortBy('createdAt')
  return rows.map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob) }))
}

export async function addPhoto(file: File): Promise<Photo> {
  const blob = await shrinkImage(file)
  return { id: uid(), url: URL.createObjectURL(blob), blob }
}

/** Make the stored photos of a record match what is shown: save the new ones, drop the removed ones. */
export async function savePhotos(recordId: string, shown: Photo[]) {
  const keep = new Set(shown.map((p) => p.id))
  const stored = await db.images.where('recordId').equals(recordId).primaryKeys()
  const gone = stored.filter((id) => !keep.has(id))
  await db.images.bulkDelete(gone)
  await db.imageTrash.bulkPut(gone.map((id) => ({ id })))
  const now = Date.now()
  await db.images.bulkPut(
    shown.filter((p) => p.blob).map((p, i) => ({ id: p.id, recordId, blob: p.blob!, createdAt: now + i })),
  )
}

export async function forgetPhotos(recordId: string) {
  const ids = await db.images.where('recordId').equals(recordId).primaryKeys()
  await db.images.bulkDelete(ids)
  await db.imageTrash.bulkPut(ids.map((id) => ({ id })))
}

export const releasePhotos = (photos: Photo[]) => photos.forEach((p) => URL.revokeObjectURL(p.url))
