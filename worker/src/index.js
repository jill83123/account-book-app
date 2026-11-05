/**
 * Holds the Google OAuth client secret so the browser app can use a refresh token.
 * The Google part is stateless: tokens only pass through.
 *
 *   GET  /config                      -> { clientId }
 *   POST /token    { code }           -> { access_token, expires_in, refresh_token, scope }
 *   POST /refresh  { refresh_token }  -> { access_token, expires_in, scope }
 *   POST /revoke   { token }          -> {}
 *   /push/*                           -> reminders, see push.js (the only thing stored here)
 */

import { handlePush, sendDue } from './push.js'
import { handleAi } from './ai.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

async function exchange(env, params) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const cors = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : null

    if (!cors) return json({ error: 'forbidden_origin' }, 403, {})
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const path = new URL(request.url).pathname
    if (path.startsWith('/push/')) {
      const pushBody = request.method === 'POST' ? await request.json().catch(() => null) : {}
      if (!pushBody || typeof pushBody !== 'object') return json({ error: 'bad_request' }, 400, cors)
      return handlePush(request, env, path, pushBody, (b, status) => json(b, status, cors))
    }
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      return json({ error: 'worker_not_configured' }, 500, cors)
    if (path.startsWith('/ai/')) return handleAi(request, env, path, cors)
    if (request.method === 'GET' && path === '/config')
      return json({ clientId: env.GOOGLE_CLIENT_ID }, 200, cors)
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400, cors)

    if (path === '/token' || path === '/refresh') {
      const isCode = path === '/token'
      const value = isCode ? body.code : body.refresh_token
      if (typeof value !== 'string' || !value) return json({ error: 'bad_request' }, 400, cors)
      const r = await exchange(
        env,
        isCode
          ? { grant_type: 'authorization_code', code: value, redirect_uri: 'postmessage' }
          : { grant_type: 'refresh_token', refresh_token: value },
      )
      if (!r.ok) {
        return json(
          { error: r.data.error ?? 'google_error', error_description: r.data.error_description },
          r.status === 400 || r.status === 401 ? r.status : 502,
          cors,
        )
      }
      const { access_token, expires_in, refresh_token, scope } = r.data
      return json({ access_token, expires_in, refresh_token, scope }, 200, cors)
    }

    if (path === '/revoke') {
      if (typeof body.token !== 'string' || !body.token)
        return json({ error: 'bad_request' }, 400, cors)
      await fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: body.token }),
      })
      return json({}, 200, cors)
    }

    return json({ error: 'not_found' }, 404, cors)
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDue(env))
  },
}
