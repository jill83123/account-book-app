import type { Rec } from '@/db/types'

/**
 * The order of records, newest day first. Within a day: records nobody has placed by hand come first (a record
 * just added is on top; timed ones latest first, those without a time after them), then the ones placed by hand,
 * in the order they were left in.
 */
export function compareRecords(a: Rec, b: Rec): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date)
  const ap = a.pos !== undefined
  const bp = b.pos !== undefined
  if (ap && bp) return a.pos! - b.pos!
  if (ap !== bp) return ap ? 1 : -1
  // records added since the time field went away have none and are the newest, so they come first
  if (a.time !== b.time) {
    if (!a.time) return -1
    if (!b.time) return 1
    return b.time.localeCompare(a.time)
  }
  return (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt)
}
