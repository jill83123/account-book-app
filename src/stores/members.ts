import { defineStore } from 'pinia'
import { computed } from 'vue'
import { remove, save, saveMany } from '@/db'
import type { Member, Rec } from '@/db/types'
import { uid } from '@/lib/id'
import { useData } from './data'

/**
 * The people money is spent with or lent to. They are managed under 更多 and picked on a record.
 * Records and loans point at a member's id, so a name can be changed in one place and every record follows.
 */
export const useMembers = defineStore('members', () => {
  const data = useData()

  /** how many records each member is on */
  const usage = computed(() => {
    const n = new Map<string, number>()
    for (const r of data.records) for (const c of r.companions ?? []) n.set(c, (n.get(c) ?? 0) + 1)
    return n
  })

  /** the most used first */
  const list = computed<Member[]>(() =>
    [...data.members].sort((a, b) => (usage.value.get(b.id) ?? 0) - (usage.value.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'zh-Hant')),
  )

  const nameOf = (id: string) => data.memberName(id)

  /** whether another member already has this name (names are how people are told apart, so each is used once) */
  const taken = (name: string, exceptId = '') => data.members.some((m) => m.id !== exceptId && m.name === name.trim())
  const takenHint = (name: string) => `${name.trim()}已存在，可以考慮用綽號`

  /** a new member. '' when the name is empty */
  async function add(name: string): Promise<string> {
    const n = name.trim()
    if (!n) return ''
    const id = uid()
    await save('members', { id, name: n })
    return id
  }

  /** the member of that name when there is one, else a new one (for a typed name); '' when the name is empty */
  async function resolve(name: string): Promise<string> {
    const n = name.trim()
    if (!n) return ''
    return data.members.find((m) => m.name === n)?.id ?? (await add(n))
  }

  /** false when the name is empty or another member has it */
  async function rename(id: string, to: string): Promise<boolean> {
    const n = to.trim()
    const m = data.memberMap.get(id)
    if (!n || !m || taken(n, id)) return false
    if (n !== m.name) await save('members', { ...m, name: n })
    return true
  }

  /** a member the loans still point at cannot go: the loan would lose its person */
  const hasLoans = (id: string) => data.loans.some((l) => l.personId === id)

  /** take a member off the list and off every record; the records themselves stay */
  async function removeMember(id: string): Promise<boolean> {
    if (hasLoans(id)) return false
    const hit = data.records.filter((r) => r.companions?.includes(id))
    await saveMany(
      'records',
      hit.map((r): Rec => {
        const rest = r.companions!.filter((c) => c !== id)
        const { companions: _drop, ...others } = r
        void _drop
        return rest.length ? { ...others, companions: rest } : others
      }),
    )
    await remove('members', id)
    return true
  }

  return { list, usage, nameOf, taken, takenHint, add, resolve, rename, hasLoans, remove: removeMember }
})
