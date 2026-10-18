// Same-origin by default (the Cloudflare Worker proxies /api to the backend); VITE_API_BASE only for a split deploy.
import type { CareProfile, CareView, HistoryItem, NotificationItem, ObservationReply, SensorInput, ServerState, ServiceStatus, Connectivity } from './types'
import { validateApiPayload } from './contract'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(public status: number, public detail: string, public retryAfterS?: number) { super(`${status} ${detail}`) }
}
export interface Session { id: string; token: string }
/** The simulator can cut the browser→backend link on purpose; nothing else about the backend changes. */
let tripEndedAccepted = true
export const linkState = { cutUntil: 0 }

async function call<T>(path: string, init: RequestInit & { token?: string; timeoutMs?: number } = {}): Promise<T> {
  const { token, timeoutMs = 10000, ...rest } = init
  if (performance.now() < linkState.cutUntil) throw new TypeError('Simulated link cut')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const headers = new Headers(rest.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${BASE}/api/v1/e2e${path}`, { ...rest, headers, signal: ctl.signal, cache: 'no-store' })
    if (!res.ok) {
      let detail = res.statusText
      try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail.slice(0, 240) : 'Yêu cầu không hợp lệ' } catch { /* keep status text */ }
      throw new ApiError(res.status, detail, Number(res.headers.get('Retry-After')) || undefined)
    }
    let value: unknown
    try {
      value = await res.json()
      validateApiPayload(path, value)
    } catch {
      console.error('[CabinSentinel API]', { event: 'invalid_response', endpoint: path.replace(/\/sessions\/[^/]+/, '/sessions/:session').split('?')[0], status: res.status })
      throw new ApiError(502, 'Dữ liệu máy chủ chưa thể xác minh. Vui lòng thử lại.')
    }
    return value as T
  } finally { clearTimeout(timer) }
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

type Surface = 'PHONE' | 'COCKPIT'

export const api = {
  itemResponse: (s: Session, id: string, response: 'TAKEN' | 'SNOOZE', snooze_minutes?: number) => call<Record<string, unknown>>(`/sessions/${s.id}/items/${encodeURIComponent(id)}/respond`, { ...json({ response, ...(snooze_minutes !== undefined ? { snooze_minutes } : {}) }), token: s.token }),
  status: () => call<ServiceStatus>('/status'),
  createSession: () => call<{ session_id: string; session_token: string; vehicle_id: string }>('/sessions', { method: 'POST' }),
  state: (s: Session) => call<ServerState>(`/sessions/${s.id}/state`, { token: s.token }),
  notifications: (s: Session) => call<NotificationItem[]>(`/sessions/${s.id}/notifications`, { token: s.token }),
  history: (s: Session, after: number) => call<{ items: HistoryItem[]; next_after: number }>(`/sessions/${s.id}/history?after=${after}`, { token: s.token }),
  sensor: async (s: Session, body: SensorInput) => {
    const send = (b: SensorInput) => call<{ committed: { revision: number } | null }>(`/sessions/${s.id}/sensor`, { ...json(b), token: s.token })
    const { trip_ended: tripEnded, ...base } = body
    if (tripEnded === undefined || !tripEndedAccepted) return send(base)
    // an older backend rejects the optional demo field `trip_ended` with 422 and would then never take a sensor update (stale data, no alert on the phone): drop it and remember
    try { return await send(body) } catch (e) { if (e instanceof ApiError && e.status === 422) { tripEndedAccepted = false; return send(base) } throw e }
  },
  observation: (s: Session, blob: Blob, meta: { frameId: string; captureAgeMs: number; source: 'UPLOAD' | 'CLIP_FRAME' | 'DEVICE_CAMERA'; label: string; mediaTimeS?: number }) => {
    const form = new FormData()
    form.set('image', blob, `${meta.frameId}.jpg`)
    form.set('frame_id', meta.frameId); form.set('capture_age_ms', String(Math.max(0, Math.round(meta.captureAgeMs))))
    form.set('source', meta.source); form.set('source_label', meta.label)
    if (meta.mediaTimeS !== undefined) form.set('media_time_s', String(meta.mediaTimeS))
    return call<ObservationReply>(`/sessions/${s.id}/observations`, { method: 'POST', body: form, token: s.token, timeoutMs: 15000 })
  },
  /** Demo switch for THIS session's simulated vehicle link. */
  link: (s: Session, action: 'DROP' | 'RESTORE') => call<{ connectivity: Connectivity }>(`/sessions/${s.id}/link`, { ...json({ action }), token: s.token }),
  cameraStatus: (s: Session, body: { frame_id: string; status: 'BLOCKED' | 'ERROR' | 'DISCONNECTED' | 'NO_FEED'; reason: string; origin: 'REAL_ADAPTER' | 'SIMULATED_FAULT'; capture_age_ms?: number }) =>
    call<{ accepted: boolean }>(`/sessions/${s.id}/camera-status`, { ...json(body), token: s.token }),
  delivered: (s: Session, id: number) => call<{ repeated: boolean }>(`/sessions/${s.id}/notifications/${id}/delivered`, { method: 'POST', token: s.token }),
  acknowledge: (s: Session, incident_id: string, surface: 'PHONE' | 'COCKPIT') => call<{ revision: number }>(`/sessions/${s.id}/acknowledge`, { ...json({ incident_id, surface }), token: s.token }),
  resolve: (s: Session, incident_id: string, revision: number, surface: 'PHONE' | 'COCKPIT') =>
    call<{ revision: number }>(`/sessions/${s.id}/resolve`, { ...json({ incident_id, revision, cabin_checked: true, surface }), token: s.token }),
  careDeclare: (s: Session, occupant: CareProfile, surface: Surface) => call<CareView>(`/sessions/${s.id}/care/declare`, { ...json({ occupant, surface }), token: s.token }),
  careStart: (s: Session, body: { profile?: CareProfile; music?: string }, surface: Surface) => call<CareView>(`/sessions/${s.id}/care/start`, { ...json({ ...body, surface }), token: s.token }),
  careStop: (s: Session, surface: Surface) => call<CareView>(`/sessions/${s.id}/care/stop`, { ...json({ surface }), token: s.token }),
  careConsent: (s: Session, auto_start: boolean, surface: Surface) => call<CareView>(`/sessions/${s.id}/care/consent`, { ...json({ auto_start, surface }), token: s.token }),
  erase: (s: Session) => call<{ deleted: boolean }>(`/sessions/${s.id}`, { method: 'DELETE', token: s.token }),
  fault: (s: Session, messaging_provider: 'OK' | 'FAIL') => call<{ messaging_provider: string }>(`/sessions/${s.id}/faults`, { ...json({ messaging_provider }), token: s.token }),
}
