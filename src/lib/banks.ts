import type { Account } from '@/db/types'

/** logos live in public/banks, named by the bank code; an account's icon is stored as bank:<code> */
export const BANK_PREFIX = 'bank:'

export const BANKS: { code: string; name: string }[] = [
  { code: '700', name: '中華郵政' },
  { code: '004', name: '臺灣銀行' },
  { code: '005', name: '土地銀行' },
  { code: '006', name: '合作金庫' },
  { code: '007', name: '第一銀行' },
  { code: '008', name: '華南銀行' },
  { code: '009', name: '彰化銀行' },
  { code: '017', name: '兆豐銀行' },
  { code: '050', name: '臺灣企銀' },
  { code: '013', name: '國泰世華' },
  { code: '822', name: '中國信託' },
  { code: '012', name: '台北富邦' },
  { code: '808', name: '玉山銀行' },
  { code: '812', name: '台新銀行' },
  { code: '807', name: '永豐銀行' },
  { code: '809', name: '凱基銀行' },
  { code: '803', name: '聯邦銀行' },
  { code: '805', name: '遠東商銀' },
  { code: '806', name: '元大銀行' },
  { code: '103', name: '新光銀行' },
  { code: '048', name: '王道銀行' },
  { code: '053', name: '台中銀行' },
  { code: '011', name: '上海商銀' },
  { code: '016', name: '高雄銀行' },
  { code: '147', name: '三信銀行' },
  { code: '052', name: '渣打銀行' },
  { code: '810', name: '星展銀行' },
  { code: '081', name: '匯豐銀行' },
  { code: '021', name: '花旗銀行' },
  { code: '824', name: 'LINE Bank' },
  { code: '823', name: '將來銀行' },
  { code: '826', name: '樂天銀行' },
  { code: 'richart', name: 'Richart' },
]

/** payment apps, drawn from the same folder */
export const PAYS: { code: string; name: string }[] = [
  { code: 'linepay', name: 'LINE Pay' },
  { code: 'jkopay', name: '街口支付' },
  { code: 'easywallet', name: '悠遊付' },
  { code: 'ipass', name: '一卡通' },
  { code: 'icash', name: 'icash Pay' },
  { code: 'allpay', name: '全盈+PAY' },
  { code: 'pi', name: 'Pi 拍錢包' },
  { code: 'openwallet', name: 'OPEN錢包' },
  { code: 'paypal', name: 'PayPal' },
]

const names = new Map([...BANKS, ...PAYS].map((b) => [b.code, b.name]))

export const bankCode = (icon: string | undefined) => (icon?.startsWith(BANK_PREFIX) ? icon.slice(BANK_PREFIX.length) : undefined)
export const bankName = (code: string) => names.get(code)
export const bankLogo = (code: string) => `${import.meta.env.BASE_URL}banks/${code}.jpg`

/** the icon key an account shows: the logo it was given, else the default for its kind */
export function accountIcon(a: Pick<Account, 'kind' | 'icon'>): string {
  if (a.icon) return a.icon
  return a.kind === 'card' ? 'card' : a.kind === 'cash' ? 'coins' : a.kind === 'wallet' ? 'walletcards' : 'landmark'
}
