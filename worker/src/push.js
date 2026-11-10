/**
 * Bookkeeping reminders over Web Push.
 *
 * The app uploads its push subscription together with the reminder slots it worked out
 * (a time plus a short text); its Durable Object sends each slot when its time has come.
 * Only subscriptions and those short texts are stored, never amounts or records.
 *
 *   GET  /push/key                              -> { publicKey }
 *   POST /push/sync   { subscription, slots, group } -> {}
 *   POST /push/recorded { group, day }           -> {}  (a day has a record: the sheet's other devices skip the daily wording)
 *   POST /push/unsubscribe { endpoint }         -> {}
 *   POST /push/test   { endpoint }              -> {}
 *
 * slot = { t: epoch ms, title: string, body: string, day?: 'YYYY-MM-DD', rest?: string }
 * day and rest are set when the body holds the daily wording; rest is the body without it.
 */

/** a slot this long past its time is dropped instead of sent (the phone was unreachable) */
const SLOT_GRACE_MS = 6 * 60 * 60 * 1000
const MAX_SLOTS = 14
/** a device that never syncs again is forgotten after this long */
const RECORD_TTL = 30 * 24 * 60 * 60 * 1000
/** only the push services of the browsers are sent to, never an address a client made up */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

const enc = new TextEncoder()

function b64uDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function b64uEncode(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  )
}

/** RFC 8291 payload encryption (aes128gcm) for one push subscription. */
async function encrypt(sub, payload) {
  const uaPublic = b64uDecode(sub.keys.p256dh)
  const authSecret = b64uDecode(sub.keys.auth)
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' }
  const eph = await crypto.subtle.generateKey(ecdh, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, ecdh, false, [])
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256),
  )
  const prk = await hkdf(
    authSecret,
    secret,
    concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // a single record: the payload followed by the 0x02 "last record" delimiter
  const body = concat(enc.encode(JSON.stringify(payload)), new Uint8Array([2]))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, body))
  // header: salt, record size 4096, key id length, sender public key
  return concat(salt, new Uint8Array([0, 0, 0x10, 0, asPublic.length]), asPublic, cipher)
}

async function vapidHeader(env, endpoint) {
  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (o) => b64uEncode(enc.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  })}`
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)),
  )
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`
}

/** Resolves true when delivered, false when the subscription is gone, throws on a temporary failure. */
async function send(env, sub, payload) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '21600',
      Urgency: 'normal',
    },
    body: await encrypt(sub, payload),
  })
  if (res.status === 404 || res.status === 410) return false
  if (!res.ok) throw new Error(`push service answered ${res.status}`)
  return true
}

export function messageOf(slot) {
  return slot.title && slot.body ? { title: slot.title, body: slot.body, url: './' } : null
}

function pushHost(endpoint) {
  try {
    const url = new URL(endpoint)
    return (
      url.protocol === 'https:' &&
      PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
    )
  } catch {
    return false
  }
}

const validSub = (s) =>
  s &&
  typeof s.endpoint === 'string' &&
  s.endpoint.length <= 1000 &&
  pushHost(s.endpoint) &&
  typeof s.keys?.p256dh === 'string' &&
  s.keys.p256dh.length <= 200 &&
  typeof s.keys?.auth === 'string' &&
  s.keys.auth.length <= 100

/** the object name of a group: a hash of the sheet id, so the id itself is not kept */
const groupName = (group) => sha256Hex('group:' + group)

const dueSlot =(slots, sent, now) =>
  slots.filter((s) => s.t <= now && s.t > sent && now - s.t < SLOT_GRACE_MS).at(-1)

const DAY = /^\d{4}-\d{2}-\d{2}$/
const validGroup = (g) => typeof g === 'string' && g.length > 0 && g.length <= 200
/** how many recorded days a group keeps */
const KEEP_DAYS = 5

const validSlot = (s) =>
  s &&
  Number.isFinite(s.t) &&
  typeof s.title === 'string' &&
  s.title.length <= 60 &&
  typeof s.body === 'string' &&
  s.body.length <= 200 &&
  (s.day === undefined || (DAY.test(s.day) && typeof s.rest === 'string' && s.rest.length <= 200))

const cleanSlot = (s) =>
  s.day === undefined
    ? { t: s.t, title: s.title, body: s.body }
    : { t: s.t, title: s.title, body: s.body, day: s.day, rest: s.rest }

/** The slot as it should go out now: without the daily wording when the day was recorded elsewhere. */
export function shownSlot(slot, recorded) {
  return slot.day !== undefined && recorded ? { ...slot, body: slot.rest } : slot
}

/**
 * One Durable Object per device. It keeps that device's subscription and slots and wakes itself
 * with an alarm exactly when the next slot is due, so nothing has to poll on a schedule.
 */
export class PushDevice {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  /** Alarm at the next slot that can still be sent; with none left, at the time the record expires. */
  async plan(rec) {
    const now = Date.now()
    const next = rec.slots.filter((s) => s.t > rec.sent && now - s.t < SLOT_GRACE_MS).map((s) => s.t)
    await this.state.storage.setAlarm(next.length ? Math.max(Math.min(...next), now) : now + RECORD_TTL)
  }

