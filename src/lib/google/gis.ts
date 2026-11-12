/*
 * Google sign-in for Drive sync (drive.appdata scope; drive.file only to carry over data an older version kept in a spreadsheet).
 *
 * Authorization code flow: Google's popup returns a one-time code, a small Cloudflare Worker
 * (see worker/) exchanges it for an access token plus a long-lived refresh token, because the
 * exchange needs the client secret. After that the access token is renewed with a plain fetch
 * to the Worker, so no window opens.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const LEGACY_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const SCOPE_KEY = 'ab.google.scope'
const TOKEN_KEY = 'ab.google.token'
const REFRESH_KEY = 'ab.google.refresh'

let workerUrl = ''
let clientId = ''
let clientIdFor = ''
let configPromise: Promise<void> | null = null

/** Set the Worker address (entered in the settings); the Google client ID comes from it. */
export function setWorkerUrl(url: string) {
  const next = url.trim().replace(/\/+$/, '')
  if (next === workerUrl) return
  workerUrl = next
  clientId = ''
  clientIdFor = ''
  configPromise = null
}

/** Fetch the Google client ID the Worker is configured with (a public value). */
function loadConfig(): Promise<void> {
  if (!workerUrl) return Promise.reject(new Error('尚未設定同步服務網址'))
  if (clientId && clientIdFor === workerUrl) return Promise.resolve()
  const url = workerUrl
  configPromise ??= (async () => {
    try {
      const res = await fetch(`${url}/config`, { signal: AbortSignal.timeout(15_000) })
      const data = (await res.json()) as { clientId?: string }
      if (!res.ok || !data.clientId) throw new Error()
      clientId = data.clientId
      clientIdFor = url
    } catch {
      throw new Error('無法連到同步服務，請檢查網址與網路')
    } finally {
      configPromise = null
    }
  })()
  return configPromise
}

interface StoredToken {
  token: string
  expiresAt: number
}

interface WorkerTokens {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

interface CodeResponse {
  code?: string
  scope?: string
  error?: string
  error_description?: string
}

interface CodeClient {
  requestCode(): void
}

interface GoogleOAuth2 {
  initCodeClient(o: {
    client_id: string
    scope: string
    ux_mode: 'popup'
    select_account?: boolean
    callback: (r: CodeResponse) => void
    error_callback?: (e: { type: string; message?: string }) => void
  }): CodeClient
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } }
  }
}

let gisPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('無法載入 Google 登入元件，請檢查網路'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

/** A Google access token for the Worker's AI proxy: the saved one, or renewed from the refresh token. Null when not signed in. */
export async function aiToken(): Promise<string | null> {
  return cachedToken() ?? (await refreshAccessToken())
}

export function cachedToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as StoredToken
    return t.expiresAt - 60_000 > Date.now() ? t.token : null
  } catch {
    return null
  }
}

/** The sign-in also lets the app read the spreadsheet an older version made. */
export function hasLegacyAccess(): boolean {
  return (localStorage.getItem(SCOPE_KEY) ?? '').split(' ').includes(LEGACY_SCOPE)
}

export function hasRefreshToken(): boolean {
  return Boolean(localStorage.getItem(REFRESH_KEY))
}

/** Forget the access token only; the refresh token stays so the next call can renew it. */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** Load the Google script and client ID ahead of time so a later click can open the popup immediately. */
export function preloadGis() {
  void loadGis().catch(() => {})
  if (workerUrl) void loadConfig().catch(() => {})
}

