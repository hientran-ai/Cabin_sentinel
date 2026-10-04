import { CabinSentinelClient } from '@cabinsentinel/api-client'
import { getPortalAccessToken, type AuthMode } from '@cabinsentinel/auth'
import type { V1FleetEvent, V1FleetVehicleState } from '@cabinsentinel/contracts'
import { mockRepository } from './mockRepository'
import type { Incident, OwnerRepository, RiskLevel, VehicleSnapshot } from './model'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin)
const authMode: AuthMode = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : import.meta.env.VITE_AUTH_MODE === 'v1-demo' || (import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'session') ? 'v1-demo' : 'session'
const api = new CabinSentinelClient({
  baseUrl: apiBaseUrl,
  credentials: authMode === 'mock' ? 'omit' : 'include',
  getAccessToken: () => getPortalAccessToken(apiBaseUrl, authMode),
})
const useV1Backend = authMode !== 'mock'

function risk(value?: string | null): RiskLevel { return ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR'].includes(value || '') ? value as RiskLevel : 'ERROR' }
function occupancy(value?: string | null): VehicleSnapshot['occupancy'] { return ['PRESENT', 'SUSPECTED', 'ABSENT', 'UNKNOWN'].includes(value || '') ? value as VehicleSnapshot['occupancy'] : 'UNKNOWN' }
function localized(value: string) { return { vi: value, en: value } }
function recommendation(level: RiskLevel) {
  if (level === 'CRITICAL') return localized('Return to the vehicle and check the cabin immediately.')
  if (level === 'WARNING' || level === 'ERROR') return localized('Check the cabin directly; do not assume it is safe.')
  return localized('Continue monitoring the cabin.')
}

function toVehicle(state: V1FleetVehicleState): VehicleSnapshot {
  const level = risk(state.risk?.risk_level ?? state.risk_level)
  return {
    id: state.vehicle_id,
    name: state.vehicle_name,
    plate: state.plate || '—',
    model: state.model || 'CabinSentinel vehicle',
    riskLevel: level,
    reason: localized(state.explanation || 'No current sensor or camera data. Safety cannot be verified.'),
    recommendation: recommendation(level),
    ruleId: state.risk?.rule_id || state.rule_id || 'DATA_UNAVAILABLE',
    revision: state.risk?.revision ?? state.revision,
    temperatureC: state.sensors?.temperature_c ?? state.temperature_c ?? undefined,
    occupancy: occupancy(state.risk?.occupancy_state ?? state.occupancy.state),
    camera: state.vision?.camera_status === 'OK' ? 'OK' : state.vision?.camera_status === 'BLOCKED' ? 'BLOCKED' : 'NO_FEED',
    edge: state.online ? 'CONNECTED' : 'OFFLINE',
    cloud: state.online ? 'CONNECTED' : 'OFFLINE',
    engine: state.sensors?.ignition === 'on' ? 'ON' : state.sensors?.ignition === 'off' ? 'OFF' : 'UNKNOWN',
    doorsLocked: state.sensors?.doors_locked ?? state.doors_locked ?? false,
    decisionCurrent: state.risk?.decision_current ?? state.decision_current,
    updatedAt: state.timestamp || state.last_seen || state.as_of,
    activeIncidentId: state.active_incident || undefined,
    actions: state.actions.map((action, index) => ({
      id: action.request_id || `${state.vehicle_id}-${index}`,
      label: localized(action.tool || 'Backend action'),
      status: action.status === 'pending_human_confirmation' ? 'PENDING' : action.status === 'failed' ? 'FAILED' : action.status === 'confirmed' ? 'CONFIRMED' : 'SIMULATED',
      detail: localized(action.error || action.status || 'Recorded by backend'),
    })),
  }
}

function toIncident(vehicleId: string, event: V1FleetEvent): Incident {
  const level = risk(event.risk_level)
  return {
    id: event.incident_id || `EV-${event.event_id}`,
    vehicleId,
    riskLevel: level,
    title: localized(event.reason || event.rule_id || 'Safety evaluation'),
    reason: localized(event.reason || 'Backend safety evaluation'),
    ruleId: event.rule_id || 'UNMAPPED',
    status: level === 'CRITICAL' ? 'ACTIVE' : level === 'WARNING' || level === 'ERROR' ? 'MONITORING' : 'RESOLVED',
    occurredAt: event.evaluated_at || event.timestamp || new Date().toISOString(),
    temperatureC: event.temperature ?? undefined,
    occupancy: occupancy(event.occupancy_state),
  }
}

const v1Repository: OwnerRepository = {
  async listVehicles() {
    const list = await api.v1Vehicles()
    return Promise.all(list.vehicles.map(vehicle => api.v1VehicleState(vehicle.vehicle_id).then(toVehicle)))
  },
  async listIncidents() {
    const list = await api.v1Vehicles()
    const groups = await Promise.all(list.vehicles.map(async vehicle => {
      const response = await api.v1VehicleEvents(vehicle.vehicle_id, 100)
      return response.events.filter(event => event.event_type === 'evaluation').map(event => toIncident(vehicle.vehicle_id, event))
    }))
    return groups.flat().sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  },
  // V1 has no history/settings resources yet; keep these UI adapters until backend support lands.
  getCabinTelemetry: vehicleId => mockRepository.getCabinTelemetry(vehicleId),
  async getCabinRealtimeState(vehicleId) {
    const state = await api.v1VehicleState(vehicleId)
    const detections = state.vision?.detections || []
    return {
      feedState: state.vision?.status === 'FRESH' ? 'LIVE' : 'NO_FEED',
      modelState: state.vision?.status === 'FRESH' ? 'RUNNING' : 'UNAVAILABLE',
      modelName: 'CabinSentinel Vision V1',
      inferenceAt: state.vision?.observed_at || state.as_of,
      latencyMs: state.risk?.reasoning_latency_ms,
      occupantConfidence: Math.max(0, ...detections.map(item => item.confidence || 0)),
      facesBlurredAtEdge: true,
      transport: 'NONE',
      detections: detections.map(item => `${item.class || item.class_name || 'OBJECT'} ${Math.round((item.confidence || 0) * 100)}%`),
    }
  },
  getNotificationSettings: () => mockRepository.getNotificationSettings(),
}

export const ownerRepository = useV1Backend ? v1Repository : mockRepository
