/**
 * Gemini proxy: the API key lives here as a secret (GEMINI_API_KEY), never in the browser.
 *
 *   GET  /ai/models                  -> Gemini's model list
 *   POST /ai/generate?model=NAME     -> Gemini generateContent, body passed through
 *
 * Both need `Authorization: Bearer <Google access token>` from the same OAuth client. The token is
 * checked with Google (tokeninfo): it must be issued to this client and still valid.
 */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo'

async function signedIn(request, env) {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return false
  const r = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(token)}`).catch(() => null)
  if (!r || !r.ok) return false
  const info = await r.json().catch(() => null)
  return Boolean(info && info.aud === env.GOOGLE_CLIENT_ID)
}

export async function handleAi(request, env, path, cors) {
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  if (!(await signedIn(request, env))) return reply({ error: 'unauthorized' }, 401)
  if (!env.GEMINI_API_KEY) return reply({ error: 'gemini_not_configured' }, 500)
  const key = { 'x-goog-api-key': env.GEMINI_API_KEY }

  if (request.method === 'GET' && path === '/ai/models') {
    const r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: key })
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } })
  }

  if (request.method === 'POST' && path === '/ai/generate') {
    const model = new URL(request.url).searchParams.get('model') ?? ''
    // only Gemini model names, so the key cannot be sent to some other address
    if (!/^gemini[\w.-]*$/.test(model)) return reply({ error: 'bad_model' }, 400)
    const body = await request.text()
    const r = await fetch(`${GEMINI}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { ...key, 'Content-Type': 'application/json' },
      body,
    })
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } })
  }

  return reply({ error: 'not_found' }, 404)
}
