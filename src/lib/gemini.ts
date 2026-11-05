import type { Category } from '@/db/types'
import type { Draft } from '@/stores/ui'
import { aiToken } from './google/gis'

const API = 'https://generativelanguage.googleapis.com/v1beta'

export interface ReceiptResult {
  merchant?: string
  date?: string
  time?: string
  total?: number
  lines: { name: string; category?: string; amount: number; details?: { name: string; amount: number; qty?: number }[] }[]
}

/** how a receipt is written down: every product on its own line with its own category, or one item whose products are its details */
export type ScanMode = 'split' | 'merge'

/** "飲食 › 食材" style names of the categories the AI may choose from. */
export function expenseCategoryNames(cats: Category[]): string[] {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const out: string[] = []
  for (const c of cats.filter((x) => x.kind === 'expense')) {
    const hasKids = cats.some((k) => k.parentId === c.id)
    if (hasKids) continue
    const p = c.parentId ? byId.get(c.parentId) : undefined
    out.push(p ? `${p.name}/${c.name}` : c.name)
  }
  return out
}

/** One item with a single category; what was bought goes into its details, with a quantity when there is one. */
function buildMergePrompt(names: string[]): string {
  return [
    '你是記帳助手。請讀取我提供的發票、收據或明細照片，整理成「一個品項」的記帳資料，買的每樣東西記在細項裡。',
    '',
    '規則：',
    '1. 只輸出 JSON，不要任何說明文字，不要使用 Markdown 程式碼區塊，也不要使用任何表情符號。',
    '2. lines 只放一列：name 是這次消費的概括名稱（例如「早餐」「超市採購」），繁體中文，不超過 8 個字。',
    '3. category 必須從下面的分類清單中挑最適合整筆消費的一個，原文照抄（包含斜線）；不要為每樣東西各挑分類。',
    '4. details 是買的每樣東西，各一項：name 用繁體中文，去掉條碼與無意義的縮寫；amount 是該項的小計；有明確的數量才填 qty（數字，不含單位），看不出來就省略。',
    '5. 折扣、優惠、折價券放進 details，用負數金額，name 寫「折扣」。',
    '6. 這一列的 amount 是 details 全部加起來的實付金額。amount 一律是新台幣整數，不含小數點與貨幣符號。',
    '7. date 格式 YYYY-MM-DD，time 格式 HH:mm，看不出來就省略該欄位。民國年請換算成西元年。',
    '8. total 是發票上的實付總額。',
    '',
    `分類清單：${names.join('、')}`,
    '',
    '輸出格式：',
    '{"merchant":"商家名稱","date":"2026-11-04","time":"08:10","total":60,"lines":[{"name":"早餐","category":"飲食/早餐","amount":60,"details":[{"name":"蛋餅","amount":35},{"name":"紅茶","qty":1,"amount":25}]}]}',
  ].join('\n')
}

/** The instructions; also works when pasted into any AI chat together with a photo of the receipt. */
export function buildPrompt(cats: Category[], mode: ScanMode = 'split'): string {
  const names = expenseCategoryNames(cats)
  if (mode === 'merge') return buildMergePrompt(names)
  return [
    '你是記帳助手。請讀取我提供的發票、收據或明細照片，整理成一筆記帳資料。',
    '',
    '規則：',
    '1. 只輸出 JSON，不要任何說明文字，不要使用 Markdown 程式碼區塊，也不要使用任何表情符號。',
    '2. 品項名稱使用繁體中文，去掉條碼、數量代號與無意義的縮寫，讓人一看就懂。',
    '3. 每個品項各自一列；同一商品買多件時金額填該品項的小計。',
    '4. 折扣、優惠、折價券用負數金額單獨一列，品項名稱寫「折扣」。',
    '5. amount 一律是新台幣整數，不含小數點與貨幣符號。',
    `6. category 必須從下面的分類清單中挑最適合的一個，原文照抄（包含斜線）${names.includes('其他') ? '；真的不適用才填「其他」' : ''}。`,
    '7. date 格式 YYYY-MM-DD，time 格式 HH:mm，看不出來就省略該欄位。民國年請換算成西元年。',
    '8. total 是發票上的實付總額。',
    '',
    `分類清單：${names.join('、')}`,
    '',
    '輸出格式：',
    '{"merchant":"商家名稱","date":"2026-11-04","time":"14:30","total":350,"lines":[{"name":"杏鮑菇","category":"飲食/食材","amount":120}]}',
  ].join('\n')
}

