// 部署 Worker：  npm run deploy
// 1. 讓 wrangler.local.toml 跟上範例，有沒填的項目就停下來
// 2. 部署時把推播私鑰從設定值裡拿掉，部署完再用 Cloudflare 的加密密鑰存上去，
//    這樣儀表板看不到明文；私鑰仍然只寫在你本機的 wrangler.local.toml
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { syncConfig } from './sync-config.mjs'

const LOCAL = new URL('../wrangler.local.toml', import.meta.url)
const TEMP = new URL('../wrangler.deploy.tmp.toml', import.meta.url)
const SECRET = 'VAPID_PRIVATE_JWK'

const { unfilled } = syncConfig()
if (unfilled.length) {
  console.error(`wrangler.local.toml 還有沒填的項目：${unfilled.join('、')}`)
  if (unfilled.some((k) => k.startsWith('VAPID_')))
    console.error('（VAPID_ 開頭的金鑰請執行 node scripts/gen-vapid.mjs 產生）')
  process.exit(1)
}

const lines = readFileSync(LOCAL, 'utf8').split(/\r?\n/)
const isSecret = (l) => l.trim().startsWith(SECRET + ' =') || l.trim().startsWith(SECRET + '=')
const secretLine = lines.find(isSecret)
// 單引號包住的 JSON：去掉頭尾的引號
const secret = secretLine?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')

// 暫存一份拿掉私鑰的設定來部署，部署完就刪掉
writeFileSync(TEMP, lines.filter((l) => !isSecret(l)).join('\n'))
// 整條指令用一個字串交給 shell（Windows 要透過 shell 才找得到 npx）；裡面都是固定的字，沒有使用者輸入
const wrangler = (args, input) =>
  spawnSync(`npx wrangler ${args.join(' ')} -c wrangler.deploy.tmp.toml`, {
    cwd: new URL('..', import.meta.url),
    stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    input,
    shell: true,
  })

let status = 0
try {
  status = wrangler(['deploy']).status ?? 1
  if (status === 0 && secret) {
    console.log(`\n存入密鑰 ${SECRET} ...`)
    status = wrangler(['secret', 'put', SECRET], secret + '\n').status ?? 1
  }
} finally {
  if (existsSync(TEMP)) unlinkSync(TEMP)
}
process.exit(status)
