import { create } from 'zustand'
import type { LatLng } from '../types/vehicle'
import { START, type Place } from '../lib/mapConfig'
import { mockRoute, pointAlong } from '../lib/vehicleSimulation'

export interface Route { coords: LatLng[]; distanceM: number; durationS: number; source: 'osrm' | 'mock' }

interface NavState {
  position: LatLng
  heading: number
  destination: Place | null
  route: Route | null
  along: number // metres driven along the route
  status: 'idle' | 'routing' | 'active' | 'arrived'
  searchOpen: boolean
  pitched: boolean
  follow: boolean
  recenterNonce: number
  mapError: boolean
  setDestination: (p: Place) => Promise<void>
  clearRoute: () => void
  advance: (metres: number) => void
  setPosition: (p: LatLng, heading?: number) => void
  set: (p: Partial<NavState>) => void
  recenter: () => void
}

/** OSRM public demo server (no key). Any failure or slow answer falls back to the deterministic mock route. */
async function fetchRoute(from: LatLng, to: LatLng): Promise<Route> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4500)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json() as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }
    const best = j.routes?.[0]
    if (!best || best.geometry.coordinates.length < 2) throw new Error('no route')
    return { coords: best.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), distanceM: best.distance, durationS: best.duration, source: 'osrm' }
  } catch {
    return { ...mockRoute(from, to), source: 'mock' }
  } finally { clearTimeout(timer) }
}

export const useNavigation = create<NavState>((set, get) => ({
  position: { lat: START.lat, lng: START.lng }, heading: START.heading, destination: null, route: null, along: 0, status: 'idle',
  searchOpen: false, pitched: false, follow: true, recenterNonce: 0, mapError: false,
  setDestination: async (p) => {
    set({ destination: p, status: 'routing', searchOpen: false, route: null, along: 0 })
    const route = await fetchRoute(get().position, p)
    if (get().destination?.id !== p.id) return                // a newer choice won
    set({ route, status: 'active', follow: true, recenterNonce: get().recenterNonce + 1 })
  },
  clearRoute: () => set({ destination: null, route: null, along: 0, status: 'idle' }),
  advance: (m) => {
    const { route, along, status, position, heading } = get()
    if (route && status === 'active') {
      const next = along + m
      const at = pointAlong(route.coords, next)
      set({ along: next, position: at.point, heading: at.heading, ...(at.done ? { status: 'arrived' } : {}) })
      return
    }
    // no route: keep going straight on the current heading
    const d = m / 111320, h = (heading * Math.PI) / 180
    set({ position: { lat: position.lat + d * Math.cos(h), lng: position.lng + (d * Math.sin(h)) / Math.cos((position.lat * Math.PI) / 180) } })
  },
  setPosition: (p, heading) => set({ position: p, ...(heading != null ? { heading } : {}), route: null, destination: null, along: 0, status: 'idle', recenterNonce: get().recenterNonce + 1 }),
  set: (p) => set(p),
  recenter: () => set({ follow: true, recenterNonce: get().recenterNonce + 1 }),
}))

export function remaining(route: Route, along: number) {
  const f = Math.min(1, along / Math.max(1, route.distanceM))
  return { distanceM: Math.max(0, route.distanceM - along), durationS: Math.max(0, route.durationS * (1 - f)) }
}
