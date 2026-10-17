import { describe, expect, it } from 'vitest'
import { BRANDS, approach, demoTargetSpeed, distanceM, formatDistance, formatSpeed, formatTemp, lineLength, mockRoute, pointAlong, rangeKm, step } from './vehicleSimulation'
import type { VehicleState } from '../types/vehicle'

const base: VehicleState = {
  brand: 'tesla', speed: 0, gear: 'P', batteryLevel: 68, isLocked: false,
  doors: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
  windows: { frontLeft: 'closed', frontRight: 'closed', rearLeft: 'closed', rearRight: 'closed' },
  frontTrunkOpen: false, rearTrunkOpen: false, chargingPortOpen: false, chargeCable: false, charging: 'disconnected', chargeLimit: 80,
  headlights: 'auto', parkingBrake: true, driverSeatbelt: true, childLock: true, sentryMode: false, steeringMode: 'standard', accelerationMode: 'standard', regenLevel: 'standard',
  climate: { enabled: false, driverTemperature: 21.5, passengerTemperature: 21.5, sync: true, fanSpeed: 4, autoMode: true, ac: true, recirculation: false, airflow: 'face', frontDefrost: false, rearDefrost: false, seatHeatDriver: 0, seatHeatPassenger: 0 },
  outsideTemperature: 17, heatScale: 1, cabinTemperature: 21.5, autoDrive: false, speedOverride: null,
}
const env = (t = 20, dt = 1) => ({ t, dt, spec: BRANDS.tesla })

describe('vehicle simulation', () => {
  it('heats a parked locked cabin toward outside+8 °C, faster with heatScale', () => {
    const hot = { ...base, isLocked: true, outsideTemperature: 36, cabinTemperature: 30 }
    const slow = step(hot, env(0, 0.5)).cabinTemperature! - 30
    const fast = step({ ...hot, heatScale: 60 }, env(0, 0.5)).cabinTemperature! - 30
    expect(slow).toBeGreaterThan(0)
    expect(fast).toBeGreaterThan(slow * 30)
  })
  it('stays still in park, even with demo driving on', () => {
    expect(step({ ...base, autoDrive: true }, env()).speed).toBeUndefined()
  })
  it('accelerates smoothly in drive and never jumps to the target', () => {
    const v = { ...base, gear: 'D' as const, parkingBrake: false, autoDrive: true }
    const s = step(v, env(20, 0.1)).speed!
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(2)
    expect(approach(40, 40, 1)).toBe(40)
  })
  it('never drives away while plugged in', () => {
    expect(step({ ...base, gear: 'D', parkingBrake: false, speedOverride: 50, chargeCable: true }, env()).speed).toBeUndefined()
  })
  it('charges only with the port open, cable in and in park, and stops at the limit', () => {
    const plugged = { ...base, chargingPortOpen: true, chargeCable: true }
    const p = step(plugged, env(0, 60))
    expect(p.charging).toBe('charging')
    expect(p.batteryLevel!).toBeGreaterThan(68)
    expect(step({ ...plugged, batteryLevel: 80 }, env()).charging).toBe('complete')
    expect(step({ ...base, chargeCable: true }, env()).charging).toBe('connected')
  })
  it('uses energy while driving and for climate', () => {
    const d = step({ ...base, gear: 'D', parkingBrake: false, speed: 60, speedOverride: 60 }, env(0, 60))
    expect(d.batteryLevel!).toBeLessThan(68)
    expect(step({ ...base, climate: { ...base.climate, enabled: true } }, env(0, 60)).batteryLevel!).toBeLessThan(68)
  })
  it('estimates range from capacity and consumption', () => {
    expect(rangeKm(BRANDS.tesla, 100, false)).toBe(500)
    expect(rangeKm(BRANDS.vinfast, 50, false)).toBe(225)
    expect(rangeKm(BRANDS.tesla, 68, true)).toBeLessThan(rangeKm(BRANDS.tesla, 68, false))
  })
  it('demo speed profile stops at lights and reverses slowly', () => {
    expect(demoTargetSpeed(3, 'D')).toBe(0)
    expect(demoTargetSpeed(20, 'D')).toBeGreaterThan(30)
    expect(demoTargetSpeed(20, 'R')).toBe(6)
    expect(demoTargetSpeed(20, 'P')).toBe(0)
  })
})

describe('geography', () => {
  const a = { lat: 21.0287, lng: 105.8522 }, b = { lat: 21.0145, lng: 105.8137 }
  it('measures distance and walks along a line', () => {
    expect(distanceM(a, b)).toBeGreaterThan(4000)
    expect(distanceM(a, b)).toBeLessThan(4500)
    const r = mockRoute(a, b)
    expect(r.coords[0]).toEqual(a)
    expect(r.coords.at(-1)).toEqual(b)
    expect(Math.abs(lineLength(r.coords) - r.distanceM)).toBeLessThan(2)
    expect(pointAlong(r.coords, 0).point).toEqual(a)
    expect(pointAlong(r.coords, 1e9).done).toBe(true)
  })
  it('formats units', () => {
    expect(formatSpeed(100, 'imperial')).toBe(62)
    expect(formatTemp(21.5, 'imperial')).toBe('70.7')
    expect(formatDistance(850, 'metric')).toBe('850 m')
    expect(formatDistance(12345, 'metric')).toBe('12.3 km')
  })
})
