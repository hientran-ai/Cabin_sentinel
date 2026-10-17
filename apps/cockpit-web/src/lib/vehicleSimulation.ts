// Pure, deterministic vehicle simulation. No DOM, no timers: the hook calls step() with the elapsed time.
import type { BrandSpec, Gear, LatLng, VehicleState } from '../types/vehicle'

export const BRANDS: Record<'tesla' | 'vinfast', BrandSpec> = {
  tesla: {
    id: 'tesla', model: 'Sedan điện (cảm hứng Model 3)', capacityKWh: 75, whPerKm: 150,
    length: 4.72, width: 1.85, height: 1.44, wheelbase: 2.88, rideHeight: 0.14, bodyStyle: 'sedan', chargePort: 'rear-left',
    paints: [
      { id: 'white', label: 'Trắng ngọc trai', color: '#E9EBEC' }, { id: 'black', label: 'Đen', color: '#1C1E21' },
      { id: 'silver', label: 'Bạc', color: '#9EA4AA' }, { id: 'blue', label: 'Xanh đêm', color: '#2B4C7E' }, { id: 'red', label: 'Đỏ', color: '#8E1B22' },
    ],
  },
  vinfast: {
    id: 'vinfast', model: 'SUV điện (cảm hứng VF 8)', capacityKWh: 87.7, whPerKm: 195,
    length: 4.75, width: 1.93, height: 1.67, wheelbase: 2.95, rideHeight: 0.19, bodyStyle: 'suv', chargePort: 'front-left',
    paints: [
      { id: 'grey', label: 'Xám', color: '#5C6670' }, { id: 'white', label: 'Trắng', color: '#ECEEF0' },
      { id: 'blue', label: 'Xanh dương', color: '#1F4FA8' }, { id: 'black', label: 'Đen', color: '#16181B' }, { id: 'red', label: 'Đỏ', color: '#9B1C24' },
    ],
  },
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Estimated range at the given charge (km). */
export function rangeKm(spec: BrandSpec, batteryLevel: number, climateOn: boolean): number {
  const whPerKm = spec.whPerKm * (climateOn ? 1.06 : 1)
  return Math.round((spec.capacityKWh * 1000 * (batteryLevel / 100)) / whPerKm)
}

/** Speed the demo aims for at time t (s) in drive: city traffic, cruising, slowing at lights. */
export function demoTargetSpeed(t: number, gear: Gear): number {
  if (gear === 'R') return 6
  if (gear !== 'D') return 0
  const cycle = t % 90
  if (cycle < 8) return 0                       // waiting at a light
  if (cycle < 40) return 42 + 8 * Math.sin(cycle / 6)
  if (cycle < 70) return 58 + 4 * Math.sin(cycle / 4)
  return 30
}

/** Move `speed` toward `target` with comfortable acceleration (m/s²). */
export function approach(speed: number, target: number, dt: number): number {
  const accel = target > speed ? 2.2 : 3.2
  const step = accel * 3.6 * dt
  return Math.abs(target - speed) <= step ? target : speed + Math.sign(target - speed) * step
}

export interface StepEnv { t: number; dt: number; spec: BrandSpec }

/** One simulation step: speed, battery and charging. Returns only the fields that changed. */
export function step(v: VehicleState, env: StepEnv): Partial<VehicleState> {
  const { dt, spec } = env
  const out: Partial<VehicleState> = {}
  // speed
  let target = v.speedOverride ?? (v.autoDrive ? demoTargetSpeed(env.t, v.gear) : 0)
  if (v.gear === 'P' || v.gear === 'N' || v.parkingBrake) target = v.gear === 'N' ? Math.max(0, v.speed - 1) : 0
  if (v.charging === 'charging' || v.chargeCable) target = 0                       // never drive away while plugged in
  const speed = approach(v.speed, clamp(target, 0, 200), dt)
  if (speed !== v.speed) out.speed = Math.round(speed * 10) / 10
  // energy: driving plus climate
  const km = (speed / 3600) * dt
  const climateKw = v.climate.enabled ? 1.2 + v.climate.fanSpeed * 0.08 : 0
  let wh = km * spec.whPerKm + (climateKw * 1000 * dt) / 3600
  // charging (AC 11 kW) only with the port open, the cable in and the car in park
  let charging = v.charging
  if (v.chargeCable && v.chargingPortOpen && v.gear === 'P') {
    if (v.batteryLevel >= v.chargeLimit) charging = 'complete'
    else { charging = 'charging'; wh -= (11000 * dt) / 3600 }
  } else charging = v.chargeCable ? 'connected' : 'disconnected'
  if (charging !== v.charging) out.charging = charging
  const level = clamp(v.batteryLevel - (wh / (spec.capacityKWh * 1000)) * 100, 0, 100)
  if (Math.abs(level - v.batteryLevel) > 1e-6) out.batteryLevel = level
  // cabin temperature drifts toward the set point with climate, toward outside+sun without
  const setPoint = v.climate.enabled ? v.climate.driverTemperature : v.outsideTemperature + (v.isLocked ? 8 : 3)
  const cabin = v.cabinTemperature + (setPoint - v.cabinTemperature) * Math.min(1, (dt * (v.heatScale || 1)) / (v.climate.enabled ? 90 : 600))
  if (Math.abs(cabin - v.cabinTemperature) > 1e-4) out.cabinTemperature = cabin
  return out
}

// ---- geography

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
export function lineLength(coords: LatLng[]): number {
  let d = 0
  for (let i = 1; i < coords.length; i++) d += distanceM(coords[i - 1]!, coords[i]!)
  return d
}
/** Point and heading at `along` metres from the start of the line. */
export function pointAlong(coords: LatLng[], along: number): { point: LatLng; heading: number; done: boolean } {
  if (coords.length < 2) return { point: coords[0] ?? { lat: 0, lng: 0 }, heading: 0, done: true }
  let left = Math.max(0, along)
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!, b = coords[i]!, seg = distanceM(a, b)
    if (left <= seg || i === coords.length - 1) {
      const f = seg === 0 ? 1 : Math.min(1, left / seg)
      return { point: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, heading: bearing(a, b), done: i === coords.length - 1 && left >= seg }
    }
    left -= seg
  }
  return { point: coords[coords.length - 1]!, heading: 0, done: true }
}

