import { adaptAgentState, adaptBackendState, adaptDemoResponse } from './adapter'
import { cloneScenario, mockHealth, mockHistory } from '../mocks/scenarios'
import type { BackendCabinState, BackendDemoResponse, BackendHealth } from '../types/backend'
import type { AcknowledgementReason, AgentState, BackendCapabilities, DemoScenario, RiskState, SimulationUpdate, SystemHealth } from '../types/agent'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
let activeVehicleId = import.meta.env.VITE_VEHICLE_ID || 'CAR_1'
const POLL_INTERVAL_MS = 1500
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'
export const BACKEND_CAPABILITIES: BackendCapabilities = USE_MOCKS
  ? { manualEmergencyActions: true, acknowledgement: true, simulationControls: true, demoAnalysis: false }
  : { manualEmergencyActions: false, acknowledgement: false, simulationControls: false, demoAnalysis: true }

let mockCurrent = cloneScenario('SAFE')

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
  if (USE_MOCKS) {
    onConnection(true)
    onState(structuredClone(mockCurrent))
    return () => undefined
  }

  let active = true
  let requestRunning = false
  const poll = async () => {
    if (!active || requestRunning) return
    requestRunning = true
    try {
      const payload = await request<BackendCabinState>(`/api/v1/state/${encodeURIComponent(activeVehicleId)}`)
      if (active) {
        onState(adaptBackendState(payload))
        onConnection(true)
      }
    } catch (error) {
      if (active) onConnection(error instanceof ApiRequestError && error.status === 404)
    } finally {
      requestRunning = false
    }
  }
  void poll()
  const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
  return () => { active = false; window.clearInterval(timer) }
}

export async function executeEmergencyActions(eventId: string): Promise<AgentState> {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      ...cloneScenario('CRITICAL'), eventId,
      toolResults: [
        { action: 'TRIGGER_HORN', status: 'SUCCESS', message: 'Horn activated', latencyMs: 318 },
        { action: 'CRACK_WINDOW', status: 'SUCCESS', message: 'Windows opened 4 cm', latencyMs: 482 },
        { action: 'SEND_SMS', status: 'SUCCESS', message: 'Emergency contacts notified', latencyMs: 613 },
      ],
    }
  }
  throw new ApiRequestError('The current backend executes actions during evaluation and does not expose a manual action endpoint.', 501)
}

export async function acknowledgeEvent(eventId: string, reason: AcknowledgementReason): Promise<AgentState> {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return { ...cloneScenario('CRITICAL'), eventId, acknowledgementStatus: 'ACKNOWLEDGED' }
  }
  throw new ApiRequestError(`Acknowledgement ${reason} is not supported by the current backend.`, 501)
}

export async function updateSimulation(update: SimulationUpdate): Promise<AgentState> {
  if (USE_MOCKS) {
    if (update.scenario) mockCurrent = cloneScenario(update.scenario)
    const { temperatureC, engine, doorsLocked } = update
    mockCurrent = {
      ...mockCurrent, timestamp: new Date().toISOString(), dataAgeMs: 0,
      sensors: {
        temperatureC: temperatureC ?? mockCurrent.sensors.temperatureC,
        engine: engine ?? mockCurrent.sensors.engine,
        doorsLocked: doorsLocked ?? mockCurrent.sensors.doorsLocked,
      },
    }
    return structuredClone(mockCurrent)
  }
  throw new ApiRequestError('JSON simulation controls are not supported; use the image demo endpoint.', 501)
}

export async function analyzeDemo(image: File, scenario: DemoScenario): Promise<AgentState> {
  if (USE_MOCKS) throw new ApiRequestError('Image analysis is available only in backend mode.', 400)
  const form = new FormData()
  form.append('image', image)
  form.append('scenario', scenario)
  const response = await request<BackendDemoResponse>('/api/v1/demo/analyze', { method: 'POST', body: form })
  activeVehicleId = response.vehicle_state.vehicle_id
  return adaptDemoResponse(response)
}

export async function fetchEventHistory(): Promise<AgentState[]> {
  if (USE_MOCKS) return structuredClone(mockHistory)
  const payload = await request<BackendCabinState[]>(`/api/v1/events/${encodeURIComponent(activeVehicleId)}?limit=50`)
  return payload.filter((event) => typeof event.risk_level === 'string').map(adaptAgentState)
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  if (USE_MOCKS) return structuredClone(mockHealth)
  const response = await fetch(`${API_BASE}/health`, { credentials: 'omit' })
  const payload = await response.json() as BackendHealth
  return {
    edgeConnected: payload.backend === 'ready' && payload.database === 'ready',
    internetAvailable: true,
    cameraStatus: payload.vision === 'ready' ? 'OK' : 'NO_FEED',
    lastHeartbeat: new Date().toISOString(),
  }
}

export function scenarioFor(state: RiskState): AgentState {
  return cloneScenario(state)
}
