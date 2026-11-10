import type { Rec } from '@/db/types'

export interface ItemName {
  name: string
  count: number
  /** 最近一次用到的日期 */
  at: string
  /** 在那一筆記錄的細項裡排第幾個 */
  pos: number
}

/** 記錄裡用過的細項名稱：釘選的在前，再來次數多的，次數一樣的最近用過的在前，再依細項在記錄裡的排列順序（跟記帳時的歷史細項同樣排法） */
export function collectItemNames(records: Rec[], pinned: Set<string> = new Set()): ItemName[] {
  const map = new Map<string, ItemName>()
  for (const r of records) {
    for (const l of r.lines) {
      ;(l.details ?? []).forEach((d, i) => {
        const name = d.name.trim()
        if (!name) return
        const cur = map.get(name)
        const newer = !cur || r.date >= cur.at
        map.set(name, {
          name,
          count: (cur?.count ?? 0) + 1,
          at: newer ? r.date : cur.at,
          pos: newer ? i : cur.pos,
        })
      })
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      Number(pinned.has(b.name)) - Number(pinned.has(a.name)) ||
      b.count - a.count ||
      b.at.localeCompare(a.at) ||
      a.pos - b.pos ||
      a.name.localeCompare(b.name),
  )
}
