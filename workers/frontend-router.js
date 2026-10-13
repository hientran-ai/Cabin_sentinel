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
// Family users (owners, caregivers) sign in on the Cabin Noir mobile web with their phone number.
const mobileLoginPaths = new Set(['/user', '/user/login', '/app'])

export function mobileAppRedirect(env) {
  try {
    const target = new URL(env.MOBILE_APP_URL || 'https://cabin-noir.duckdns.org/app/')
    if (target.protocol !== 'https:') return null
    return Response.redirect(target.toString(), 302)
  } catch {
    return null
  }
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

function unifiedLoginRedirect(request) {
  const target = new URL('/admin/login', request.url)
  return Response.redirect(target.toString(), 308)
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (isBackendPath(pathname)) return proxyBackend(request, env)
    if (isMobileLoginPath(pathname)) return mobileAppRedirect(env) || unifiedLoginRedirect(request)
    if (isLegacyLoginPath(pathname)) return unifiedLoginRedirect(request)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return env.ASSETS.fetch(adminAssetRequest(request, pathname))
    }
    // The owner web application was retired in favor of Cabin Noir. Any
    // non-admin frontend route now belongs to the family/mobile product.
    return mobileAppRedirect(env) || unifiedLoginRedirect(request)
  },
}
