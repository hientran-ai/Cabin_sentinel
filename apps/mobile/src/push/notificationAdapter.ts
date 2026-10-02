export interface PushRegistration { token: string; platform: 'ios' | 'android' }
export interface PushAdapter {
  requestPermission(): Promise<boolean>
  getRegistration(): Promise<PushRegistration | undefined>
}

export interface PushNavigationHint { incidentId?: string; vehicleId?: string }

/**
 * Notifications may wake/navigate the app. They never carry an authoritative
 * risk state; incident/vehicle data is fetched after authentication.
 */
export function notificationDestination(hint: PushNavigationHint): string {
  if (hint.incidentId) return `/incidents/${encodeURIComponent(hint.incidentId)}`
  if (hint.vehicleId) return `/vehicles/${encodeURIComponent(hint.vehicleId)}`
  return '/'
}
