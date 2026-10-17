// Typed vehicle profile + telemetry for the VinFast HMI. Official static specs are NOT invented: a field without a verified source is
// `undefined` and the UI says "Chưa xác minh". Values taken from this project's simulator are tagged PROJECT_SIM, never OFFICIAL.
import { BRANDS } from '../../../lib/vehicleSimulation'

export type Provenance = 'OFFICIAL' | 'PROJECT_SIM' | 'USER_IMAGE' | 'UNVERIFIED'
export type VehicleProfile = {
  manufacturer: string; model: string; trim?: string; modelYear?: number
  batteryCapacityKWh?: number; usableBatteryKWh?: number; ratedRangeKm?: number; maxPowerKW?: number; torqueNm?: number
  provenance: Record<string, Provenance>
}
export type VehicleTelemetry = {
  speedKmh: number; gear: 'P' | 'R' | 'N' | 'D'; batterySocPercent: number; estimatedRangeKm: number
  batteryTemperatureC?: number; outsideTemperatureC?: number; cabinTemperatureC?: number; charging: boolean
  doorsOpen?: boolean[]; driveMode?: string; isSimulated: boolean
}

/** Target model = VF 8, from the reference renders the project owner supplied. Trim, year and every official figure stay unverified. */
export const VF8_PROFILE: VehicleProfile = {
  manufacturer: 'VinFast', model: 'VF 8',
  batteryCapacityKWh: BRANDS.vinfast.capacityKWh,   // simulator capacity, not checked against VinFast documentation
  provenance: { manufacturer: 'OFFICIAL', model: 'USER_IMAGE', trim: 'UNVERIFIED', modelYear: 'UNVERIFIED', batteryCapacityKWh: 'PROJECT_SIM',
    usableBatteryKWh: 'UNVERIFIED', ratedRangeKm: 'UNVERIFIED', maxPowerKW: 'UNVERIFIED', torqueNm: 'UNVERIFIED' },
}

export interface VehicleLike {
  speed: number; gear: 'P' | 'R' | 'N' | 'D'; batteryLevel: number; outsideTemperature: number; cabinTemperature: number
  charging: 'disconnected' | 'connected' | 'charging' | 'complete'; doors: Record<string, boolean>; accelerationMode: 'chill' | 'standard' | 'sport'
  climate: { enabled: boolean }
}
const DRIVE: Record<VehicleLike['accelerationMode'], string> = { chill: 'Eco', standard: 'Normal', sport: 'Sport' }

/** Everything the simulator feeds the screens, flagged `isSimulated`. No live vehicle exists in the demo. */
export function buildTelemetry(v: VehicleLike, cabinC?: number | null): VehicleTelemetry {
  const range = Math.round((v.batteryLevel / 100) * BRANDS.vinfast.capacityKWh * 1000 / BRANDS.vinfast.whPerKm * (v.climate.enabled ? 0.96 : 1))
  return {
    speedKmh: Math.max(0, Math.round(v.speed)), gear: v.gear, batterySocPercent: Math.round(v.batteryLevel), estimatedRangeKm: range,
    outsideTemperatureC: v.outsideTemperature, cabinTemperatureC: typeof cabinC === 'number' ? cabinC : v.cabinTemperature,
    charging: v.charging === 'charging', doorsOpen: Object.values(v.doors), driveMode: DRIVE[v.accelerationMode], isSimulated: true,
  }
}

export const PROV_LABEL: Record<Provenance, string> = { OFFICIAL: 'chính thức', PROJECT_SIM: 'mô phỏng dự án', USER_IMAGE: 'theo ảnh tham chiếu', UNVERIFIED: 'chưa xác minh' }
export const fieldText = (value: string | number | undefined, unit = '') => (value == null ? 'Chưa xác minh' : `${value}${unit ? ` ${unit}` : ''}`)
