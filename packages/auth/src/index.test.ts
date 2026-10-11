import { describe, expect, it } from 'vitest'
import {
  canAccessPortal,
  defaultPortal,
  loginMethodForPortal,
  mapV1User,
  mobileSignInUrl,
  portalForPath,
  safeReturnPath,
  type AuthConfig,
} from './index'

const config = (mobileAppUrl?: string): AuthConfig => ({
  apiBaseUrl: '',
  mode: 'session',
  ownerUrl: '/overview',
  operationsUrl: '/admin',
  mobileAppUrl,
})

describe('production role mapping', () => {
  it('routes an admin to Operations', () => {
    const user = mapV1User(
      { role: 'admin', subject: 'user-1', trip_id: null, vehicle_ids: ['VF8-01'] },
      {
        user_id: 'user-1', tenant_id: 'tenant-1', email: 'admin@example.com', full_name: 'Fleet Admin',
        phone: null, language: 'vi', role: 'admin', active: true, last_login_at: null, created_at: '2026-10-03T00:00:00Z',
      },
    )

    expect(user).toMatchObject({ displayName: 'Fleet Admin', email: 'admin@example.com', roles: ['ADMIN'] })
    expect(canAccessPortal(user, 'operations')).toBe(true)
    expect(canAccessPortal(user, 'owner')).toBe(false)
    expect(defaultPortal(user)).toBe('operations')
  })

  it('routes an owner to Owner Web and preserves vehicle scope', () => {
    const user = mapV1User({ role: 'owner', subject: 'owner-1', trip_id: null, vehicle_ids: ['VF8-02'] })

    expect(user.roles).toEqual(['OWNER'])
    expect(user.vehicleIds).toEqual(['VF8-02'])
    expect(canAccessPortal(user, 'owner')).toBe(true)
    expect(canAccessPortal(user, 'operations')).toBe(false)
    expect(defaultPortal(user)).toBe('owner')
  })

  it('does not treat the selected portal as an authorization grant', () => {
    const operator = mapV1User({ role: 'operator', subject: 'operator-1', trip_id: null, vehicle_ids: [] })
    const caregiver = mapV1User({ role: 'caregiver', subject: 'caregiver-1', trip_id: null, vehicle_ids: ['VF8-03'] })

    expect(canAccessPortal(operator, 'operations')).toBe(true)
    expect(canAccessPortal(operator, 'owner')).toBe(false)
    expect(canAccessPortal(caregiver, 'owner')).toBe(true)
    expect(canAccessPortal(caregiver, 'operations')).toBe(false)
  })

  it('classifies canonical portal paths without granting access', () => {
    expect(portalForPath('/admin/users')).toBe('operations')
    expect(portalForPath('/user/vehicles')).toBe('owner')
    expect(portalForPath('/overview')).toBe('owner')
  })

  it('accepts only local non-login return paths', () => {
    expect(safeReturnPath('/admin/audit?tab=security')).toBe('/admin/audit?tab=security')
    expect(safeReturnPath('/user/vehicles#active')).toBe('/user/vehicles#active')
    expect(safeReturnPath('//evil.example/admin')).toBeUndefined()
    expect(safeReturnPath('https://evil.example/admin')).toBeUndefined()
    expect(safeReturnPath('/login')).toBeUndefined()
    expect(safeReturnPath('/admin/login')).toBeUndefined()
  })

  it('sends owners to the configured HTTPS mobile app while admins keep credential login', () => {
    const authConfig = config('https://cabin-noir.duckdns.org/app/')

    expect(mobileSignInUrl(authConfig)).toBe('https://cabin-noir.duckdns.org/app/')
    expect(loginMethodForPortal('owner', authConfig)).toBe('mobile-app')
    expect(loginMethodForPortal('operations', authConfig)).toBe('credentials')
  })

  it('rejects unsafe mobile-app URLs and falls back to the configured login mode', () => {
    expect(mobileSignInUrl(config('javascript:alert(1)'))).toBeUndefined()
    expect(mobileSignInUrl(config('http://example.com/app'))).toBeUndefined()
    expect(loginMethodForPortal('owner', config('http://example.com/app'))).toBe('credentials')
    expect(loginMethodForPortal('owner', { ...config(), mode: 'v1-demo' })).toBe('demo')
  })
})
describe('family users sign in on the Cabin Noir mobile web', () => {
  it('uses the configured https address', () => {
    expect(mobileSignInUrl({ mobileAppUrl: 'https://cabin-noir.duckdns.org/app/' })).toBe('https://cabin-noir.duckdns.org/app/')
  })

  it('allows plain http only on localhost', () => {
    expect(mobileSignInUrl({ mobileAppUrl: 'http://localhost:8000/app/' })).toBe('http://localhost:8000/app/')
    expect(mobileSignInUrl({ mobileAppUrl: 'http://example.com/app/' })).toBeUndefined()
  })

  it('rejects scripts and empty values, so the page falls back to the email form', () => {
    expect(mobileSignInUrl({ mobileAppUrl: 'javascript:alert(1)' })).toBeUndefined()
    expect(mobileSignInUrl({ mobileAppUrl: '' })).toBeUndefined()
    expect(mobileSignInUrl({})).toBeUndefined()
  })
})
