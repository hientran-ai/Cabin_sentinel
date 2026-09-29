import { adaptAgentState } from './adapter'
import { cloneScenario, mockHealth, mockHistory } from '../mocks/scenarios'
import type { AcknowledgementReason, AgentState, RiskState, SimulationUpdate, SystemHealth } from '../types/agent'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const STREAM_URL = import.meta.env.VITE_EVENT_STREAM_URL || `${API_BASE}/api/v1/events/stream`
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
let mockCurrent = cloneScenario('SAFE')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json() as Promise<T>
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
  const source = new EventSource(STREAM_URL)
  source.onopen = () => onConnection(true)
  source.onerror = () => onConnection(false)
  source.onmessage = (event) => {
    try {
      onState(adaptAgentState(JSON.parse(event.data) as unknown))
    } catch {
      // Keep the last known state visible and surface the stream as unhealthy.
      onConnection(false)
    }
  }
  return () => source.close()
}

export async function executeEmergencyActions(eventId: string): Promise<AgentState> {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      ...cloneScenario('CRITICAL'),
      eventId,
      toolResults: [
        { action: 'TRIGGER_HORN', status: 'SUCCESS', message: 'Horn activated', latencyMs: 318 },
        { action: 'CRACK_WINDOW', status: 'SUCCESS', message: 'Windows opened 4 cm', latencyMs: 482 },
        { action: 'SEND_SMS', status: 'SUCCESS', message: 'Emergency contacts notified', latencyMs: 613 },
      ],
    }
  }
  return adaptAgentState(await request(`/api/v1/events/${eventId}/actions`, { method: 'POST' }))
}

export async function acknowledgeEvent(eventId: string, reason: AcknowledgementReason): Promise<AgentState> {
  if (USE_MOCKS) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const state = cloneScenario('CRITICAL')
    return { ...state, eventId, acknowledgementStatus: 'ACKNOWLEDGED' }
  }
  return adaptAgentState(await request(`/api/v1/events/${eventId}/acknowledge`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }))
}

export async function updateSimulation(update: SimulationUpdate): Promise<AgentState> {
  if (USE_MOCKS) {
    if (update.scenario) mockCurrent = cloneScenario(update.scenario)
    const { temperatureC, engine, doorsLocked } = update
    mockCurrent = {
      ...mockCurrent,
      timestamp: new Date().toISOString(),
      dataAgeMs: 0,
      sensors: {
        temperatureC: temperatureC ?? mockCurrent.sensors.temperatureC,
        engine: engine ?? mockCurrent.sensors.engine,
        doorsLocked: doorsLocked ?? mockCurrent.sensors.doorsLocked,
      },
    }
    return structuredClone(mockCurrent)
  }
  return adaptAgentState(await request('/api/v1/simulation', { method: 'POST', body: JSON.stringify(update) }))
}

export async function fetchEventHistory(): Promise<AgentState[]> {
  if (USE_MOCKS) return structuredClone(mockHistory)
  const payload = await request<unknown[]>('/api/v1/events')
  return payload.map(adaptAgentState)
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  if (USE_MOCKS) return structuredClone(mockHealth)
  return request<SystemHealth>('/api/v1/system/health')
}

export function scenarioFor(state: RiskState): AgentState {
  return cloneScenario(state)
}
