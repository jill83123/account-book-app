/** The currency every report is kept in. Other currencies are converted with a rate when saved. */
export const BASE_CURRENCY = 'TWD'

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
