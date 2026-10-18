// One client-side mirror of the backend session. It stores what the backend committed, tells the UI when that
// is old or the link is down, and never computes risk. Two screens read this same store.
import { create } from 'zustand'
import { api, ApiError, type Session } from './api'
import { buildSensor, friendlyError, mergeState, RULE_VI, type SimInput } from './view'
import { notify, useNotifications } from '../store/notificationStore'
import { useVehicle } from '../store/vehicleStore'
import type { HistoryItem, NotificationItem, ObservationReply, ServerState, ServiceStatus } from './types'

const KEY = 'cabin-e2e-session-v1'
const POLL_MS = 1000
const SENSOR_MS = 2000
const WINDOW_MS = 10000

export interface Metrics {
  captured: number; sent: number; accepted: number; ignored: number; replayed: number; dropped: number; errors: number
  capTimes: number[]; accTimes: number[]
  lastReply: ObservationReply | null; lastRttMs: number | null; lastEncodeMs: number | null; lastCaptureAgeMs: number | null
  sensorSent: number; sensorErrors: number; uiCommitMs: number | null
}
const EMPTY_METRICS: Metrics = { captured: 0, sent: 0, accepted: 0, ignored: 0, replayed: 0, dropped: 0, errors: 0, capTimes: [], accTimes: [], lastReply: null, lastRttMs: null, lastEncodeMs: null, lastCaptureAgeMs: null, sensorSent: 0, sensorErrors: 0, uiCommitMs: null }

export type SourceKind = 'none' | 'clip' | 'upload' | 'device' | 'simulated'
/** localOnly: the picture is shown on this device only and no frame is sent, so no analysis result may be claimed for it. */
export type PlayerPhase = 'IDLE' | 'LOADING' | 'READY' | 'PLAYING' | 'PROCESSING' | 'ENDED' | 'ERROR' | 'UNSUPPORTED_CODEC' | 'SOURCE_UNAVAILABLE'
export interface SourceState { kind: SourceKind; label: string; running: boolean; localOnly: boolean; error: string | null; consent: boolean; cameraFault: null | 'BLOCKED' | 'DISCONNECTED'; runId?: string; playerPhase?: PlayerPhase; scenarioId?: string }

/** What the backend said about an owner action; the phone UI needs the reason to explain a rejection. */
export interface ActionOutcome { ok: boolean; detail?: string }

interface E2eStore {
  session: Session | null
  service: ServiceStatus | null; serviceError: string | null; sessionError: string | null; booting: boolean
  state: ServerState | null; receivedPerf: number; connection: 'ok' | 'lost'; failures: number
  /** the simulated VEHICLE is offline in this session: the simulated vehicle sends nothing (the backend also refuses). Not the browser link. */
  vehicleDown: boolean
  setVehicleDown: (down: boolean) => void
  notifications: NotificationItem[]; banner: NotificationItem | null
  history: HistoryItem[]; historyAfter: number
  sim: SimInput
  metrics: Metrics
  source: SourceState
  toast: string | null
  sessionNote: string | null
  bootstrap: () => Promise<void>
  newSession: (note?: string, preservePrevious?: boolean) => Promise<void>
  setSim: (p: Partial<SimInput>) => void
  setSource: (p: Partial<SourceState>) => void
  patchMetrics: (fn: (m: Metrics) => Partial<Metrics>) => void
  confirmDelivered: (id: number) => void
  dismissBanner: () => void
  acknowledge: (surface: 'PHONE' | 'COCKPIT') => Promise<ActionOutcome>
  /** seenRevision: the revision the person was looking at. If the committed state moved on, nothing is sent: they must look again. */
  resolve: (surface: 'PHONE' | 'COCKPIT', seenRevision?: number) => Promise<ActionOutcome>
  setMessagingFault: (fail: boolean) => Promise<void>
  /** Cabin Care: every call goes to the backend, which records who did it; the UI never starts comfort on its own. */
  care: (call: (s: Session) => Promise<unknown>, ok: string) => Promise<ActionOutcome>
  say: (m: string | null) => void
}

