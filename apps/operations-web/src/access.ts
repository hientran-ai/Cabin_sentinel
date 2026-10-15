import type { Permission, User } from '@cabinsentinel/contracts'

export type OperationsPermission =
  | 'fleet.read'
  | 'vehicle.read'
  | 'vehicle.manage'
  | 'incident.ack'
  | 'incident.manage'
  | 'command.request'
  | 'device.read'
  | 'device.manage'
  | 'user.manage'
  | 'audit.read'
  | 'model.manage'
  | 'rules.manage'
  | 'system.read'

const legacyAliases: Partial<Record<OperationsPermission, Permission>> = {
  'fleet.read': 'operations:view',
  'vehicle.read': 'vehicle:view',
  'incident.ack': 'incident:acknowledge',
  'user.manage': 'users:manage',
  'audit.read': 'audit:view',
  'model.manage': 'models:manage',
}

export function isPlatformAdmin(user: User | undefined): boolean {
  return user?.roles.includes('ADMIN') === true && user.tenantId == null
}

export function hasOperationsPermission(user: User | undefined, permission: OperationsPermission): boolean {
  if (!user) return false
  if (user.permissions.includes('*')) return true
  if (user.permissions.includes(permission)) return true
  const alias = legacyAliases[permission]
  return alias ? user.permissions.includes(alias) : false
}

export function operationsLandingPath(user: User | undefined): string {
  if (isPlatformAdmin(user)) return '/admin'
  if (hasOperationsPermission(user, 'fleet.read')) return '/admin/incidents'
  if (hasOperationsPermission(user, 'device.read')) return '/admin/devices'
  if (hasOperationsPermission(user, 'user.manage')) return '/admin/users'
  if (hasOperationsPermission(user, 'audit.read')) return '/admin/audit'
  if (hasOperationsPermission(user, 'system.read')) return '/admin/system'
  return '/admin/no-access'
}
