import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { liveQuery } from 'dexie'
import { db, table } from '@/db'
import type {
  Account,
  Base,
  Category,
  CustomCurrency,
  Ledger,
  Loan,
  Member,
  Merchant,
  Rec,
  Recurring,
  TableMap,
  TableName,
} from '@/db/types'
import { accountBalances, countedRecords } from '@/lib/calc'
import { BASE_ROW_ID, DEFAULT_BASE, setBaseCurrency } from '@/lib/currency'
import { compareRecords } from '@/lib/order'
import { useSettings } from './settings'

export const useData = defineStore('data', () => {
  const settings = useSettings()
  const ready = ref(false)

  const accounts = shallowRef<Account[]>([])
  const categories = shallowRef<Category[]>([])
  const ledgers = shallowRef<Ledger[]>([])
  const records = shallowRef<Rec[]>([])
  const merchants = shallowRef<Merchant[]>([])
  const recurrings = shallowRef<Recurring[]>([])
  const loans = shallowRef<Loan[]>([])
  const members = shallowRef<Member[]>([])
  const currencies = shallowRef<CustomCurrency[]>([])

  function live<K extends TableName>(name: K, target: { value: TableMap[K][] }, pending: Set<K>) {
    pending.add(name)
    liveQuery(() => table(name).filter((x: Base) => !x.deleted).toArray()).subscribe({
      next: (rows) => {
        target.value = rows as TableMap[K][]
        pending.delete(name)
        if (!pending.size) ready.value = true
      },
      error: (e) => console.error(e),
    })
  }

  // the default currency is a synced row; wait until the rows are in so a slow load never resets it
  watch(
    [ready, currencies],
    ([r, rows]) => {
      if (r) setBaseCurrency(rows.find((x) => x.id === BASE_ROW_ID)?.code ?? DEFAULT_BASE)
    },
    { immediate: true },
  )

  function start() {
    const pending = new Set<TableName>()
    live('accounts', accounts, pending)
    live('categories', categories, pending)
    live('ledgers', ledgers, pending)
    live('records', records, pending)
    live('merchants', merchants, pending)
    live('recurrings', recurrings, pending)
    live('loans', loans, pending)
    live('members', members, pending)
    live('currencies', currencies, pending)
  }

  const byOrder = <T extends { order: number }>(a: T[]) => [...a].sort((x, y) => x.order - y.order)

  const sortedAccounts = computed(() => byOrder(accounts.value))
  const sortedLedgers = computed(() => byOrder(ledgers.value))
  const sortedCategories = computed(() => byOrder(categories.value))
  const sortedRecords = computed(() =>
    [...records.value].sort(compareRecords),
  )

  const catMap = computed(() => new Map(categories.value.map((c) => [c.id, c])))
  const accMap = computed(() => new Map(accounts.value.map((a) => [a.id, a])))
  const ledgerMap = computed(() => new Map(ledgers.value.map((l) => [l.id, l])))
  const merchantMap = computed(() => new Map(merchants.value.map((m) => [m.id, m])))
  const memberMap = computed(() => new Map(members.value.map((m) => [m.id, m])))
  /** a member's name; '?' for one that has been removed */
  const memberName = (id: string) => memberMap.value.get(id)?.name ?? '?'

  /** the records that count in the accounts: nothing is converted, so the currencies have to match */
  const counted = computed(() => countedRecords(records.value, ledgers.value, accounts.value))
  const balances = computed(() => accountBalances(accounts.value, counted.value, loans.value))

  /** the ledger being looked at: ledgers are kept apart, so it is always one of them (the first until one is picked) */
  const ledgerId = computed({
    get: () => (ledgerMap.value.has(settings.s.ledgerId) ? settings.s.ledgerId : (sortedLedgers.value[0]?.id ?? '')),
    set: (v: string) => (settings.s.ledgerId = v),
  })
  /** the ledger a new record goes into */
  const writeLedgerId = computed(() => ledgerId.value || sortedLedgers.value[0]?.id || '')

  const ledgerRecords = computed(() =>
    ledgerId.value
      ? sortedRecords.value.filter((r) => r.ledgerId === ledgerId.value)
      : sortedRecords.value,
  )

  /** Hidden categories are left out unless asked for (the category list itself shows them). */
  const childrenOf = (parentId: string | null, kind: 'expense' | 'income', withHidden = false) =>
    sortedCategories.value.filter((c) => c.kind === kind && c.parentId === parentId && (withHidden || !c.hidden))

  /** "飲食 › 食材" */
  function catPath(id: string): string {
    const c = catMap.value.get(id)
    if (!c) return '未分類'
    const p = c.parentId ? catMap.value.get(c.parentId) : undefined
    return p ? `${p.name} › ${c.name}` : c.name
  }

  const catName = (id: string) => catMap.value.get(id)?.name ?? '未分類'

  return {
    ready,
    accounts,
    categories,
    ledgers,
    records,
    merchants,
    recurrings,
    loans,
    members,
    currencies,
    sortedAccounts,
    sortedLedgers,
    sortedCategories,
    sortedRecords,
    counted,
    catMap,
    accMap,
    ledgerMap,
    merchantMap,
    memberMap,
    memberName,
    balances,
    ledgerId,
    writeLedgerId,
    ledgerRecords,
    childrenOf,
    catPath,
    catName,
    start,
    db,
  }
})
