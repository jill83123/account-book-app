import type { EntityTable } from 'dexie'
import { db, markLocalChange, stamp } from '@/db'
import { P, type ColorRole } from './colors'

/** Colours saved by the two earlier colour sets, and the role each one played. */
const ROLE_OF: Record<string, ColorRole> = {
  // first set (soft, with a brown)
  '#f0a050': 'orange',
  '#e8b84a': 'yellow',
  '#6cc28a': 'green',
  '#ee7f9b': 'pink',
  '#a08bd8': 'violet',
  '#4cc2b8': 'teal',
  '#e0707a': 'red',
  '#b58b6a': 'indigo',
  '#8b8a87': 'gray',
  '#5b8def': 'magenta',
  // the third set's mustard yellow, replaced by a brighter gold
  '#c0a044': 'yellow',
  // the fourth set, tuned together
  '#dc8f59': 'orange',
  '#ed9f68': 'orange',
  '#27bbb4': 'teal',
  '#ab94e4': 'violet',
  '#de84a3': 'pink',
  '#f5b832': 'yellow',
  '#99b762': 'lime',
  '#6a91d9': 'navy',
  '#d27674': 'crimson',
  // second set (bright)
  '#3aa0ff': 'blue',
  '#ff8c42': 'orange',
  '#ffc01e': 'yellow',
  '#2fc77a': 'green',
  '#ff5d8f': 'pink',
  '#8b6cf6': 'violet',
  '#14c8c0': 'teal',
  '#ff5a5f': 'red',
  '#4c6fff': 'indigo',
  '#9aa3b2': 'gray',
  '#c561e8': 'magenta',
}

/** Bump this when the colours change again, so saved data is updated once. */
export const PALETTE_VERSION = 5

const newColor = (hex: string): string | undefined => {
  const role = ROLE_OF[hex.toLowerCase()]
  return role ? P[role] : undefined
}

async function recolor<T extends { id: string; color: string; updatedAt: number }>(t: EntityTable<T, 'id'>) {
  const rows = await t.filter((r) => Boolean(newColor(r.color))).toArray()
  if (rows.length) await t.bulkPut(rows.map((r) => ({ ...r, color: newColor(r.color)!, updatedAt: stamp() })))
  return rows.length
}

/** Recolour saved categories, accounts and ledgers. Colours the user chose themselves are left alone. */
export async function migratePalette(): Promise<number> {
  const n = (await recolor(db.categories)) + (await recolor(db.accounts)) + (await recolor(db.ledgers))
  if (n) markLocalChange()
  return n
}
