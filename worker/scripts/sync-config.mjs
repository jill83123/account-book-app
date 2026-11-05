// 讓 wrangler.local.toml 跟上範例 wrangler.toml：  node scripts/sync-config.mjs [--check]
// 本機設定檔的註解、排版、項目順序都以範例為準，你填的值照舊保留：
// - 沒有 wrangler.local.toml 就從範例複製一份
// - 範例新增的設定、新的區塊會補進去；範例改了註解或排版，也會跟著更新
// - 範例沒有、但你自己加的項目會留在原本的區塊最後
// - 列出還是佔位字、沒填的項目；加上 --check 時，有沒填的就以錯誤結束（部署前用）
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const template = new URL('../wrangler.toml', import.meta.url)
const local = new URL('../wrangler.local.toml', import.meta.url)

// 範例裡的佔位字：空字串，或是範例才會出現的假值
const PLACEHOLDER = /^(""|''|".*(xxxx|username\.github\.io|you@example\.com|REPLACE_WITH).*")$/

const isHeader = (l) => l.trim().startsWith('[')
const isSetting = (l) => !l.trim().startsWith('#') && !isHeader(l) && l.includes('=')
const keyOf = (l) => l.split('=')[0].trim()
const valueOf = (l) => l.split('=').slice(1).join('=').trim()

/** 把每個設定項目對應到它所在的區塊：{ '[vars]': Map(key -> 整行) } */
function settingsByHeader(lines) {
  const out = new Map([['', new Map()]])
  let header = ''
  for (const l of lines) {
    if (isHeader(l)) {
      header = l.trim()
      if (!out.has(header)) out.set(header, new Map())
    } else if (isSetting(l)) out.get(header).set(keyOf(l), l)
  }
  return out
}

export function syncConfig() {
  const created = !existsSync(local)
  if (created) copyFileSync(template, local)

  const tpl = readFileSync(template, 'utf8').split(/\r?\n/)
  const current = readFileSync(local, 'utf8')
  const mine = settingsByHeader(current.split(/\r?\n/))

  // 以範例為底，已有的設定換成你的那一行
  const out = []
  const added = []
  const seen = new Map() // header -> 範例裡出現過的 key
  let header = ''
  // 範例裡每個區塊最後一個設定的位置，之後把你自己加的項目補在那裡
  const lastSetting = new Map()
  for (const l of tpl) {
    if (isHeader(l)) header = l.trim()
    if (isSetting(l)) {
      const key = keyOf(l)
      const theirs = mine.get(header)?.get(key)
      if (!seen.has(header)) seen.set(header, new Set())
      seen.get(header).add(key)
      if (theirs === undefined) added.push(header && header !== '[vars]' ? `${header} ${key}` : key)
      out.push(theirs ?? l)
      lastSetting.set(header, out.length)
    } else out.push(l)
  }
  // 你自己加的、範例沒有的項目
  const extras = []
  for (const [h, settings] of mine) {
    for (const [key, line] of settings) {
      if (seen.get(h)?.has(key)) continue
      if (lastSetting.has(h)) extras.push({ at: lastSetting.get(h), line })
      else extras.push({ at: out.length, line, header: h })
    }
  }
  // 由後往前插，位置才不會錯開
  for (const e of extras.sort((a, b) => b.at - a.at)) {
    out.splice(e.at, 0, ...(e.header ? ['', e.header, e.line] : [e.line]))
  }

  const text = out.join('\n').replace(/\n*$/, '\n')
  const changed = text.replace(/\r\n/g, '\n') !== current.replace(/\r\n/g, '\n')
  if (changed) writeFileSync(local, text)

  // 還是佔位字的項目
  const unfilled = out
    .filter(isSetting)
    .filter((l) => PLACEHOLDER.test(valueOf(l)))
    .map(keyOf)
  return { created, added, changed, unfilled }
}

// 直接執行時
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { created, added, changed, unfilled } = syncConfig()
  if (created) console.log('已從 wrangler.toml 建立 wrangler.local.toml')
  else if (changed) console.log('已讓 wrangler.local.toml 的註解與排版跟上範例，你填的值都保留')
  if (added.length) console.log(`範例有新的設定，已補進 wrangler.local.toml：${added.join('、')}`)
  if (unfilled.length) {
    console.error(`wrangler.local.toml 還有沒填的項目：${unfilled.join('、')}`)
    if (unfilled.some((k) => k.startsWith('VAPID_')))
      console.error('（VAPID_ 開頭的金鑰請執行 node scripts/gen-vapid.mjs 產生）')
    if (process.argv.includes('--check')) process.exit(1)
  } else if (!created && !changed) console.log('wrangler.local.toml 已是最新，沒有要填的項目')
}
