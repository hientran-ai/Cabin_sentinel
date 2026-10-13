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

  it('redirects legacy admin login URLs to the unified admin login', async () => {
    const response = await router.fetch(new Request('https://frontend.example/login'), {
      ASSETS: { fetch: () => Promise.reject(new Error('assets should not be called')) },
    })

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://frontend.example/admin/login')
  })

  it('redirects family login URLs to the configured Cabin Noir app', async () => {
    const response = await router.fetch(new Request('https://frontend.example/user/login'), {
      MOBILE_APP_URL: 'https://cabin-noir.duckdns.org/app/',
      ASSETS: { fetch: () => Promise.reject(new Error('assets should not be called')) },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://cabin-noir.duckdns.org/app/')
  })

  it('redirects retired owner routes to Cabin Noir', async () => {
    const response = await router.fetch(new Request('https://frontend.example/vehicles/VF8'), {
      MOBILE_APP_URL: 'https://cabin-noir.duckdns.org/app/',
      ASSETS: { fetch: () => Promise.reject(new Error('assets should not be called')) },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://cabin-noir.duckdns.org/app/')
  })
})