const known = new Set<number>()
const delivering = new Set<number>()
let baselineDone = false
let sessionCreation: Promise<void> | null = null

function readStored(): Session | null {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return v?.id && v?.token ? v : null } catch { return null }
}
function store(s: Session | null) {
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY) } catch { /* private mode: session lives in memory only */ }
}

export const useE2e = create<E2eStore>((set, get) => ({
  session: null, service: null, serviceError: null, sessionError: null, booting: true,
  state: null, receivedPerf: 0, connection: 'ok', failures: 0, vehicleDown: false,
  setVehicleDown: (vehicleDown) => set({ vehicleDown }),
  notifications: [], banner: null, history: [], historyAfter: 0,
  sim: { engineOn: false, driverPresent: false, radar: false, mode: 'NONE', hvacFault: false },
  metrics: EMPTY_METRICS,
  source: { kind: 'none', label: '', running: false, localOnly: false, error: null, consent: false, cameraFault: null },
  toast: null, sessionNote: null,

  bootstrap: async () => {
    try { set({ service: await api.status(), serviceError: null }) } catch (e) { set({ serviceError: e instanceof ApiError ? e.detail : 'Không kết nối được máy chủ demo' }) }
    const stored = readStored()
    if (stored) {
      set({ session: stored })
      try { await api.state(stored) } catch (e) {
        // 404 only means "no evaluation yet"; an auth error or a vanished database means start over
        if (!(e instanceof ApiError) || e.status !== 404) { store(null); set({ session: null }) }
      }
    }
    if (!get().session) await get().newSession()
    set({ booting: false })
  },

  newSession: async (note, preservePrevious = false) => {
    if (sessionCreation) return sessionCreation
    sessionCreation = (async () => {
    const old = get().session
    if (old && !preservePrevious) await api.erase(old).catch(() => undefined)
    known.clear(); baselineDone = false
    try {
      const c = await api.createSession()
      const session = { id: c.session_id, token: c.session_token }
      store(session)
      delivering.clear()
      set({ session, state: null, notifications: [], banner: null, history: [], historyAfter: 0, metrics: EMPTY_METRICS, connection: 'ok', failures: 0, vehicleDown: false, sessionError: null, sessionNote: note ?? null, toast: null })
    } catch (e) {
      set({ session: null, sessionError: e instanceof ApiError ? `Không tạo được phiên: ${e.detail}` : 'Không tạo được phiên demo (không kết nối được máy chủ)' })
    }
    })().finally(() => { sessionCreation = null })
    return sessionCreation
  },

  setSim: (p) => set((s) => ({ sim: { ...s.sim, ...p } })),
  setSource: (p) => set((s) => ({ source: { ...s.source, ...p } })),
  patchMetrics: (fn) => set((s) => ({ metrics: { ...s.metrics, ...fn(s.metrics) } })),
  say: (toast) => set({ toast }),
  dismissBanner: () => set({ banner: null }),

  confirmDelivered: (id) => {
    const { session } = get()
    if (!session || delivering.has(id)) return
    const item = get().notifications.find((n) => n.notification_id === id)
    if (item?.channels.in_app_feed.state === 'IN_APP_DELIVERED') return
    delivering.add(id)
    api.delivered(session, id).catch(() => { delivering.delete(id) })
  },

  acknowledge: async (surface) => {
    const { session } = get(); const incident = get().state?.incident_id
    if (!session || !incident) return { ok: false, detail: 'Không có sự cố đang mở.' }
    let outcome: ActionOutcome = { ok: true }
    try { await api.acknowledge(session, incident, surface); set({ toast: 'Đã ghi nhận bạn đã xem. Sự cố vẫn mở.' }) } catch (e) {
      outcome = { ok: false, detail: e instanceof ApiError ? friendlyError(e.detail) : 'Không gửi được xác nhận (mất kết nối)' }; set({ toast: outcome.detail })
    }
    await pollOnce()
    return outcome
  },

  resolve: async (surface, seenRevision) => {
    const { session } = get()
    if (!session) return { ok: false, detail: 'Chưa có phiên.' }
    let outcome: ActionOutcome = { ok: true }
    try {
      // fetch the committed state again so the request names the revision the user is looking at now
      const fresh = await api.state(session)
      set((s) => ({ state: mergeState(s.state, fresh), receivedPerf: performance.now() }))
      if (!fresh.incident_id) outcome = { ok: false, detail: 'Không có sự cố đang mở.' }
      else if (seenRevision !== undefined && fresh.revision !== seenRevision) outcome = { ok: false, detail: 'state changed: revision is newer than the one confirmed' }
      else { await api.resolve(session, fresh.incident_id, fresh.revision, surface); set({ toast: 'Đã đóng sự cố sau khi kiểm tra cabin.' }) }
    } catch (e) { outcome = { ok: false, detail: e instanceof ApiError ? e.detail : 'Không gửi được kết quả (mất kết nối)' }; set({ toast: e instanceof ApiError ? friendlyError(e.detail) : outcome.detail }) }
    await pollOnce()
    return outcome
  },

  care: async (call, ok) => {
    const { session } = get()
    if (!session) return { ok: false, detail: 'Chưa có phiên.' }
    let outcome: ActionOutcome = { ok: true }
    try { await call(session); set({ toast: ok }) } catch (e) {
      outcome = { ok: false, detail: e instanceof ApiError ? friendlyError(e.detail) : 'Không gửi được yêu cầu (mất kết nối)' }; set({ toast: outcome.detail })
    }
    await pollOnce()
    return outcome
  },

  setMessagingFault: async (fail) => {
    const { session } = get()
    if (!session) return
    try { await api.fault(session, fail ? 'FAIL' : 'OK'); set({ toast: fail ? 'Bộ gửi thông báo mô phỏng sẽ báo lỗi.' : 'Bộ gửi thông báo mô phỏng hoạt động lại.' }) } catch (e) { set({ toast: e instanceof ApiError ? e.detail : 'Không đặt được lỗi mô phỏng' }) }
  },
}))