  async fetch(request) {
    const body = await request.json()
    const reply = (b, status) => Response.json(b, { status })
    const rec = await this.state.storage.get('rec')

    // these two run on the object of a group (devices sharing one sheet), not of a device
    if (body.op === 'recorded') {
      const days = (await this.state.storage.get('days')) ?? []
      if (!days.includes(body.day)) {
        await this.state.storage.put('days', [...days, body.day].sort().slice(-KEEP_DAYS))
      }
      return reply({}, 200)
    }
    if (body.op === 'isRecorded') {
      const days = (await this.state.storage.get('days')) ?? []
      return reply({ recorded: days.includes(body.day) }, 200)
    }

    if (body.op === 'sync') {
      const sent = rec?.sent ?? 0
      const slots = body.slots.filter((x) => x.t > sent)
      const next = { sub: body.sub, slots, sent, group: body.group }
      // an upload that changes nothing costs no write
      if (!rec || JSON.stringify(rec) !== JSON.stringify(next)) await this.state.storage.put('rec', next)
      await this.plan(next)
      return reply({}, 200)
    }
    if (body.op === 'unsubscribe') {
      await this.state.storage.deleteAll()
      return reply({}, 200)
    }
    if (body.op === 'test') {
      if (!rec) return reply({ error: 'not_subscribed' }, 404)
      try {
        const ok = await send(this.env, rec.sub, {
          title: '測試通知',
          body: '收到這則通知，記帳提醒就能正常運作。',
          url: './',
        })
        if (!ok) {
          await this.state.storage.deleteAll()
          return reply({ error: 'subscription_expired' }, 410)
        }
        return reply({}, 200)
      } catch {
        return reply({ error: 'push_failed' }, 502)
      }
    }
    return reply({ error: 'bad_request' }, 400)
  }

  /** Has any device of this sheet recorded the day of a daily slot? A failed lookup counts as no. */
  async recordedElsewhere(rec, slot) {
    if (slot.day === undefined || !rec.group) return false
    try {
      const group = this.env.PUSH_DEVICE.get(this.env.PUSH_DEVICE.idFromName(await groupName(rec.group)))
      const res = await group.fetch('https://device/', {
        method: 'POST',
        body: JSON.stringify({ op: 'isRecorded', day: slot.day }),
      })
      return Boolean((await res.json()).recorded)
    } catch {
      return false
    }
  }

  /** Send the slot whose time has come, then set the alarm for the next one. */
  async alarm() {
    const rec = await this.state.storage.get('rec')
    if (!rec) return
    const now = Date.now()
    const slot = dueSlot(rec.slots, rec.sent, now)
    if (slot) {
      const message = messageOf(shownSlot(slot, await this.recordedElsewhere(rec, slot)))
      try {
        const ok = message ? await send(this.env, rec.sub, message) : true
        if (!ok) return await this.state.storage.deleteAll()
      } catch {
        // temporary failure: try again soon, until the grace time is over
        await this.state.storage.setAlarm(now + 5 * 60 * 1000)
        return
      }
      rec.sent = slot.t
    }
    rec.slots = rec.slots.filter((s) => s.t > now)
    // nothing left and nobody synced for a long time: the device is gone
    if (!slot && !rec.slots.length) return await this.state.storage.deleteAll()
    await this.state.storage.put('rec', rec)
    await this.plan(rec)
  }
}

/** Returns a Response for a /push route, or null when the path is not one. */
export async function handlePush(request, env, path, body, reply) {
  if (!path.startsWith('/push/')) return null
  if (!env.PUSH_DEVICE || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK)
    return reply({ error: 'push_not_configured' }, 500)

  if (path === '/push/key' && request.method === 'GET')
    return reply({ publicKey: env.VAPID_PUBLIC_KEY }, 200)
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)

  const call = async (endpoint, payload) => {
    const device = env.PUSH_DEVICE.get(env.PUSH_DEVICE.idFromName(await sha256Hex(endpoint)))
    const res = await device.fetch('https://device/', { method: 'POST', body: JSON.stringify(payload) })
    return reply(await res.json(), res.status)
  }

  if (path === '/push/sync') {
    if (!validSub(body.subscription) || !Array.isArray(body.slots))
      return reply({ error: 'bad_request' }, 400)
    const slots = body.slots.filter(validSlot).slice(0, MAX_SLOTS).map(cleanSlot)
    const { endpoint, keys } = body.subscription
    const sub = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
    const group = validGroup(body.group) ? body.group : ''
    return call(endpoint, { op: 'sync', sub, slots, group })
  }

  if (path === '/push/recorded') {
    if (!validGroup(body.group) || typeof body.day !== 'string' || !DAY.test(body.day))
      return reply({ error: 'bad_request' }, 400)
    const device = env.PUSH_DEVICE.get(env.PUSH_DEVICE.idFromName(await groupName(body.group)))
    const res = await device.fetch('https://device/', {
      method: 'POST',
      body: JSON.stringify({ op: 'recorded', day: body.day }),
    })
    return reply(await res.json(), res.status)
  }

  if (path === '/push/unsubscribe' || path === '/push/test') {
    if (typeof body.endpoint !== 'string') return reply({ error: 'bad_request' }, 400)
    return call(body.endpoint, { op: path === '/push/unsubscribe' ? 'unsubscribe' : 'test' })
  }

  return reply({ error: 'not_found' }, 404)
}
