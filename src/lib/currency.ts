import { ref } from 'vue'

/** The default currency until another one is chosen. */
export const DEFAULT_BASE = 'TWD'
/** the fixed id of the row that keeps the choice, so two devices never make two rows */
export const BASE_ROW_ID = 'fx-base'

const CACHE_KEY = 'base-currency'
function cached(): string {
  try {
    return localStorage.getItem(CACHE_KEY) || DEFAULT_BASE
  } catch {
    return DEFAULT_BASE
  }
}

/**
 * The currency every report is kept in. Other currencies are converted with a rate when saved.
 * The choice itself is synced data; the copy kept here only stops a wrong currency flashing while the data loads.
 */
export const baseCurrency = ref(cached())

export function setBaseCurrency(code: string) {
  baseCurrency.value = code
  try {
    localStorage.setItem(CACHE_KEY, code)
  } catch {
    /* private window: the synced row still decides */
  }
}

export interface CurrencyInfo {
  code: string
  name: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'TWD', name: '新台幣' },
  { code: 'JPY', name: '日圓' },
  { code: 'USD', name: '美元' },
  { code: 'KRW', name: '韓元' },
  { code: 'CNY', name: '人民幣' },
  { code: 'HKD', name: '港幣' },
  { code: 'EUR', name: '歐元' },
  { code: 'GBP', name: '英鎊' },
  { code: 'SGD', name: '新加坡幣' },
  { code: 'THB', name: '泰銖' },
  { code: 'AUD', name: '澳幣' },
  { code: 'CAD', name: '加幣' },
]
