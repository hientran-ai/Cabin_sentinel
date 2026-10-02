export type MobileDestination =
  | { screen: 'incident'; incidentId: string }
  | { screen: 'vehicle'; vehicleId: string }
  | { screen: 'home' }

/** Payloads are navigation hints only; the destination must refresh from the API. */
export function parseDeepLink(url: string): MobileDestination {
  const parsed = new URL(url)
  const parts = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].filter(Boolean)
  if (parts[0] === 'incidents' && parts[1]) return { screen: 'incident', incidentId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'vehicles' && parts[1]) return { screen: 'vehicle', vehicleId: decodeURIComponent(parts[1]) }
  return { screen: 'home' }
}
