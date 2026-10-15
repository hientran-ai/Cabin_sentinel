import { describe, expect, it } from 'vitest'
import type { User } from '@cabinsentinel/contracts'
import { hasOperationsPermission, isPlatformAdmin, operationsLandingPath } from './access'

const user = (overrides: Partial<User> = {}): User => ({
  id: 'operator-1', displayName: 'Operator', email: 'operator@example.com', roles: ['OPERATOR'],
  permissions: ['fleet.read', 'incident.manage'], vehicleIds: ['VF8-01'], tenantId: 'tenant-1',
  permissionSource: 'backend', ...overrides,
})

describe('operations access presentation', () => {
  it('uses effective backend permissions for operator navigation and actions', () => {
    expect(hasOperationsPermission(user(), 'fleet.read')).toBe(true)
    expect(hasOperationsPermission(user(), 'user.manage')).toBe(false)
  })

  it('keeps compatibility with legacy frontend permission names', () => {
    expect(hasOperationsPermission(user({ permissions: ['audit:view'] }), 'audit.read')).toBe(true)
  })

  it('treats wildcard as full access and distinguishes tenant operators from platform admins', () => {
    const admin = user({ roles: ['ADMIN'], permissions: ['*'], tenantId: null })
    expect(hasOperationsPermission(admin, 'rules.manage')).toBe(true)
    expect(isPlatformAdmin(admin)).toBe(true)
    expect(isPlatformAdmin(user())).toBe(false)
  })

  it('lands operators in the incident queue and platform admins on overview', () => {
    expect(operationsLandingPath(user())).toBe('/admin/incidents')
    expect(operationsLandingPath(user({ roles: ['ADMIN'], permissions: ['*'], tenantId: null }))).toBe('/admin')
    expect(operationsLandingPath(user({ permissions: [] }))).toBe('/admin/no-access')
  })
})