// ---- polling: committed state, notifications and incremental history ------------------------------------------------
let pollTimer: ReturnType<typeof setTimeout> | null = null
let polling = false

export async function pollOnce(): Promise<void> {
  const { session } = useE2e.getState()
  if (!session) return
  const [st, nf, hi] = await Promise.allSettled([api.state(session), api.notifications(session), api.history(session, useE2e.getState().historyAfter)])
  if (useE2e.getState().session?.id !== session.id) return   // the session changed while we waited
  const patch: Partial<E2eStore> = {}
  if (st.status === 'fulfilled') {
    patch.state = mergeState(useE2e.getState().state, st.value); patch.receivedPerf = performance.now(); patch.connection = 'ok'; patch.failures = 0
    if (st.value.connectivity) patch.vehicleDown = st.value.connectivity.link === 'DROPPED'   // the backend is the source of truth for the vehicle link
  } else if (st.reason instanceof ApiError && st.reason.status === 404) {
    patch.connection = useE2e.getState().state ? 'lost' : 'ok'; patch.failures = 0
  } else if (st.reason instanceof ApiError && (st.reason.status === 401 || st.reason.status === 403)) {
    store(null); useE2e.setState({ session: null }); await useE2e.getState().newSession('Phiên cũ không còn hợp lệ. Đã tạo phiên mới.'); return
  } else {
    const failures = useE2e.getState().failures + 1
    patch.failures = failures; patch.connection = 'lost'
  }
  const incident = patch.state?.incident
  if (patch.state && incident?.status !== 'OPEN') {
    for (const n of useNotifications.getState().items) if (n.key.startsWith('e2e-')) useNotifications.getState().dismiss(n.id)
    if (useE2e.getState().banner) patch.banner = null
  }
  if (nf.status === 'fulfilled') {
    patch.notifications = nf.value
    const fresh = nf.value.filter((n) => !known.has(n.notification_id))
    fresh.forEach((n) => known.add(n.notification_id))
    if (baselineDone) {
      const newest = fresh.sort((a, b) => b.notification_id - a.notification_id)[0]
      if (newest) {
        patch.banner = newest
        const level = newest.risk_level === 'CRITICAL' ? 'critical' : newest.risk_level === 'WARNING' ? 'warning' : 'info'
        // one cabin toast at a time: the newest replaces older ones (history keeps them all)
        for (const n of useNotifications.getState().items) if (n.key.startsWith('e2e-')) useNotifications.getState().dismiss(n.id)
        notify({ key: `e2e-${newest.notification_id}`, level, title: `Giám sát cabin: ${(newest.rule_id && RULE_VI[newest.rule_id]) || newest.reason || 'có sự cố'}`, body: `Rev ${newest.revision} · dữ liệu mô phỏng` })
      }
    } else if (nf.value.length || st.status === 'fulfilled' || (st.status === 'rejected' && st.reason instanceof ApiError && st.reason.status === 404)) baselineDone = true
  }
  if (hi.status === 'fulfilled' && hi.value.items.length) {
    patch.history = [...useE2e.getState().history, ...hi.value.items].slice(-300); patch.historyAfter = hi.value.next_after
  } else if (hi.status === 'fulfilled') patch.historyAfter = hi.value.next_after
  useE2e.setState(patch)
}

