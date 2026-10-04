import { describe, expect, it } from 'vitest'
import { canAccessPortal, defaultPortal, mapV1User } from './index'

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
    expect(defaultPortal(user)).toBe('owner')
  })
})
