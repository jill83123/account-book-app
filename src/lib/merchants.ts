import { db, markLocalChange, stamp } from '@/db'
import type { Merchant, MerchantItem, Rec } from '@/db/types'
import { uid } from './id'

export interface Suggestion {
  name: string
  categoryId: string
  price: number
  count: number
  lastUsed: string
  /** the merchant it came from when suggesting across all merchants */
  merchant?: string
}

/** How worth suggesting an item is: used often, and recently. */
function score(i: Pick<MerchantItem, 'count' | 'lastUsed'>): number {
  const days = Math.max(0, (Date.now() - new Date(i.lastUsed).getTime()) / 86400000)
  return i.count * 10 - Math.min(days, 300) / 10
}

/**
 * Items to offer under the name field. With a merchant: that merchant's items. Without one: items
 * from every merchant, but only once something has been typed (otherwise the list is noise).
 */
export function suggest(merchants: Merchant[], merchantId: string | undefined, query: string): Suggestion[] {
  const q = query.trim().toLowerCase()
  const out: Suggestion[] = []
  const take = (m: Merchant) => {
    for (const i of m.items) {
      if (q && !i.name.toLowerCase().includes(q)) continue
      if (q && i.name.toLowerCase() === q) continue
      out.push({ ...i, merchant: m.name })
    }
  }
  if (merchantId) {
    const m = merchants.find((x) => x.id === merchantId)
    if (m) take(m)
  } else if (q) {
    merchants.forEach(take)
  }
  const seen = new Set<string>()
  return out
    .sort((a, b) => score(b) - score(a))
    .filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)))
    .slice(0, 24)
}

/** Remember the merchant and what was bought there. Returns the merchant id (made if new). */
export async function learn(
  name: string,
  existingId: string | undefined,
  rec: Pick<Rec, 'type' | 'lines' | 'date' | 'accountId'>,
  /** which items to remember or forget; without it every item is remembered */
  items?: { keep: Set<string>; forget: Set<string> },
): Promise<string | undefined> {
  const trimmed = name.trim()
  if (!trimmed && !existingId) return undefined
  const found =
    (existingId ? await db.merchants.get(existingId) : undefined) ??
    (await db.merchants.filter((m) => !m.deleted && m.name === trimmed).first())
  const m: Merchant = found
    ? { ...found, items: [...found.items] }
    : { id: uid(), name: trimmed, items: [], updatedAt: 0 }
  if (rec.type !== 'transfer') {
    for (const l of rec.lines) {
      const itemName = l.name.trim()
      if (!itemName || l.amount <= 0 || !l.categoryId) continue
      if (items && !items.keep.has(itemName)) continue
      const at = m.items.findIndex((i) => i.name === itemName)
      const prev = at >= 0 ? m.items[at]! : undefined
      const item: MerchantItem = {
        name: itemName,
        categoryId: l.categoryId,
        price: l.amount,
        count: (prev?.count ?? 0) + 1,
        lastUsed: rec.date,
      }
      if (at >= 0) m.items[at] = item
      else m.items.push(item)
    }
    if (!m.defaultAccountId && rec.accountId) m.defaultAccountId = rec.accountId
    if (items) m.items = m.items.filter((i) => !items.forget.has(i.name))
  }
  await db.merchants.put({ ...m, deleted: false, updatedAt: stamp() })
  markLocalChange()
  return m.id
}
