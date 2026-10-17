import { describe, expect, it } from 'vitest'

import router, {
  adminAssetRequest,
  backendUrl,
  isBackendPath,
  isLegacyLoginPath,
  isMobileLoginPath,
} from './frontend-router.js'

describe('Cloudflare frontend router', () => {
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

  it('serves the cockpit entries (SU7, Tesla, VinFast) as static assets, not as redirects', async () => {
    const seen = []
    const env = { ASSETS: { fetch: async (request) => { seen.push(new URL(request.url).pathname); return new Response('asset') } } }
    for (const path of ['/cockpit/', '/cockpit/tesla/', '/cockpit/vinfast/', '/cockpit/assets/app.js']) {
      const response = await router.fetch(new Request(`https://frontend.example${path}`), env)
      expect(response.status).toBe(200)
    }
    expect(seen).toEqual(['/cockpit/', '/cockpit/tesla/', '/cockpit/vinfast/', '/cockpit/assets/app.js'])
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
