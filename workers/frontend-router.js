export function backendUrl(requestUrl, backendOrigin) {
  const source = new URL(requestUrl)
  const backend = new URL(backendOrigin)
  if (backend.protocol !== 'https:' && backend.hostname !== 'localhost' && backend.hostname !== '127.0.0.1') {
    throw new Error('BACKEND_ORIGIN must use HTTPS')
  }
  backend.pathname = source.pathname
  backend.search = source.search
  backend.hash = ''
  return backend
}

async function proxyBackend(request, env) {
  if (!env.BACKEND_ORIGIN) {
    return Response.json({ detail: 'Backend origin is not configured' }, { status: 503 })
  }
  try {
    const target = backendUrl(request.url, env.BACKEND_ORIGIN)
    const headers = new Headers(request.headers)
    const incoming = new URL(request.url)
    headers.set('X-Forwarded-Host', incoming.host)
    headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''))
    return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: 'manual' }))
  } catch {
    return Response.json({ detail: 'Backend proxy configuration is invalid' }, { status: 502 })
  }
}

export function adminAssetRequest(request, pathname) {
  const target = new URL(request.url)
  const isStaticAsset = pathname.startsWith('/admin/assets/') || /\.[a-z0-9]+$/i.test(pathname)
  if (!isStaticAsset) target.pathname = '/admin/index.html'
  return new Request(target, { method: request.method, headers: request.headers })
}

const legacyLoginPaths = new Set(['/', '/login', '/signin', '/sign-in', '/admin/signin', '/admin/sign-in'])
// Family-user entry points. They no longer go to Cabin Noir: they open the VinFast judge demo.
const mobileLoginPaths = new Set(['/user', '/user/login', '/app'])

// All user-facing entry points land on the VinFast judge demo (cockpit + owner phone side by side).
const DEMO_PATH = '/cockpit/vinfast/'

export function demoRedirect(request) {
  const target = new URL(DEMO_PATH, request.url)
  target.search = new URL(request.url).search   // keeps ?view=cockpit, ?skin=, ?debug=1
  return Response.redirect(target.toString(), 302)
}

// The demo is VinFast only. The SU7 cockpit (/cockpit/ root) and the Tesla one (/cockpit/tesla*) are not part of it, so a stale link or an old
// bookmark lands on the VinFast demo instead of another brand's screen.
export function isHiddenCockpitPath(pathname) {
  return pathname === '/cockpit' || pathname === '/cockpit/' || pathname === '/cockpit/index.html' || /^\/cockpit\/tesla(?:-[a-z]+)?(?:\/|$)/.test(pathname)
}

export function isBackendPath(pathname) {
  return pathname === '/health' || pathname.startsWith('/api/')
}

export function isLegacyLoginPath(pathname) {
  return legacyLoginPaths.has(pathname.replace(/\/+$/, '') || '/')
}

export function isMobileLoginPath(pathname) {
  return mobileLoginPaths.has(pathname.replace(/\/+$/, '') || '/')
}

function protect(response, request, env, api) {
  const headers = new Headers(response.headers)
  for (const key of [...headers.keys()]) if (/^x-proxied-|^x-backend-|^access-control-/i.test(key)) headers.delete(key)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'SAMEORIGIN')
  headers.set('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'")
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)')
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000')
  if (api) {
    headers.set('Cache-Control', 'no-store')
    headers.append('Vary', 'Origin')
    const origin = request.headers.get('Origin')
    if (origin && allowedOrigins(request, env).has(origin)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Credentials', 'true')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Session-Token')
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function allowedOrigins(request, env) {
  const origins = new Set([new URL(request.url).origin])
  for (const value of [env.MOBILE_APP_URL, ...(env.CORS_ALLOWED_ORIGINS || '').split(',')]) {
    try { const url = new URL(value); if (url.protocol === 'https:') origins.add(url.origin) } catch { /* no implicit wildcard */ }
  }
  return origins
}

async function route(request, env) {
    const { pathname } = new URL(request.url)
    if (isBackendPath(pathname)) return proxyBackend(request, env)
    if (isHiddenCockpitPath(pathname)) return demoRedirect(request)
    if (pathname === '/cockpit' || pathname.startsWith('/cockpit/')) return env.ASSETS.fetch(request)
    // Operators keep their own console. Everything else (home, login, signup, app, unknown routes) is the demo.
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return env.ASSETS.fetch(adminAssetRequest(request, pathname))
    }
    return demoRedirect(request)
}

export default {
  async fetch(request, env) {
    const api = isBackendPath(new URL(request.url).pathname)
    const origin = request.headers.get('Origin')
    if (api && origin && !allowedOrigins(request, env).has(origin)) {
      return protect(Response.json({ detail: 'Origin is not allowed' }, { status: 403 }), request, env, true)
    }
    if (api && request.method === 'OPTIONS') return protect(new Response(null, { status: 204 }), request, env, true)
    return protect(await route(request, env), request, env, api)
  },
  // Keep-warm: free Hugging Face Spaces sleep when idle and the first judge would wait minutes. A health ping every
  // 10 minutes (no user data, no cookies) keeps the model loaded. Errors are ignored on purpose.
  async scheduled(_event, env) {
    if (!env.BACKEND_ORIGIN) return
    try { await fetch(backendUrl('https://warm.invalid/health', env.BACKEND_ORIGIN), { cf: { cacheTtl: 0 } }) } catch { /* sleeping or restarting */ }
  },
}
