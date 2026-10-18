import { describe, expect, it } from 'vitest'

import router, {
  adminAssetRequest,
  backendUrl,
  isBackendPath,
  isLegacyLoginPath,
  isMobileLoginPath,
} from './frontend-router.js'

describe('Cloudflare frontend router', () => {
  it('adds anti-framing and content-type protection to Cockpit HTML while allowing its same-origin phone frame', async () => {
    const response = await router.fetch(new Request('https://frontend.example/cockpit/vinfast/'), {
      ASSETS: { fetch: async () => new Response('<html>cockpit</html>', { headers: { 'Content-Type': 'text/html' } }) },
    })
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'")
    expect(response.headers.get('Permissions-Policy')).toContain('camera=(self)')
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=')
  })

  it('strips upstream proxy metadata and refuses untrusted credentialed preflights', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response('{}', { headers: { 'x-proxied-host': 'internal-metadata', 'Access-Control-Allow-Origin': '*' } })
    try {
      const env = { BACKEND_ORIGIN: 'https://backend.example' }
      const response = await router.fetch(new Request('https://frontend.example/api/v1/e2e/status'), env)
      expect(response.headers.get('x-proxied-host')).toBeNull()
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const untrusted = await router.fetch(new Request('https://frontend.example/api/v1/e2e/status', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' } }), env)
      expect(untrusted.status).toBe(403)
      expect(untrusted.headers.get('Access-Control-Allow-Origin')).toBeNull()
    } finally { globalThis.fetch = original }
  })
  it('preserves the API path and query while replacing the origin', () => {
    const target = backendUrl(
      'https://c4-app-068.example/api/v1/state/VF8?limit=10#ignored',
      'https://backend.example/base',
    )

    expect(target.toString()).toBe('https://backend.example/api/v1/state/VF8?limit=10')
  })

  it('rejects an insecure non-local backend origin', () => {
    expect(() => backendUrl('https://frontend.example/health', 'http://backend.example')).toThrow(
      'BACKEND_ORIGIN must use HTTPS',
    )
  })

  it('classifies backend, admin-login and mobile-login routes without matching lookalikes', () => {
    expect(isBackendPath('/health')).toBe(true)
    expect(isBackendPath('/api/v1/state/VF8')).toBe(true)
    expect(isBackendPath('/api-docs')).toBe(false)
    expect(isLegacyLoginPath('/login/')).toBe(true)
    expect(isMobileLoginPath('/user/login/')).toBe(true)
    expect(isLegacyLoginPath('/user/login-help')).toBe(false)
  })

  it('serves the admin SPA shell for routes but preserves static asset paths', () => {
    const route = adminAssetRequest(new Request('https://frontend.example/admin/users'), '/admin/users')
    const asset = adminAssetRequest(new Request('https://frontend.example/admin/assets/app.js'), '/admin/assets/app.js')

    expect(new URL(route.url).pathname).toBe('/admin/index.html')
    expect(new URL(asset.url).pathname).toBe('/admin/assets/app.js')
  })

  const noAssets = { ASSETS: { fetch: () => Promise.reject(new Error('assets should not be called')) } }
  const DEMO = 'https://frontend.example/cockpit/vinfast/'

  it.each(['/', '/login', '/signin', '/sign-in', '/user', '/user/login', '/app', '/demo', '/vehicles/VF8', '/anything/else'])(
    'sends user-facing route %s to the VinFast judge demo',
    async (path) => {
      const response = await router.fetch(new Request(`https://frontend.example${path}`), noAssets)
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe(DEMO)
    },
  )

  it('keeps the query string when redirecting to the demo', async () => {
    const response = await router.fetch(new Request('https://frontend.example/?view=cockpit&debug=1'), noAssets)
    expect(response.headers.get('location')).toBe(`${DEMO}?view=cockpit&debug=1`)
  })

  it('serves the VinFast entry and its assets as static assets, not as redirects', async () => {
    const seen = []
    const env = { ASSETS: { fetch: async (request) => { seen.push(new URL(request.url).pathname); return new Response('asset') } } }
    for (const path of ['/cockpit/vinfast/', '/cockpit/assets/app.js', '/cockpit/phone/index.html', '/cockpit/samples/ai-child.webm']) {
      const response = await router.fetch(new Request(`https://frontend.example${path}`), env)
      expect(response.status).toBe(200)
    }
    expect(seen).toEqual(['/cockpit/vinfast/', '/cockpit/assets/app.js', '/cockpit/phone/index.html', '/cockpit/samples/ai-child.webm'])
  })

  it('hides the SU7 and Tesla cockpits: they redirect to the VinFast demo and keep the query string', async () => {
    const env = { ASSETS: { fetch: async () => { throw new Error('must not reach assets') } } }
    for (const path of ['/cockpit', '/cockpit/', '/cockpit/index.html', '/cockpit/tesla', '/cockpit/tesla/', '/cockpit/tesla-figma/library-dark-imgBattery.svg']) {
      const response = await router.fetch(new Request(`https://frontend.example${path}?debug=1`), env)
      expect(response.status, path).toBe(302)
      expect(response.headers.get('location'), path).toBe(`${DEMO}?debug=1`)
    }
  })


  it('keeps the operator console and the API proxy unchanged', async () => {
    const asset = await router.fetch(new Request('https://frontend.example/admin/incidents'), {
      ASSETS: { fetch: async (request) => new Response(new URL(request.url).pathname) },
    })
    expect(await asset.text()).toBe('/admin/index.html')
    const noBackend = await router.fetch(new Request('https://frontend.example/api/v1/e2e/status'), noAssets)
    expect(noBackend.status).toBe(503)
  })

  it('pings the backend health endpoint on the keep-warm schedule and survives a failure', async () => {
    const calls = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error('sleeping') }
    try {
      await router.scheduled({}, { BACKEND_ORIGIN: 'https://backend.example' })
      await router.scheduled({}, {})
    } finally { globalThis.fetch = realFetch }
    expect(calls).toEqual(['https://backend.example/health'])
  })
})
