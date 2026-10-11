import { CabinSentinelClient } from '@cabinsentinel/api-client'
import { getPortalAccessToken, type AuthMode } from '@cabinsentinel/auth'
import type { V1FleetVehicleState } from '@cabinsentinel/contracts'
import { mockRepository } from './mockRepository'
import type { Incident, OwnerRepository, RiskLevel, VehicleSnapshot } from './model'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin)
const authMode: AuthMode = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : import.meta.env.VITE_AUTH_MODE === 'v1-demo' || (import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'session') ? 'v1-demo' : 'session'
const api = new CabinSentinelClient({
  baseUrl: apiBaseUrl,
  credentials: authMode === 'mock' ? 'omit' : 'include',
  getAccessToken: () => getPortalAccessToken(apiBaseUrl, authMode),
})
export const ownerPlatformClient = api
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
    doorsLocked: state.sensors?.doors_locked ?? state.doors_locked ?? null,
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

const v1Repository: OwnerRepository = {
  async listVehicles() {
    const list = await api.v1Vehicles()
    return Promise.all(list.vehicles.map(vehicle => api.v1VehicleState(vehicle.vehicle_id).then(toVehicle)))
  },
  async listIncidents() {
    const list = await api.v1Vehicles()
    const groups = await Promise.all(list.vehicles.map(async vehicle => {
      const response = await api.v1Incidents(vehicle.vehicle_id)
      const current = response.current && typeof response.current === 'object' ? response.current as Record<string, unknown> : undefined
      const history = Array.isArray(response.resolved_history) ? response.resolved_history : []
      const rows = [...(current ? [current] : []), ...history.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')]
      return rows.map((item, index): Incident => {
        const level = risk(typeof item.risk_level === 'string' ? item.risk_level : undefined)
        return {
          id: typeof item.incident_id === 'string' ? item.incident_id : `${vehicle.vehicle_id}-incident-${index}`,
          vehicleId: vehicle.vehicle_id,
          riskLevel: level,
          title: localized(typeof item.reason === 'string' ? item.reason : typeof item.rule_id === 'string' ? item.rule_id : 'Safety incident'),
          reason: localized(typeof item.reason === 'string' ? item.reason : 'Backend incident record'),
          ruleId: typeof item.rule_id === 'string' ? item.rule_id : 'INCIDENT_LIFECYCLE',
          status: item.status === 'RESOLVED' ? 'RESOLVED' : item.acknowledged_at ? 'MONITORING' : 'ACTIVE',
          occurredAt: typeof item.opened_at === 'string' ? item.opened_at : typeof item.ts === 'string' ? item.ts : new Date(0).toISOString(),
          temperatureC: typeof item.temperature === 'number' ? item.temperature : undefined,
          occupancy: occupancy(typeof item.occupancy_state === 'string' ? item.occupancy_state : undefined),
          revision: typeof item.revision === 'number' ? item.revision : undefined,
          acknowledgedAt: typeof item.acknowledged_at === 'string' ? item.acknowledged_at : undefined,
        }
      })
    }))
    return groups.flat().sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  },
  async getCabinTelemetry(vehicleId) {
    const response = await api.v1Telemetry(vehicleId, 30)
    const points = Array.isArray(response.points) ? response.points : []
    return points.flatMap(point => {
      if (!point || typeof point !== 'object') return []
      const item = point as Record<string, unknown>
      if (typeof item.ts !== 'string' || typeof item.temperature_c !== 'number') return []
      return [{
        recordedAt: item.ts,
        temperatureC: item.temperature_c,
        occupancyConfidence: typeof item.occupant_confidence === 'number' ? item.occupant_confidence : 0,
        signal: item.risk_level === 'ERROR' ? 'STALE' as const : Number(item.occupant_confidence || 0) > 0 ? 'OCCUPANCY' as const : 'NORMAL' as const,
      }]
    })
  },
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
      facesBlurredAtEdge: false,
      transport: 'NONE',
      detections: detections.map(item => `${item.class || item.class_name || 'OBJECT'}${item.age_group ? ` (${item.age_group})` : ''} ${Math.round((item.confidence || 0) * 100)}%`),
    }
  },
  async getNotificationSettings() {
    const settings = await api.v1NotificationSettings()
    const quiet = settings.quiet_hours && typeof settings.quiet_hours === 'object' ? settings.quiet_hours as Record<string, unknown> : {}
    const contacts = await api.v1EmergencyContacts()
    const contact = contacts.contacts[0] ?? {}
    return {
      push: settings.push === true,
      sms: settings.sms === true,
      email: settings.email === true,
      quietHours: quiet.enabled === true,
      emergencyContact: typeof contact.full_name === 'string' ? contact.full_name : '',
      emergencyPhone: typeof contact.phone === 'string' ? contact.phone : '',
    }
  },
}

export const ownerRepository = useV1Backend ? v1Repository : mockRepository
