import { describe, expect, it } from 'vitest'
import { buildTelemetry, fieldText, VF8_PROFILE, type VehicleLike } from './vehicleProfile'

const v = (over: Partial<VehicleLike> = {}): VehicleLike => ({ speed: 0, gear: 'P', batteryLevel: 68, outsideTemperature: 17, cabinTemperature: 21.5, charging: 'disconnected',
  doors: { fl: false, fr: true }, accelerationMode: 'standard', climate: { enabled: true }, ...over })

describe('vehicle profile', () => {
  it('never invents official figures: unverified fields are undefined and say so', () => {
    expect(VF8_PROFILE.trim).toBeUndefined(); expect(VF8_PROFILE.ratedRangeKm).toBeUndefined(); expect(VF8_PROFILE.torqueNm).toBeUndefined()
    expect(fieldText(VF8_PROFILE.maxPowerKW, 'kW')).toBe('Chưa xác minh'); expect(fieldText(87.7, 'kWh')).toBe('87.7 kWh')
  })
  it('the simulator battery is tagged PROJECT_SIM and only the manufacturer is OFFICIAL', () => {
    expect(VF8_PROFILE.provenance.batteryCapacityKWh).toBe('PROJECT_SIM'); expect(VF8_PROFILE.provenance.model).toBe('USER_IMAGE')
    expect(Object.entries(VF8_PROFILE.provenance).filter(([, p]) => p === 'OFFICIAL').map(([k]) => k)).toEqual(['manufacturer'])
  })
})

describe('telemetry', () => {
  it('is always flagged simulated and keeps units coherent', () => {
    const t = buildTelemetry(v({ speed: 12.4 })); expect(t.isSimulated).toBe(true); expect(t.speedKmh).toBe(12); expect(t.batterySocPercent).toBe(68)
    expect(t.driveMode).toBe('Normal'); expect(t.doorsOpen).toEqual([false, true]); expect(t.charging).toBe(false)
  })
  it('range follows state of charge and is a little lower with the climate on', () => {
    const on = buildTelemetry(v()).estimatedRangeKm, off = buildTelemetry(v({ climate: { enabled: false } })).estimatedRangeKm
    expect(off).toBeGreaterThan(on); expect(buildTelemetry(v({ batteryLevel: 34 })).estimatedRangeKm).toBeLessThan(off / 1.9 + 1)
  })
  it('prefers the backend cabin temperature over the simulated one and never goes negative on speed', () => {
    expect(buildTelemetry(v(), 38.2).cabinTemperatureC).toBe(38.2); expect(buildTelemetry(v({ speed: -3 })).speedKmh).toBe(0)
  })
})
