/**
 * Product-facing contracts. These mirror the proposed v2 resource model and
 * are deliberately kept separate from the permissive v1 demo adapter.
 * TODO(api-codegen): generate this package from a committed v2 OpenAPI schema.
 */
export type RiskLevel = 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'ERROR'
export type FreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN'
export type ConnectivityStatus = 'CONNECTED' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'
export type CameraStatus = 'OK' | 'BLOCKED' | 'ERROR' | 'DISCONNECTED' | 'NO_FEED' | 'UNKNOWN'
export type CommandStatus = 'requested' | 'authorized' | 'sent' | 'acknowledged' | 'failed' | 'expired'
export type Permission =
  | 'vehicle:view'
  | 'incident:acknowledge'
  | 'operations:view'
  | 'users:manage'
  | 'models:manage'
  | 'audit:view'

export interface Freshness {
  status: FreshnessStatus
  observedAt?: string
  ageSeconds?: number
}

export interface Evidence {
  id: string
  kind: 'occupancy' | 'sensor' | 'camera' | 'conflict' | 'redacted_media'
  label: string
  observedAt: string
  source: string
  summary: string
  privacySafe: boolean
}

export interface Decision {
  riskLevel: RiskLevel
  ruleId: string
  reason: string
  revision: number
  evaluatedAt: string
  decisionCurrent: boolean
  recommendedAction: string
  evidence: Evidence[]
}

export interface DeviceHealth {
  deviceId: string
  edge: ConnectivityStatus
  cloud: ConnectivityStatus
  camera: CameraStatus
  lastHeartbeatAt?: string
  modelVersion?: string
  ruleVersion?: string
}

export interface VehicleStatus {
  vehicleId: string
  decision: Decision
  temperatureC?: number
  occupancyLabel: string
  device: DeviceHealth
  activeIncidentId?: string
}

export interface Vehicle {
  id: string
  displayName: string
  registrationLabel?: string
  status?: VehicleStatus
}

export interface IncidentAction {
  id: string
  type: string
  status: CommandStatus
  requestedAt: string
  updatedAt: string
  message?: string
}

export interface IncidentRevision {
  revision: number
  evaluatedAt: string
  riskLevel: RiskLevel
  ruleId: string
  reason: string
}

export interface Acknowledgement {
  id: string
  incidentId: string
  userId: string
  reason: 'CABIN_CHECKED' | 'OCCUPANT_WITH_OWNER' | 'KEEP_ACTIVE'
  createdAt: string
}

export interface Incident {
  id: string
  vehicleId: string
  status: 'active' | 'acknowledged' | 'resolved'
  createdAt: string
  updatedAt: string
  decision: Decision
  revisions: IncidentRevision[]
  actions: IncidentAction[]
  acknowledgement?: Acknowledgement
}

export interface User {
  id: string
  displayName: string
  email: string
  roles: Array<'OWNER' | 'CAREGIVER' | 'OPERATOR' | 'ADMIN' | 'AUDITOR'>
  permissions: Permission[]
  vehicleIds: string[]
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
}

export interface ApiErrorEnvelope {
  code: string
  message: string
  correlationId?: string
  details?: unknown
}

export interface RealtimeEvent<T> {
  id: string
  type: 'vehicle.updated' | 'incident.updated' | 'device.updated'
  revision: number
  occurredAt: string
  data: T
}

/** Contracts exposed by the currently deployed V1 backend. */
export interface V1Detection {
  class?: string
  class_name?: string
  confidence?: number
  bbox?: [number, number, number, number]
}

export interface V1ActionResult {
  tool?: string
  status?: string
  error?: string
  request_id?: string
  expires_at?: string
}

export interface V1CabinState {
  vehicle_id?: string
  revision?: number
  previous_risk_level?: string | null
  incident_id?: string | null
  risk_level?: string
  rule_id?: string
  reason?: string
  temperature?: number | null
  engine_status?: string | null
  doors_locked?: boolean | null
  radar_presence?: boolean | null
  camera_status?: string | null
  detected_objects?: V1Detection[] | null
  occupancy_state?: string
  occupancy_reason_code?: string
  action_results?: V1ActionResult[]
  evaluated_at?: string
  decision_current?: boolean
  freshness?: {
    as_of?: string
    sensor?: { status?: FreshnessStatus; age_s?: number | null; observed_at?: string | null }
    vision?: { status?: FreshnessStatus; age_s?: number | null; observed_at?: string | null }
  }
}

export interface V1Health {
  status?: string
  backend?: string
  vision?: string
  database?: string
  mqtt?: string
}
