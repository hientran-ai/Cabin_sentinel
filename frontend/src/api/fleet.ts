import { ApiRequestError, request } from './client'
import type { RiskState } from '../types/agent'

// Owner/admin/guardian access tokens are memory-only: never in URLs, storage, logs or Vite env.
export type Role = 'owner' | 'admin'
export interface Access { token: string; role: Role; subject: string; expiresAt: string; owners: string[] }
export type DisplayRisk = RiskState | 'UNKNOWN'

export interface VehicleSummary {
  vehicle_id: string; vehicle_name: string; plate?: string | null; model?: string | null; data_source: string
  online: boolean; last_seen: string | null; risk_level: RiskState | null; decision_current: boolean; rule_id: string | null
  revision: number; occupancy: { state: string | null; counts: Record<string, number> }
  temperature_c: number | null; doors_locked: boolean | null; alert_count: number; active_incident: string | null
}
export interface SourceFreshness { status: 'FRESH' | 'STALE' | 'UNKNOWN'; age_s: number | null; observed_at: string | null }
export interface VehicleState extends VehicleSummary {
  timestamp: string | null; as_of: string; explanation: string
  sensors: (SourceFreshness & { temperature_c: number | null; doors_locked: boolean | null; door: string | null; radar_presence: boolean | null; ignition: string; hvac?: string | null; sequence?: number }) | null
  vision: (SourceFreshness & { camera_status: string | null; detections: Array<{ class: string; confidence: number }> }) | null
  risk: { risk_level: RiskState; rule_id: string; reason: string; occupancy_state: string; revision: number; decision_current: boolean } | null
  incident: { incident_id: string; status: string; opened_at?: string; acknowledged_at?: string | null } | null
  unlock_request: { request_id: string; status: string; incident_id?: string; expires_at?: string } | null
  actions: Array<Record<string, unknown>>
  data_quality: { status: string; issues: string[] } | null
}
export interface VehicleEvent { event_id: number; event_type: string; revision?: number; risk_level?: string; rule_id?: string; tool?: string; status?: string; event?: string; evaluated_at?: string; recorded_at?: string; sent_at?: string; attempted_at?: string; created_at?: string; stage?: string }
export interface Trip { trip_id: string; vehicle_id: string; label: string; created_at: string; guardian_token: string }

const RISKS = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function invalid(): never { throw new ApiRequestError('Invalid backend response — no current safety decision is available.') }
const auth = (access: Pick<Access, 'token'>, init?: RequestInit): RequestInit => ({ ...init, headers: { ...init?.headers, Authorization: `Bearer ${access.token}` } })

/** Backend verdicts are shown only while current; anything else is UNKNOWN, never SAFE. */
export function displayRisk(risk: RiskState | null | undefined, current: boolean, connected = true): DisplayRisk {
  return risk && current && connected ? risk : 'UNKNOWN'
}

function validateSummary(value: unknown): asserts value is VehicleSummary {
  if (!record(value) || typeof value.vehicle_id !== 'string' || typeof value.vehicle_name !== 'string' || typeof value.online !== 'boolean' ||
    typeof value.decision_current !== 'boolean' || !(value.risk_level === null || RISKS.includes(String(value.risk_level))) ||
    typeof value.alert_count !== 'number' || !record(value.occupancy)) invalid()
}

export async function demoLogin(role: Role, subject?: string): Promise<Access> {
  const payload = await request<unknown>('/api/v1/auth/demo-login', { method: 'POST', body: JSON.stringify({ role, ...(subject ? { subject } : {}) }) })
  if (!record(payload) || typeof payload.access_token !== 'string' || payload.role !== role || typeof payload.subject !== 'string' || !Array.isArray(payload.owners)) invalid()
  return { token: payload.access_token, role, subject: payload.subject, expiresAt: String(payload.expires_at), owners: payload.owners.map(String) }
}

export async function listVehicles(access: Access): Promise<VehicleSummary[]> {
  const payload = await request<unknown>('/api/v1/vehicles', auth(access))
  if (!record(payload) || !Array.isArray(payload.vehicles)) invalid()
  payload.vehicles.forEach(validateSummary)
  return payload.vehicles as VehicleSummary[]
}

export async function getVehicleState(access: Access, vehicleId: string): Promise<VehicleState> {
  const payload = await request<unknown>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/state`, auth(access))
  validateSummary(payload)
  // A response for another vehicle is never shown under this vehicle's heading.
  if (payload.vehicle_id !== vehicleId || typeof (payload as unknown as VehicleState).explanation !== 'string') invalid()
  const risk = (payload as unknown as VehicleState).risk
  if (risk !== null && (!record(risk) || !RISKS.includes(String(risk.risk_level)) || typeof risk.decision_current !== 'boolean')) invalid()
  if (!Array.isArray((payload as unknown as VehicleState).actions)) invalid()
  return payload as unknown as VehicleState
}

export async function getVehicleEvents(access: Access, vehicleId: string, limit = 30): Promise<VehicleEvent[]> {
  const payload = await request<unknown>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/events?limit=${limit}`, auth(access))
  if (!record(payload) || payload.vehicle_id !== vehicleId || !Array.isArray(payload.events) || !payload.events.every(record)) invalid()
  return payload.events as unknown as VehicleEvent[]
}

export async function createTrip(access: Access, vehicleId: string, label: string): Promise<Trip> {
  const payload = await request<unknown>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/trips`, auth(access, { method: 'POST', body: JSON.stringify({ label }) }))
  if (!record(payload) || typeof payload.trip_id !== 'string' || payload.vehicle_id !== vehicleId || typeof payload.guardian_token !== 'string') invalid()
  return payload as unknown as Trip
}

export async function recordTripEvent(access: Access, tripId: string, event: 'entered_vehicle' | 'exited_vehicle', idempotencyKey: string): Promise<{ result: string; event: string }> {
  const payload = await request<unknown>(`/api/v1/trips/${encodeURIComponent(tripId)}/events`, auth(access, { method: 'POST', body: JSON.stringify({ event, idempotency_key: idempotencyKey }) }))
  if (!record(payload) || payload.trip_id !== tripId || typeof payload.result !== 'string') invalid()
  return payload as { result: string; event: string }
}