export function parseResult(raw: string): ReceiptResult {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1]!.trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('找不到 JSON，請確認貼上的是完整的回覆')
  let data: unknown
  try {
    data = JSON.parse(s.slice(a, b + 1))
  } catch {
    throw new Error('JSON 格式有誤，請重新產生或檢查有沒有漏掉括號')
  }
  const o = data as Record<string, unknown>
  const lines = Array.isArray(o.lines) ? o.lines : []
  const out: ReceiptResult = {
    merchant: typeof o.merchant === 'string' ? o.merchant.trim() : undefined,
    date: typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : undefined,
    time: typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time) ? o.time.padStart(5, '0') : undefined,
    total: typeof o.total === 'number' ? Math.round(o.total) : undefined,
    lines: lines
      .map((l) => {
        const x = l as Record<string, unknown>
        return {
          name: String(x.name ?? '').trim(),
          category: typeof x.category === 'string' ? x.category : undefined,
          amount: Math.round(Number(x.amount) || 0),
          details: Array.isArray(x.details)
            ? x.details
                .map((d) => {
                  const y = d as Record<string, unknown>
                  const qty = Number(y.qty)
                  return { name: String(y.name ?? '').trim(), amount: Math.round(Number(y.amount) || 0), ...(qty > 0 ? { qty } : {}) }
                })
                .filter((d) => d.name || d.amount)
            : undefined,
        }
      })
      .filter((l) => l.name || l.amount),
  }
  if (!out.lines.length) throw new Error('沒有讀到任何品項')
  return out
}

/** Map the AI's category names back to the user's category ids. */
export function toDraft(res: ReceiptResult, cats: Category[], merchantNameOnly = true): Draft {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const expense = cats.filter((c) => c.kind === 'expense')
  const full = (c: Category) => {
    const p = c.parentId ? byId.get(c.parentId) : undefined
    return p ? `${p.name}/${c.name}` : c.name
  }
  // an unknown name goes to a top-level 其他 when there is one; otherwise it is left for the user to choose
  const other = expense.find((c) => c.name === '其他' && !c.parentId && !cats.some((k) => k.parentId === c.id))
  const pick = (name?: string) => {
    if (!name) return other
    const n = name.replace(/\s/g, '').replace(/[›>]/g, '/')
    return (
      expense.find((c) => full(c) === n) ??
      expense.find((c) => c.name === n.split('/').pop()) ??
      expense.find((c) => c.name === n) ??
      other
    )
  }
  void merchantNameOnly
  return {
    merchantName: res.merchant || undefined,
    date: res.date,
    time: res.time,
    lines: res.lines.map((l) => ({
      name: l.name,
      categoryId: pick(l.category)?.id ?? '',
      amount: l.amount,
      ...(l.details?.length ? { details: l.details } : {}),
    })),
  }
}

/** Shrink a photo before sending: smaller upload, fewer tokens. */
export async function prepareImage(file: File, max = 1600): Promise<{ mime: string; data: string }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return { mime: 'image/jpeg', data: url.split(',')[1]! }
}

/** The response shape; with categories given, the model can only answer with one of them. */
const schemaFor = (categories: string[], mode: ScanMode = 'split') => ({
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    date: { type: 'STRING' },
    time: { type: 'STRING' },
    total: { type: 'INTEGER' },
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          category: categories.length ? { type: 'STRING', enum: categories } : { type: 'STRING' },
          amount: { type: 'INTEGER' },
          ...(mode === 'merge'
            ? {
                details: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: { name: { type: 'STRING' }, amount: { type: 'INTEGER' }, qty: { type: 'NUMBER' } },
                    required: ['name', 'amount'],
                  },
                },
              }
            : {}),
        },
        required: ['name', 'amount'],
      },
    },
  },
  required: ['lines'],
})

