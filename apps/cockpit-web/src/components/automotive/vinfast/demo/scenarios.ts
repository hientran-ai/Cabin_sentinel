// One-tap demo scenarios. They only set INPUTS (a clip, simulated vehicle telemetry, a camera fault, a link cut). Risk, rule and
// occupant label always come back from the backend; nothing here can produce an alert or hide one.
import { linkState } from '../../../../e2e/api'
import { CLIPS, setCameraFault, startClip, stopSource } from '../../../../e2e/capture'
import { publishSensor, startTelemetry, stopTelemetry, useE2e } from '../../../../e2e/store'
import { DEMO_SCENARIOS } from '../../../../e2e/demoCatalog'
import { api } from '../../../../e2e/api'
import { SIM_SCENARIOS } from '../../../../e2e/simScenarios'
import { useVehicle } from '../../../../store/vehicleStore'

export type ScenarioId = 'child-hot' | 'empty' | 'blocked' | 'lost'
export const SCENARIOS: { id: ScenarioId; label: string; expect: string }[] = [
  { id: 'child-hot', label: 'Trẻ trong xe, xe nóng', expect: 'Mong đợi: cảnh báo trên xe và điện thoại' },
  { id: 'empty', label: 'Cabin trống', expect: 'Mong đợi: chưa kết luận xe trống' },
  { id: 'blocked', label: 'Camera bị che — Mô phỏng mất tầm nhìn', expect: 'MÔ PHỎNG: không có hình; radar mô phỏng dương tính; backend quyết định' },
  { id: 'lost', label: 'Mất kết nối với xe — Vehicle Offline', expect: 'MÔ PHỎNG: xe ngừng gửi dữ liệu; cabin Chưa thể xác minh; sự cố giữ nguyên' },
]

function park(tempC: number) {
  const v = useVehicle.getState()
  v.set({ cabinTemperature: tempC, isLocked: true, gear: 'P', speedOverride: 0, autoDrive: false, climate: { ...v.climate, enabled: false } })
  useE2e.getState().setSim({ engineOn: false, driverPresent: false, radar: false, hvacFault: false, mode: 'NONE' })
}
const clip = (id: string) => CLIPS.find((c) => c.id === id)!
let videoScenarioEpoch = 0
let cutTimer: ReturnType<typeof setTimeout> | null = null
function cancelCut() { if (cutTimer) clearTimeout(cutTimer); cutTimer = null; linkState.cutUntil = 0 }

/** A scenario starts its own explicitly labelled demo session. Prior sessions are retained, never auto-resolved. */
export async function runVideoScenario(id: string): Promise<void> {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === id)
  if (!scenario) return
  const epoch = ++videoScenarioEpoch
  stopSource(); stopTelemetry(); setCameraFault(null); cancelCut(); cancelOfflineTimers(); useE2e.getState().setVehicleDown(false)
  await useE2e.getState().newSession(`Tình huống ${id}: phiên demo riêng. Phiên trước không tự đóng sự cố và được giữ theo thời hạn demo.`, true)
  if (epoch !== videoScenarioEpoch || !useE2e.getState().session) return
  const f = scenario.telemetry, driving = f.vehicle_moving === true
  const v = useVehicle.getState()
  v.set({ cabinTemperature: typeof f.cabin_temp_c === 'number' ? f.cabin_temp_c : 25, heatScale: 1,
    isLocked: f.locked === true, gear: driving ? 'D' : 'P', parkingBrake: !driving, speed: driving ? 30 : 0, speedOverride: driving ? 30 : 0,
    autoDrive: false, climate: { ...v.climate, enabled: driving } })
  useE2e.getState().setSim({ engineOn: f.ignition_on === true, driverPresent: driving || id === 'DEMO-06',
    radar: f.radar_presence === true, telemetryEnabled: f.radar_presence !== null || id === 'DEMO-01' || id === 'DEMO-04', tripEnded: f.trip_ended === true, hvacFault: false, mode: 'NONE' })   // DEMO-01/04 (radar unknown in the manifest) are judged by vision with a simulated radar-negative sensor; the outside person of DEMO-01 is split off by the window calibration in the backend
  await publishSensor()
  if (epoch !== videoScenarioEpoch) return
  startTelemetry()
  await startClip(clip(id))
}