function storeAccessToken(t: WorkerTokens) {
  const stored: StoredToken = {
    token: t.access_token!,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
}

async function callWorker(
  path: string,
  body: object,
): Promise<{ status: number; data: WorkerTokens }> {
  const res = await fetch(`${workerUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as WorkerTokens
  return { status: res.status, data }
}

async function exchangeCode(code: string): Promise<string> {
  let r
  try {
    r = await callWorker('/token', { code })
  } catch {
    throw new Error('無法連到同步授權服務（Worker），請檢查同步服務網址與網路')
  }
  if (!r.data.access_token) throw new Error(r.data.error_description || r.data.error || '授權失敗')
  if (!r.data.scope?.split(' ').includes(SCOPE)) {
    throw new Error(
      '沒有取得雲端硬碟的資料儲存權限，請重新連線，並在 Google 授權畫面勾選對應的權限',
    )
  }
  if (!r.data.refresh_token) {
    // Google only hands out a refresh token the first time access is granted
    throw new Error(
      'Google 沒有提供長效授權。請到 https://myaccount.google.com/permissions 移除這個 App 的存取權，再重新連線',
    )
  }
  localStorage.setItem(REFRESH_KEY, r.data.refresh_token)
  storeAccessToken(r.data)
  localStorage.setItem(SCOPE_KEY, r.data.scope ?? '')
  return r.data.access_token
}

let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null

function openPopup(selectAccount: boolean, legacy: boolean) {
  return new Promise<string>((resolve, reject) => {
    pending?.reject(new Error('已取消登入'))
    pending = { resolve, reject }
    const settle = (fn: (p: NonNullable<typeof pending>) => void) => {
      const p = pending
      pending = null
      if (p) fn(p)
    }
    window
      .google!.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: legacy ? `${SCOPE} ${LEGACY_SCOPE}` : SCOPE,
        ux_mode: 'popup',
        select_account: selectAccount,
        callback: (r) => {
          if (r.error || !r.code) {
            settle((p) => p.reject(new Error(r.error_description || r.error || '授權失敗')))
            return
          }
          exchangeCode(r.code).then(
            (t) => settle((p) => p.resolve(t)),
            (e) => settle((p) => p.reject(e instanceof Error ? e : new Error(String(e)))),
          )
        },
        error_callback: (e) =>
          settle((p) =>
            p.reject(
              new Error(
                e.type === 'popup_closed'
                  ? '已取消登入'
                  : e.type === 'popup_failed_to_open'
                    ? '瀏覽器擋住了 Google 登入視窗，請再按一次，或允許這個網站開啟彈出式視窗'
                    : e.message || e.type,
              ),
            ),
          ),
      })
      .requestCode()
  })
}

let refreshing: Promise<string | null> | null = null

/**
 * Renew the access token with the stored refresh token; no window, no user gesture.
 * Resolves null when there is no refresh token or Google rejected it (then it is dropped and
 * the user must sign in again). Throws on network trouble, which is worth retrying later.
 */
export function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh || !workerUrl) return Promise.resolve(null)
  refreshing ??= (async () => {
    try {
      const r = await callWorker('/refresh', { refresh_token: refresh })
      if (r.data.access_token) {
        // a sign-in from an older version only covers the spreadsheet: sign in again for the new permission
        if (r.data.scope && !r.data.scope.split(' ').includes(SCOPE)) {
          localStorage.removeItem(REFRESH_KEY)
          clearToken()
          return null
        }
        storeAccessToken(r.data)
        if (r.data.scope) localStorage.setItem(SCOPE_KEY, r.data.scope)
        return r.data.access_token
      }
      if (r.status === 400 || r.status === 401) {
        // invalid_grant: revoked, expired (e.g. app still in "Testing"), or password changed
        localStorage.removeItem(REFRESH_KEY)
        clearToken()
        return null
      }
      throw new Error(r.data.error || `HTTP ${r.status}`)
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/**
 * Opens Google's popup, so it must be called synchronously from a click handler: browsers
 * block popups opened after an await. When the script is already loaded (see preloadGis)
 * the popup opens without any await.
 */
export function requestToken(selectAccount = false, legacy = false): Promise<string> {
  if (!workerUrl) return Promise.reject(new Error('請先在設定填入同步服務網址'))
  if (window.google?.accounts?.oauth2 && clientId && clientIdFor === workerUrl) {
    return openPopup(selectAccount, legacy)
  }
  return Promise.all([loadGis(), loadConfig()]).then(() => openPopup(selectAccount, legacy))
}

export async function revokeToken() {
  const refresh = localStorage.getItem(REFRESH_KEY)
  const access = cachedToken()
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(SCOPE_KEY)
  clearToken()
  // revoking either token ends the whole grant; failures here don't matter
  const token = refresh ?? access
  if (token && workerUrl) await callWorker('/revoke', { token }).catch(() => {})
}
