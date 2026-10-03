import { CabinSentinelClient } from '@cabinsentinel/api-client'
import { getPortalAccessToken, type AuthMode } from '@cabinsentinel/auth'
import type { V1CabinState } from '@cabinsentinel/contracts'

export const vehicleId = import.meta.env.VITE_VEHICLE_ID || 'VF8-DEMO-01'
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin)
const authMode: AuthMode = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : import.meta.env.VITE_AUTH_MODE === 'v1-demo' || (import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'session') ? 'v1-demo' : 'session'
const api = new CabinSentinelClient({
  baseUrl: apiBaseUrl,
  credentials: authMode === 'mock' ? 'omit' : 'include',
  getAccessToken: () => getPortalAccessToken(apiBaseUrl, authMode),
})

function flattenState(state: Awaited<ReturnType<typeof api.v1VehicleState>>): V1CabinState {
  return {
    vehicle_id: state.vehicle_id,
    revision: state.risk?.revision ?? state.revision,
    previous_risk_level: state.risk?.previous_risk_level,
    incident_id: state.active_incident,
    risk_level: state.risk?.risk_level ?? state.risk_level ?? undefined,
    rule_id: state.risk?.rule_id ?? state.rule_id ?? undefined,
    reason: state.risk?.reason ?? state.explanation,
    temperature: state.sensors?.temperature_c ?? state.temperature_c,
    engine_status: state.sensors?.ignition?.toUpperCase(),
    doors_locked: state.sensors?.doors_locked ?? state.doors_locked,
    radar_presence: state.sensors?.radar_presence,
    camera_status: state.vision?.camera_status,
    detected_objects: state.vision?.detections,
    occupancy_state: state.risk?.occupancy_state ?? state.occupancy.state,
    action_results: state.actions,
    evaluated_at: state.timestamp ?? state.as_of,
    decision_current: state.risk?.decision_current ?? state.decision_current,
  }
}

export const client = {
  async v1State(id: string, signal?: AbortSignal) { return flattenState(await api.v1VehicleState(id, signal)) },
  async v1Events(id: string, limit = 50, signal?: AbortSignal) {
    const response = await api.v1VehicleEvents(id, limit, signal)
    return response.events.filter(event => event.event_type === 'evaluation')
  },
  health(signal?: AbortSignal) { return api.health(signal) },
  vehicles(signal?: AbortSignal) { return api.v1Vehicles(signal) },
}