export function startPolling() {
  if (polling) return
  polling = true
  const loop = async () => {
    if (!polling) return
    try { await pollOnce() } finally { if (polling) pollTimer = setTimeout(loop, POLL_MS) }
  }
  void loop()
}
export function stopPolling() { polling = false; if (pollTimer) clearTimeout(pollTimer) }

// ---- simulated telemetry publisher ------------------------------------------------------------------------------------
let sensorTimer: ReturnType<typeof setInterval> | null = null
let unsubscribers: (() => void)[] = []
let lastSensorJson = ''
let debounce: ReturnType<typeof setTimeout> | null = null

function sensorBody() {
  const v = useVehicle.getState(); const sim = useE2e.getState().sim
  return buildSensor({ gear: v.gear, speedKph: v.speed, locked: v.isLocked, climateEnabled: v.climate.enabled, cabinTemperature: v.cabinTemperature, batteryLevel: v.batteryLevel, windows: v.windows }, sim)
}
export async function publishSensor() {
  const { session } = useE2e.getState()
  if (!session || useE2e.getState().sim.telemetryEnabled === false || useE2e.getState().vehicleDown) return   // an offline vehicle sends nothing
  const body = sensorBody(); lastSensorJson = JSON.stringify(body)
  try { await api.sensor(session, body); useE2e.getState().patchMetrics((m) => ({ sensorSent: m.sensorSent + 1 })) } catch { useE2e.getState().patchMetrics((m) => ({ sensorErrors: m.sensorErrors + 1 })) }
}
export function startTelemetry() {
  if (sensorTimer) return
  sensorTimer = setInterval(() => void publishSensor(), SENSOR_MS)
  const changed = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => { if (JSON.stringify(sensorBody()) !== lastSensorJson) void publishSensor() }, 350)
  }
  unsubscribers = [useVehicle.subscribe(changed), useE2e.subscribe((s, p) => { if (s.sim !== p.sim) changed() })]
  void publishSensor()
}
export function stopTelemetry() { if (sensorTimer) clearInterval(sensorTimer); sensorTimer = null; unsubscribers.forEach((u) => u()); unsubscribers = [] }

export function recent(times: number[], now = performance.now()): number[] { return times.filter((t) => now - t <= WINDOW_MS) }
/** Events per second over the last 10 s (a short window on purpose: it shows the current rate, not an average). */
export const rate = (times: number[]) => recent(times).length / (WINDOW_MS / 1000)