/** Deterministic stand-in route when no routing service answers: an L-shaped path along the grid, 1.35× detour. */
export function mockRoute(from: LatLng, to: LatLng): { coords: LatLng[]; distanceM: number; durationS: number } {
  const corner = { lat: from.lat, lng: to.lng }
  const mid1 = { lat: from.lat + (to.lat - from.lat) * 0.15, lng: from.lng + (corner.lng - from.lng) * 0.5 }
  const coords = [from, mid1, { lat: mid1.lat, lng: to.lng - (to.lng - from.lng) * 0.1 }, { lat: (mid1.lat + to.lat) / 2, lng: to.lng }, to]
  const d = lineLength(coords) * 1.0
  return { coords, distanceM: Math.round(d), durationS: Math.round(d / (28 / 3.6)) }
}

// ---- units
export const kmhToMph = (v: number) => v * 0.621371
export const cToF = (c: number) => c * 9 / 5 + 32
export function formatSpeed(kmh: number, units: 'metric' | 'imperial') { return Math.round(units === 'metric' ? kmh : kmhToMph(kmh)) }
export function formatTemp(c: number, units: 'metric' | 'imperial', digits = 1) { return (units === 'metric' ? c : cToF(c)).toFixed(digits) }
export function formatDistance(m: number, units: 'metric' | 'imperial') {
  if (units === 'imperial') { const mi = m / 1609.34; return mi < 0.2 ? `${Math.round(m * 3.28084)} ft` : `${mi.toFixed(1)} mi` }
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
}
export function formatDuration(s: number, lang: 'vi' | 'en') {
  const m = Math.max(1, Math.round(s / 60))
  if (m < 60) return lang === 'vi' ? `${m} phút` : `${m} min`
  return lang === 'vi' ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${Math.floor(m / 60)} h ${m % 60} min`
}
