import { adaptAgentState, adaptBackendState, adaptDemoResponse } from './adapter'
import type { BackendCabinState, BackendDemoResponse, BackendHealth } from '../types/backend'
import type { AcknowledgementReason, AgentState, BackendCapabilities, DemoScenario, SimulationUpdate, SystemHealth } from '../types/agent'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
let activeVehicleId = import.meta.env.VITE_VEHICLE_ID || 'CAR_1'
const POLL_INTERVAL_MS = 1500
/** Kept as a compatibility export; runtime mock mode has been removed. */
export const USE_MOCKS = false
export const BACKEND_CAPABILITIES: BackendCapabilities = { manualEmergencyActions: false, acknowledgement: false, simulationControls: false, demoAnalysis: true }

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
async function parseResponse<T>(response: Response): Promise<T> {
  let payload: unknown
  try { payload = await response.json() } catch { payload = undefined }
  if (!response.ok) {
    const rawDetail = payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : undefined
    const detail = typeof rawDetail === 'string'
      ? rawDetail
      : Array.isArray(rawDetail)
        ? rawDetail.map((item) => item && typeof item === 'object' && 'msg' in item ? String(item.msg) : 'Invalid request').join('; ')
        : `Request failed (${response.status})`
    throw new ApiRequestError(detail, response.status, response.headers.get('Retry-After'))
  }
  return payload as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'omit' })
  return parseResponse<T>(response)
}

export function subscribeToAgentState(
  onState: (state: AgentState) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  let active = true
  let requestRunning = false
  const poll = async () => {
    if (!active || requestRunning) return
    requestRunning = true
    const vehicleId = activeVehicleId
    try {
      const payload = await request<BackendCabinState>(`/api/v1/state/${encodeURIComponent(vehicleId)}`)
      if (active && vehicleId === activeVehicleId) {
        onState(adaptBackendState(payload))
        onConnection(true)
      }
    } catch (error) {
      if (active && vehicleId === activeVehicleId) onConnection(error instanceof ApiRequestError && error.status === 404)
    } finally {
      requestRunning = false
    }
  }
  void poll()
  const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
  return () => { active = false; window.clearInterval(timer) }
}

export async function executeEmergencyActions(eventId: string): Promise<AgentState> {
  void eventId
  throw new ApiRequestError('The current backend executes actions during evaluation and does not expose a manual action endpoint.', 501)
}

export async function acknowledgeEvent(eventId: string, reason: AcknowledgementReason): Promise<AgentState> {
  void eventId
  throw new ApiRequestError(`Acknowledgement ${reason} is not supported by the current backend.`, 501)
}

export async function updateSimulation(update: SimulationUpdate): Promise<AgentState> {
  void update
  throw new ApiRequestError('JSON simulation controls are not supported; use the image demo endpoint.', 501)
}

export async function analyzeDemo(image: File, scenario: DemoScenario): Promise<AgentState> {
  const form = new FormData()
  form.append('image', image)
  form.append('scenario', scenario)
  const response = await request<BackendDemoResponse>('/api/v1/demo/analyze', { method: 'POST', body: form })
  const vehicleId = response.vehicle_state.vehicle_id
  const demoState = adaptDemoResponse(response)
  activeVehicleId = vehicleId
  try {
    const committed = await request<BackendCabinState>(`/api/v1/state/${encodeURIComponent(vehicleId)}`)
    return adaptBackendState(committed)
  } catch {
    // The synchronous response still contains the committed verdict if the follow-up read fails.
    return demoState
  }
}

export async function fetchEventHistory(): Promise<AgentState[]> {
  const payload = await request<BackendCabinState[]>(`/api/v1/events/${encodeURIComponent(activeVehicleId)}?limit=50`)
  return payload.filter((event) => typeof event.risk_level === 'string').map(adaptAgentState)
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const response = await fetch(`${API_BASE}/health`, { credentials: 'omit' })
  const payload = await response.json() as BackendHealth
  return {
    edgeConnected: payload.backend === 'ready' && payload.database === 'ready',
    internetAvailable: true,
    cameraStatus: payload.vision === 'ready' ? 'OK' : 'NO_FEED',
    lastHeartbeat: new Date().toISOString(),
  }
}