async function failure(res: Response): Promise<Error> {
  let msg = ''
  try {
    msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''
  } catch {
    /* ignore */
  }
  if (res.status === 429) return new Error('Gemini 免費額度暫時用完，請稍後再試')
  if (res.status === 400 && /API key/i.test(msg)) return new Error('Gemini API 金鑰無效')
  if (res.status === 404) return new Error(`找不到模型，請到「AI 發票」換一個模型。${msg}`)
  return new Error(`Gemini 錯誤 ${res.status}${msg ? `：${msg}` : ''}`)
}

/**
 * Where the calls go: the sync Worker's AI proxy when it is set up and the Google account is signed in (the key
 * lives there), else straight to Gemini with the key typed on this device.
 */
async function route(key: string, workerUrl: string): Promise<{ proxy: boolean; base: string; headers: Record<string, string> }> {
  const worker = workerUrl.trim().replace(/\/+$/, '')
  if (worker) {
    const token = await aiToken()
    if (token) return { proxy: true, base: `${worker}/ai`, headers: { Authorization: `Bearer ${token}` } }
  }
  if (!key) throw new Error('請先登入 Google 同步，或到「AI 發票」填入 Gemini API 金鑰')
  return { proxy: false, base: API, headers: { 'x-goog-api-key': key } }
}

/** tried after the chosen model when it is overloaded; stable Flash-Lite / Flash models that read photos */
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash']

export async function scanReceipt(
  file: File,
  opts: { key: string; workerUrl: string; model: string; cats: Category[]; mode?: ScanMode },
): Promise<ReceiptResult> {
  const r = await route(opts.key, opts.workerUrl)
  const img = await prepareImage(file)
  const prompt = buildPrompt(opts.cats, opts.mode)
  const schema = schemaFor(expenseCategoryNames(opts.cats), opts.mode)

  const call = (model: string) =>
    fetch(r.proxy ? `${r.base}/generate?model=${encodeURIComponent(model)}` : `${r.base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...r.headers },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: img.mime, data: img.data } }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: schema,
          // reading a receipt needs no long reasoning, and the newer models "think" for a long time by default
          thinkingConfig: /^gemini-2\.5/.test(model)
            ? { thinkingBudget: 0 }
            : { thinkingLevel: /^gemini-3\.8/.test(model) ? 'low' : 'minimal' }, // 3.8 Flash has no "minimal"
        },
      }),
      signal: AbortSignal.timeout(40_000),
    })

  // a busy model (503) or a stalled one is not the user's fault: the next model in line gets the same photo
  let res: Response | undefined
  let lastError: Error | undefined
  for (const model of [opts.model, ...FALLBACK_MODELS.filter((m) => m !== opts.model)].slice(0, 3)) {
    try {
      res = await call(model)
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        lastError = new Error('辨識等太久了，請再試一次，或換一張較小、較清楚的照片')
        continue
      }
      throw e
    }
    if (res.status !== 503 && res.status !== 500) break
    lastError = new Error('Gemini 目前使用的人太多，請過一分鐘再試')
    res = undefined
  }
  if (!res) throw lastError ?? new Error('辨識失敗，請再試一次')
  if (!res.ok) throw await failure(res)
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini 沒有回傳內容，換一張更清楚的照片試試')
  return parseResult(text)
}

/** Models the key can call with generateContent, newest names first. */
export async function listModels(key: string, workerUrl: string): Promise<string[]> {
  const r = await route(key, workerUrl)
  const res = await fetch(r.proxy ? `${r.base}/models` : `${r.base}/models?pageSize=200`, { headers: r.headers })
  if (!res.ok) throw await failure(res)
  const data = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[]
  }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    // Flash models have a free quota and read photos; Pro, image, voice and live models only add confusion
    .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|live|audio|native/.test(n))
    .sort()
    .reverse()
}
