// Makes a VAPID key pair for the daily reminders:  node scripts/gen-vapid.mjs
// Both keys are written into wrangler.local.toml (ignored by git) and nothing is printed, so the
// private key never lands in a public file. wrangler.toml stays an example with placeholders.
import { readFileSync, writeFileSync } from 'node:fs'
import { syncConfig } from './sync-config.mjs'

const local = new URL('../wrangler.local.toml', import.meta.url)
// makes the private copy from the example if it is missing, or brings it up to date
const { created } = syncConfig()
let lines = readFileSync(local, 'utf8').split(/\r?\n/)

// the line of a key, matched by text so no pattern can miss it
const find = (key) => lines.findIndex((l) => l.trim().startsWith(key + ' =') || l.trim().startsWith(key + '='))
const hasValue = (key) => {
  const at = find(key)
  return at >= 0 && lines[at].split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') !== ''
}

if (hasValue('VAPID_PRIVATE_JWK') && !process.argv.includes('--force')) {
  console.error('wrangler.local.toml already has a private key.')
  console.error('A new key pair would stop every device that turned the reminder on from receiving it.')
  console.error('Run with --force only if you really want that.')
  process.exit(1)
}

const { subtle } = globalThis.crypto
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const publicKey = Buffer.from(await subtle.exportKey('raw', pair.publicKey)).toString('base64url')
const jwk = await subtle.exportKey('jwk', pair.privateKey)
const privateKey = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })

// replace the key's line, or add it under [vars]
const set = (key, value) => {
  const line = `${key} = '${value}'`
  const at = find(key)
  if (at >= 0) lines[at] = line
  else lines.splice(lines.findIndex((l) => l.trim() === '[vars]') + 1, 0, line)
}
set('VAPID_PUBLIC_KEY', publicKey)
set('VAPID_PRIVATE_JWK', privateKey)
writeFileSync(local, lines.join('\n'))

console.log(`Keys written to worker/wrangler.local.toml${created ? ' (created from wrangler.toml)' : ''}`)
console.log('\nNext: fill in the other values in that file, then')
console.log('   npx wrangler deploy -c wrangler.local.toml')
