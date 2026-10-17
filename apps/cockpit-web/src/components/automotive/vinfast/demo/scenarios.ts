// One-tap demo scenarios. They only set INPUTS (a clip, simulated vehicle telemetry, a camera fault, a link cut). Risk, rule and
// occupant label always come back from the backend; nothing here can produce an alert or hide one.
import { linkState } from '../../../../e2e/api'
import { CLIPS, setCameraFault, startClip, stopSource } from '../../../../e2e/capture'
import { useE2e } from '../../../../e2e/store'
import { useVehicle } from '../../../../store/vehicleStore'

export type ScenarioId = 'child-hot' | 'empty' | 'blocked' | 'lost'
export const SCENARIOS: { id: ScenarioId; label: string; expect: string }[] = [
  { id: 'child-hot', label: 'Trẻ trong xe, xe nóng', expect: 'Mong đợi: cảnh báo trên xe và điện thoại' },
  { id: 'empty', label: 'Cabin trống', expect: 'Mong đợi: chưa kết luận xe trống' },
  { id: 'blocked', label: 'Camera bị che', expect: 'Mong đợi: không xác minh được cabin' },
  { id: 'lost', label: 'Mất kết nối', expect: 'Mong đợi: dữ liệu cũ, không báo an toàn' },
]

function park(tempC: number) {
  const v = useVehicle.getState()
  v.set({ cabinTemperature: tempC, isLocked: true, gear: 'P', speedOverride: 0, autoDrive: false, climate: { ...v.climate, enabled: false } })
  useE2e.getState().setSim({ engineOn: false, driverPresent: false, radar: false, hvacFault: false, mode: 'NONE' })
}
const clip = (id: string) => CLIPS.find((c) => c.id === id)!

export async function runScenario(id: ScenarioId): Promise<void> {
  setCameraFault(null); linkState.cutUntil = 0
  if (id === 'child-hot') { park(40); await startClip(clip('ai-child')) }
  else if (id === 'empty') { park(25); await startClip(clip('empty-cabin')) }
  else if (id === 'blocked') { park(30); setCameraFault('BLOCKED') }
  else {
    // let one clip frame reach the backend, then cut the browser-to-server link for 15 s
    park(40); await startClip(clip('ai-child'))
    setTimeout(() => { linkState.cutUntil = performance.now() + 15000 }, 4000)
  }
}

/** Back to a clean session: no source, no fault, link restored, parked cool vehicle, new backend session (the old one is erased). */
export async function resetDemo(): Promise<void> {
  stopSource(); setCameraFault(null); linkState.cutUntil = 0
  const v = useVehicle.getState()
  v.set({ cabinTemperature: 21.5, isLocked: false, gear: 'P', speedOverride: null, heatScale: 1, autoDrive: false, climate: { ...v.climate, enabled: true } })
  useE2e.getState().setSim({ engineOn: false, driverPresent: false, radar: false, hvacFault: false, mode: 'NONE' })
  await useE2e.getState().newSession('Đã đặt lại: phiên mới, dữ liệu phiên cũ đã được yêu cầu xoá.')
}