const offlineTimers = new Set<ReturnType<typeof setTimeout>>()
function cancelOfflineTimers() { offlineTimers.forEach(clearTimeout); offlineTimers.clear() }
/** Restores the simulated vehicle link of the CURRENT session (no effect on anything else). Reports API errors truthfully. */
export async function restoreVehicleLink(): Promise<{ ok: boolean; detail?: string }> {
  const { session } = useE2e.getState()
  if (!session) return { ok: false, detail: 'Chưa có phiên.' }
  try {
    await api.link(session, 'RESTORE'); useE2e.getState().setVehicleDown(false); await publishSensor()
    // the demo vehicle's camera feed is a clip: if it ran to its end while offline, play it again so fresh frames can validate the link
    const src = useE2e.getState().source, again = src.kind === 'clip' && !src.running ? CLIPS.find((c) => c.label === src.label) : undefined
    if (again) void startClip(again)
    return { ok: true }
  }
  catch (e) { const detail = e instanceof Error ? e.message : 'Không nối lại được'; useE2e.getState().say(`Không nối lại được: ${detail}`); return { ok: false, detail } }
}
/** Stops the running scenario: media, telemetry, pending offline timers; restores this session's simulated vehicle link. Incidents are not touched. */
export async function stopScenario(): Promise<void> {
  videoScenarioEpoch += 1; cancelCut(); cancelOfflineTimers(); stopSource(); stopTelemetry(); setCameraFault(null)
  await restoreVehicleLink()
}
export async function dropVehicleLink(): Promise<void> {
  const { session } = useE2e.getState()
  if (!session) return
  try { await api.link(session, 'DROP'); useE2e.getState().setVehicleDown(true) } catch (e) { useE2e.getState().say(`Không mô phỏng được mất kết nối: ${e instanceof Error ? e.message : ''}`) }
}

/** SIM-01 / SIM-02: scenarios without footage. Each starts its own isolated demo session; the previous one is kept, never auto-resolved. */
export async function runSimScenario(id: 'SIM-01' | 'SIM-02'): Promise<void> {
  const sc = SIM_SCENARIOS.find((s) => s.scenario_id === id)
  if (!sc) return
  const epoch = ++videoScenarioEpoch
  stopSource(); stopTelemetry(); setCameraFault(null); cancelCut(); cancelOfflineTimers()
  useE2e.getState().setVehicleDown(false)
  const prev = useE2e.getState().session
  if (prev) await api.link(prev, 'RESTORE').catch(() => undefined)   // never leave the previous session's simulated vehicle offline
  await useE2e.getState().newSession(`Tình huống ${id}: phiên demo riêng. Phiên trước không tự đóng sự cố.`, true)
  if (epoch !== videoScenarioEpoch || !useE2e.getState().session) return
  const f = sc.telemetry_fixture, v = useVehicle.getState()
  v.set({ cabinTemperature: f.cabin_temp_c ?? 25, heatScale: 1, isLocked: f.locked, gear: 'P', speed: 0, speedOverride: 0, autoDrive: false, climate: { ...v.climate, enabled: false } })
  useE2e.getState().setSim({ engineOn: f.ignition_on, driverPresent: false, radar: f.radar_presence === true, telemetryEnabled: f.radar_presence !== null, tripEnded: false, hvacFault: false, mode: 'NONE' })
  await publishSensor()
  if (epoch !== videoScenarioEpoch) return
  startTelemetry()
  if (id === 'SIM-01') {
    // no picture exists: say so, and report the camera as blocked (origin SIMULATED_FAULT). The backend decides what that means.
    useE2e.getState().setSource({ kind: 'simulated', label: 'MÔ PHỎNG CAMERA BỊ CHE', running: true, localOnly: false, error: null, scenarioId: id, playerPhase: 'SOURCE_UNAVAILABLE' })
    setCameraFault('BLOCKED')
  } else {
    await startClip(clip('ai-child'))   // a real clip first, so there is a real CRITICAL incident to keep while the vehicle goes offline
    const runId = useE2e.getState().source.runId
    offlineTimers.add(setTimeout(() => { if (epoch === videoScenarioEpoch && useE2e.getState().source.runId === runId) void dropVehicleLink() }, 6000))
  }
}

export async function runScenario(id: ScenarioId): Promise<void> {
  if (id === 'blocked') return runSimScenario('SIM-01')
  if (id === 'lost') return runSimScenario('SIM-02')
  videoScenarioEpoch += 1; cancelCut()
  useE2e.getState().setSim({ telemetryEnabled: true, tripEnded: false })
  setCameraFault(null)
  if (id === 'child-hot') { park(40); await startClip(clip('ai-child')) }
  else if (id === 'empty') { park(25); await startClip(clip('empty-cabin')) }
  else if (id === 'blocked') { park(30); setCameraFault('BLOCKED') }
  else {
    // let one clip frame reach the backend, then cut the browser-to-server link for 15 s
    park(40); await startClip(clip('ai-child'))
    const runId = useE2e.getState().source.runId
    cutTimer = setTimeout(() => { if (useE2e.getState().source.runId === runId) linkState.cutUntil = performance.now() + 15000 }, 4000)
  }
}

/** Back to a clean session: no source, no fault, link restored, parked cool vehicle, new backend session (the old one is erased). */
export async function resetDemo(): Promise<void> {
  videoScenarioEpoch += 1; cancelCut(); cancelOfflineTimers(); useE2e.getState().setVehicleDown(false)
  stopSource(); setCameraFault(null)
  const v = useVehicle.getState()
  v.set({ cabinTemperature: 21.5, isLocked: false, gear: 'P', speedOverride: null, heatScale: 1, autoDrive: false, climate: { ...v.climate, enabled: true } })
  useE2e.getState().setSim({ engineOn: false, driverPresent: false, radar: false, hvacFault: false, mode: 'NONE', telemetryEnabled: true, tripEnded: false })
  await useE2e.getState().newSession('Đã đặt lại: phiên mới, dữ liệu phiên cũ đã được yêu cầu xoá.')
}
