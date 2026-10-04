import type { Incident, Permission, RiskLevel, User } from '@cabinsentinel/contracts'

export const severityPresentation: Record<RiskLevel, { label: string; icon: string; priority: number }> = {
  SAFE: { label: 'Safe', icon: 'check-circle', priority: 0 },
  NOTICE: { label: 'Notice', icon: 'info', priority: 1 },
  WARNING: { label: 'Warning', icon: 'alert-triangle', priority: 2 },
  CRITICAL: { label: 'Critical', icon: 'siren', priority: 3 },
  ERROR: { label: 'Unable to verify', icon: 'circle-x', priority: 4 },
}

export function formatTemperature(value?: number, locale?: string): string {
  return value == null || !Number.isFinite(value)
    ? 'Unavailable'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}°C`
}

export function ageInSeconds(timestamp: string, nowMs = Date.now()): number | undefined {
  const observed = Date.parse(timestamp)
  return Number.isFinite(observed) ? Math.max(0, Math.floor((nowMs - observed) / 1000)) : undefined
}

export function isStale(timestamp: string, thresholdSeconds: number, nowMs = Date.now()): boolean {
  const age = ageInSeconds(timestamp, nowMs)
  return age == null || age > thresholdSeconds
}

export function formatRelativeTime(timestamp: string, nowMs = Date.now()): string {
  const age = ageInSeconds(timestamp, nowMs)
  if (age == null) return 'Unknown update time'
  if (age < 5) return 'Updated just now'
  if (age < 60) return `Updated ${age} seconds ago`
  const minutes = Math.floor(age / 60)
  return minutes < 60 ? `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago` : `Updated ${Math.floor(minutes / 60)} hours ago`
}

export function hasPermission(user: User | undefined, permission: Permission): boolean {
  return Boolean(user?.permissions.includes(permission))
}

export function canViewVehicle(user: User | undefined, vehicleId: string): boolean {
  return hasPermission(user, 'vehicle:view') && Boolean(user?.vehicleIds.includes(vehicleId))
}

export function canAcknowledgeIncident(user: User | undefined, incident: Incident): boolean {
  return incident.status === 'active' && hasPermission(user, 'incident:acknowledge') && Boolean(user?.vehicleIds.includes(incident.vehicleId))
}

export function acceptNewerRevision(currentRevision: number | undefined, incomingRevision: number): boolean {
  return currentRevision == null || incomingRevision > currentRevision
}
