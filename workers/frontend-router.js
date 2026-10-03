function backendUrl(requestUrl, backendOrigin) {
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

function adminAssetRequest(request, pathname) {
  const target = new URL(request.url)
  const isStaticAsset = pathname.startsWith('/admin/assets/') || /\.[a-z0-9]+$/i.test(pathname)
  if (!isStaticAsset) target.pathname = '/admin/index.html'
  return new Request(target, { method: request.method, headers: request.headers })
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/health' || pathname.startsWith('/api/')) return proxyBackend(request, env)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return env.ASSETS.fetch(adminAssetRequest(request, pathname))
    }
    return env.ASSETS.fetch(request)
  },
}
