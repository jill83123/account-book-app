import { computed } from 'vue'
import { save, saveMany } from '@/db'
import { useData } from '@/stores/data'
import { BASE_ROW_ID, baseCurrency, CURRENCIES, type CurrencyInfo } from './currency'

/** the built-in currencies the pickers offer until a choice is made */
const DEFAULT_SHOWN = new Set(['TWD', 'JPY', 'USD'])

export interface CurrencyEntry extends CurrencyInfo {
  builtin: boolean
  shown: boolean
  /** the saved row behind it, when there is one */
  rowId?: string
}

/** every currency in the order the lists show it: the ones put in place by hand first, the rest as they come */
export function useCurrencyEntries() {
  const data = useData()
  return computed<CurrencyEntry[]>(() => {
    const rows = data.currencies
    const choice = new Map(rows.filter((r) => r.builtin).map((r) => [r.code, r]))
    const builtin = CURRENCIES.map((c, i) => {
      const row = choice.get(c.code)
      return {
        place: row?.order ?? 1000 + i,
        entry: {
          ...c,
          builtin: true,
          shown: c.code === baseCurrency.value || (row?.shown ?? DEFAULT_SHOWN.has(c.code)),
          ...(row ? { rowId: row.id } : {}),
        } as CurrencyEntry,
      }
    })
    const added = rows
      .filter((r) => !r.builtin && !r.base)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((r, i) => ({
        place: r.order ?? 2000 + i,
        entry: {
          code: r.code,
          name: r.name,
          builtin: false,
          shown: r.code === baseCurrency.value || (r.shown ?? true),
          rowId: r.id,
        } as CurrencyEntry,
      }))
    return [...builtin, ...added].sort((a, b) => a.place - b.place).map((x) => x.entry)
  })
}

/** show or hide a currency in the pickers */
export async function setCurrencyShown(c: CurrencyEntry, shown: boolean) {
  const data = useData()
  const row = c.rowId ? data.currencies.find((r) => r.id === c.rowId) : undefined
  await save('currencies', {
    ...(row ?? {}),
    // a built-in one has the same id on every device, so two devices never make two rows for it
    id: c.rowId ?? `fx-${c.code}`,
    code: c.code,
    name: c.name,
    ...(c.builtin ? { builtin: true } : {}),
    shown,
  })
}

/** make this currency the default one: it is shown, and everything is counted in it */
export async function saveBaseCurrency(code: string) {
  const data = useData()
  const row = data.currencies.find((r) => r.id === BASE_ROW_ID)
  await save('currencies', { ...(row ?? {}), id: BASE_ROW_ID, code, name: '', base: true })
}

/** the name of the default currency, for sentences */
export const baseName = () => currencyName(baseCurrency.value)

/** the picker rows: the name on top, the code underneath; a currency in use stays offered even when hidden */
export function useCurrencyItems(keep?: () => string | undefined) {
  const all = useCurrencyEntries()
  return computed(() =>
    all.value
      .filter((c) => c.shown || c.code === keep?.())
      .map((c) => ({ value: c.code, label: c.name, sub: c.code })),
  )
}

/** the name for showing a ledger's or account's currency; an unknown code is shown as it is */
export function currencyName(code: string) {
  return (
    CURRENCIES.find((c) => c.code === code)?.name ??
    useData().currencies.find((c) => c.code === code && !c.base)?.name ??
    code
  )
}

/** keep the order of these currencies as given (the ones left out keep their default place after them) */
export async function saveCurrencyOrder(list: CurrencyEntry[]) {
  const data = useData()
  await saveMany(
    'currencies',
    list.map((c, order) => {
      const row = c.rowId ? data.currencies.find((r) => r.id === c.rowId) : undefined
      return {
        ...(row ?? {}),
        id: c.rowId ?? `fx-${c.code}`,
        code: c.code,
        name: c.name,
        ...(c.builtin ? { builtin: true } : {}),
        shown: c.shown,
        order,
      }
    }),
  )
}
