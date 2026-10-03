import { adaptAgentState, adaptBackendState, adaptDemoResponse } from './adapter'
import type { BackendCabinState, BackendDemoResponse, BackendHealth } from '../types/backend'
import type { AcknowledgementReason, AgentState, BackendCapabilities, DemoScenario, SimulationUpdate, SystemHealth } from '../types/agent'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const POLL_INTERVAL_MS = 1500
const READ_TIMEOUT_MS = 10_000
export const USE_MOCKS = false
export const BACKEND_CAPABILITIES: BackendCapabilities = { manualEmergencyActions: false, acknowledgement: false, simulationControls: false, demoAnalysis: true }
// Session credentials are memory-only: never in a URL, storage, logs, or Vite env.
let session: { id: string; token: string } | undefined
let analysisRunning = false
let mutationRunning = false
let externalStateSource = false
export function setExternalStateSource(active: boolean) { externalStateSource = active }

export class ApiRequestError extends Error {
  readonly status?: number
  readonly retryAfter?: string | null
  constructor(message: string, status?: number, retryAfter?: string | null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.retryAfter = retryAfter
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function invalid(): never { throw new ApiRequestError('Invalid backend response — no current safety decision is available.') }
function validateState(value: unknown): asserts value is BackendCabinState {
  if (!record(value) || typeof value.vehicle_id !== 'string' || !Number.isInteger(value.revision) ||
    typeof value.risk_level !== 'string' || typeof value.reason !== 'string' || typeof value.rule_id !== 'string' ||
    typeof value.evaluated_at !== 'string' || !Number.isFinite(Date.parse(value.evaluated_at))) invalid()
  for (const field of ['action_results', 'action_ledger', 'evidence_conflicts', 'seat_evidence', 'detected_objects']) {
    if (value[field] != null && (!Array.isArray(value[field]) || !(value[field] as unknown[]).every(record))) invalid()
  }
  if (value.incident != null && (!record(value.incident) || typeof value.incident.incident_id !== 'string' || typeof value.incident.status !== 'string')) invalid()
  if (value.data_quality != null && (!record(value.data_quality) || typeof value.data_quality.status !== 'string' || !Array.isArray(value.data_quality.issues))) invalid()
}
function validateDemo(value: unknown): asserts value is BackendDemoResponse {
  if (!record(value) || typeof value.session_id !== 'string' || !value.session_id ||
    !record(value.vision) || value.vision.source !== 'MODEL_INFERENCE' || !Array.isArray(value.vision.detections) ||
    !record(value.vehicle_state) || typeof value.vehicle_state.vehicle_id !== 'string' ||
    !record(value.reasoning) || typeof value.reasoning.risk_level !== 'string' ||
    typeof value.reasoning.rule_id !== 'string' || typeof value.reasoning.reason !== 'string' ||
    !Number.isInteger(value.reasoning.revision) || typeof value.reasoning.decision_current !== 'boolean' ||
    !Array.isArray(value.actions) || !value.actions.every(record)) invalid()
}
export async function request<T>(path: string, init?: RequestInit, timeoutMs = READ_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal, credentials: 'omit', cache: 'no-store' })
    let payload: unknown
    try { payload = await response.json() } catch { invalid() }
    if (!response.ok) {
      const raw = record(payload) ? payload.detail : undefined
      const detail = typeof raw === 'string' ? raw : Array.isArray(raw)
        ? raw.map(item => record(item) && typeof item.msg === 'string' ? item.msg : 'Invalid request').join('; ')
        : `Request failed (${response.status})`
      throw new ApiRequestError(detail, response.status, response.headers.get('Retry-After'))
    }
    if (!record(payload) && !Array.isArray(payload)) invalid()
    return payload as T
  } catch (error) {
    if (controller.signal.aborted) throw new ApiRequestError('Timeout — backend did not respond. Check the current state before retrying.')
    if (error instanceof ApiRequestError) throw error
    throw new ApiRequestError('Network error — backend unavailable. No current safety decision is available.')
  } finally { window.clearTimeout(timer) }
}
function sessionInit(value: { id: string; token: string }, init?: RequestInit): RequestInit {
  return { ...init, headers: { ...init?.headers, Authorization: `Bearer ${value.token}` } }
}
async function readSession(value: { id: string; token: string }): Promise<AgentState> {
  const payload = await request<unknown>(`/api/v1/demo/sessions/${encodeURIComponent(value.id)}`, sessionInit(value))
  validateState(payload)
  if (payload.vehicle_id !== `DEMO_${value.id}`) invalid()
  return adaptBackendState(payload)
}
export function subscribeToAgentState(onState: (state: AgentState) => void, onConnection: (connected: boolean) => void): () => void {
  let active = true
  let running = false
  const poll = async () => {
    if (!active || running || !session || externalStateSource || analysisRunning || mutationRunning) return
    running = true
    const value = session
    try {
      const state = await readSession(value)
      if (active && value === session && !externalStateSource && !analysisRunning && !mutationRunning) { onState(state); onConnection(true) }
    } catch {
      if (active && value === session && !externalStateSource) onConnection(false)
    } finally { running = false }
  }
  const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
  return () => { active = false; window.clearInterval(timer) }
}
export async function executeEmergencyActions(_eventId: string): Promise<AgentState> {
  throw new ApiRequestError('Actions are managed by backend evaluation; no manual actuator endpoint is exposed.', 501)
}
export async function acknowledgeEvent(_eventId: string, _reason: AcknowledgementReason): Promise<AgentState> {
  throw new ApiRequestError('These resolution reasons do not match the backend contract. Use the separate demo incident controls.', 501)
}
export async function updateSimulation(_update: SimulationUpdate): Promise<AgentState> {
  throw new ApiRequestError('JSON simulation controls are unavailable; upload an image with a supported scenario.', 501)
}
export async function analyzeDemo(image: File, scenario: DemoScenario): Promise<AgentState> {
  if (analysisRunning || mutationRunning) throw new ApiRequestError('An operation is already pending; wait for its result.')
  analysisRunning = true
  try {
    const value = session
    const form = new FormData()
    form.append('image', image); form.append('scenario', scenario)
    if (value) form.append('session_id', value.id)
    const payload = await request<unknown>('/api/v1/demo/analyze', value ? sessionInit(value, { method: 'POST', body: form }) : { method: 'POST', body: form }, 90_000)
    validateDemo(payload)
    if (payload.vehicle_state.vehicle_id !== `DEMO_${payload.session_id}`) invalid()
    if (value) {
      if (payload.session_id !== value.id) invalid()
    } else {
      if (typeof payload.session_token !== 'string' || !payload.session_token) invalid()
      session = { id: payload.session_id, token: payload.session_token }
    }
    try { return await readSession(session!) }
    catch {
      // Preserve a received backend verdict only as history if its freshness cannot be re-read.
      return { ...adaptDemoResponse(payload), decisionCurrent: false, dataAgeMs: 3001, internetAvailable: false, simulation: true }
    }
  } finally { analysisRunning = false }
}
export async function fetchEventHistory(): Promise<AgentState[]> {
  if (!session || externalStateSource) return []
  const value = session
  const payload = await request<unknown>(`/api/v1/demo/sessions/${encodeURIComponent(value.id)}/events?limit=50`, sessionInit(value))
  if (!Array.isArray(payload)) invalid()
  const states = payload.filter(event => record(event) && typeof event.risk_level === 'string')
  states.forEach(validateState)
  if (value !== session || externalStateSource) return []
  return states.map(adaptAgentState)
}
export async function fetchSystemHealth(): Promise<SystemHealth> {
  const payload = await request<BackendHealth>('/health')
  if (!record(payload) || typeof payload.backend !== 'string' || typeof payload.database !== 'string' || typeof payload.vision !== 'string') invalid()
  return { edgeConnected: payload.backend === 'ready' && payload.database === 'ready', internetAvailable: true,
    cameraStatus: payload.vision === 'ready' ? 'OK' : 'NO_FEED', lastHeartbeat: new Date().toISOString() }
}
export async function updateDemoIncident(operation: 'acknowledge' | 'resolve', incidentId: string, revision: number): Promise<AgentState> {
  if (!session) throw new ApiRequestError('Upload an image to create a demo session first.')
  if (analysisRunning || mutationRunning) throw new ApiRequestError('An operation is already pending; wait for its result.')
  mutationRunning = true
  const value = session
  try {
    const body = operation === 'resolve' ? { incident_id: incidentId, revision, cabin_checked: true } : { incident_id: incidentId }
    const payload = await request<unknown>(`/api/v1/demo/sessions/${encodeURIComponent(value.id)}/${operation}`, sessionInit(value, { method: 'POST', body: JSON.stringify(body) }))
    validateState(payload)
    if (payload.vehicle_id !== `DEMO_${value.id}`) invalid()
    try { return await readSession(value) } catch { return { ...adaptBackendState(payload), decisionCurrent: false, dataAgeMs: 3001 } }
  } finally { mutationRunning = false }
}
