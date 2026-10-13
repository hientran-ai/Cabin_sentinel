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
  age_group?: 'adult' | 'child' | 'unknown' | null
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

/** Development authentication and fleet contracts exposed by the current V1 backend. */
export type V1DemoRole = 'owner' | 'admin'

export interface V1DemoLoginResponse {
  access_token: string
  role: V1DemoRole
  subject: string
  expires_at: string
  owners: string[]
}

export type V1AccountRole = 'admin' | 'operator' | 'owner' | 'caregiver'

export interface V1PlatformUser {
  user_id: string
  tenant_id: string | null
  email: string
  full_name: string
  phone: string | null
  language: 'vi' | 'en'
  role: V1AccountRole
  active: boolean
  last_login_at: string | null
  created_at: string
}

export interface V1SessionResponse {
  user: V1PlatformUser
  access_token: string
  token_type: 'bearer'
  expires_at: string
  refresh_expires_at: string
  csrf_token?: string
  refresh_token?: string
}

export interface V1Me {
  role: V1AccountRole | 'guardian' | 'device'
  subject: string
  trip_id: string | null
  vehicle_ids: string[]
}

export interface V1VehicleSummary {
  vehicle_id: string
  vehicle_name: string
  plate: string | null
  model: string | null
  data_source: string
  online: boolean
  last_seen: string | null
  risk_level: string | null
  decision_current: boolean
  rule_id: string | null
  occupancy: { state: string; counts: Record<string, number> }
  temperature_c: number | null
  doors_locked: boolean | null
  alert_count: number
  active_incident: string | null
  revision: number
}

export interface V1VehicleList {
  as_of: string
  role: V1DemoRole
  vehicles: V1VehicleSummary[]
}

export interface V1FleetVehicleState extends V1VehicleSummary {
  timestamp: string | null
  as_of: string
  sensors: null | {
    temperature_c?: number | null
    doors_locked?: boolean | null
    door?: 'locked' | 'unlocked' | null
    radar_presence?: boolean | null
    ignition?: 'on' | 'off' | 'unknown'
    hvac?: string | null
    window?: string | null
    sequence?: number | null
    status?: FreshnessStatus
    age_s?: number | null
    observed_at?: string | null
  }
  vision: null | {
    camera_status?: string | null
    detections?: V1Detection[]
    status?: FreshnessStatus
    age_s?: number | null
    observed_at?: string | null
  }
  risk: null | {
    risk_level?: string
    previous_risk_level?: string | null
    rule_id?: string
    reason?: string
    occupancy_state?: string
    occupancy_reason_code?: string
    revision?: number
    decision_current?: boolean
    ruleset_version?: string
    evidence_conflicts?: unknown[]
    reasoning_latency_ms?: number
  }
  explanation: string
  incident: Record<string, unknown> | null
  alert: Record<string, unknown> | null
  unlock_request: Record<string, unknown> | null
  actions: V1ActionResult[]
  action_ledger: V1ActionResult[]
  data_quality: { status?: string; issues?: string[] } | null
}

export interface V1FleetEvent extends V1CabinState {
  event_id: number
  event_type: string
  timestamp?: string
}

export interface V1VehicleEvents {
  vehicle_id: string
  events: V1FleetEvent[]
}

/** Demo studio (GET /api/v1/admin/demo/status). Every value it produces is labelled SIMULATED by the backend. */
export type V1DemoScenarioId = 'SAFE' | 'WARNING' | 'CRITICAL' | 'RAMP' | 'VIDEO' | 'OFFLINE'

export interface V1DemoScenario { id: V1DemoScenarioId; label: string; description: string }

export interface V1DemoVehicle {
  vehicle_id: string
  name: string
  scenario: V1DemoScenarioId
  risk_level: string
  online: boolean
  temperature_c: number | null
  active_incident: string | null
  data_source: string
  /** Set while a recorded video is this vehicle's camera (camera simulator). */
  video?: { sample: string | null; frames: number } | null
}

/** Cabin zones fitted per vehicle at installation. Boxes are normalised x1, y1, x2, y2. */
export interface V1CabinZone {
  name: string
  kind: 'seat' | 'exclude'
  box: [number, number, number, number]
  /** Seats only, declared at installation. A rear-facing child seat can never be verified empty by the camera. */
  child_seat?: 'rear_facing' | 'forward_facing' | null
  /** Seats only: also detect on an enlarged crop of this seat. */
  detail?: boolean
}
export interface V1CabinCalibration { vehicle_id: string; zones: V1CabinZone[]; version: number; updated_by: string; updated_at: string }

export interface V1VideoStart { vehicle_id: string; temperature: number; sample?: string | null; zones?: V1CabinZone[] }

/** One simulated camera frame after detection, zones, per-seat smoothing and the rules (POST /api/v1/admin/demo/video/frame). */
export interface V1VideoFrameResult {
  label: 'SIMULATED'
  vehicle_id: string
  sequence: number
  camera_status: 'OK' | 'BLOCKED' | 'ERROR'
  frame: { width: number; height: number }
  detections: Array<{ class: string; confidence: number; bbox: [number, number, number, number] | null; zone: string | null; counted: boolean; detail?: boolean }>
  seats: Record<string, {
    state: 'OCCUPIED' | 'SEAT_CHANGED' | 'REAR_FACING_UNVERIFIABLE' | 'EMPTY_VERIFIED' | 'PENDING_EMPTY' | 'CANDIDATE' | 'NO_HIT'
    label: string | null
    confidence: number | null
    reference_similarity: number | null
    child_seat: 'rear_facing' | 'forward_facing' | null
    releases_in_s: number | null
  }>
  reference: { confirmed_by: string; confirmed_at: string; source: 'sample' | 'frame' } | null
  evidence: Array<{ detection_id: string; class_name: string; confidence: number }>
  risk_level: string | null
  rule_id: string | null
  reason: string | null
  occupancy_state: string | null
  active_incident: string | null
  timing: { inference_ms: number | null; rules_ms: number; server_ms: number }
  /** "queued" when this frame became the incident's opt-in alert photo (pixelated) on Telegram. */
  alert_photo?: 'queued' | null
}

export interface V1AlertPhotoPref { vehicle_id: string; enabled: boolean; changed_by: string | null; changed_at: string | null }

export interface V1DemoNotification { at: string; channel: string; ok: boolean; detail: string }

export interface V1DemoStatus {
  enabled: boolean
  label: 'SIMULATED'
  scenarios: V1DemoScenario[]
  vehicles: V1DemoVehicle[]
  notifications: { ntfy: boolean; telegram: boolean; recent: V1DemoNotification[] }
  last_error: string | null
}

/** Device channel (per-device token scoped to one vehicle). */
export interface V1DevicePairing { device_id: string; vehicle_id: string; device_token: string }
export interface V1DeviceHeartbeat { firmware?: string; battery_pct?: number; rssi_dbm?: number; status?: 'OK' | 'DEGRADED' | 'ERROR' }
export interface V1DeviceCommand { command_id: string; vehicle_id: string; type: 'horn' | 'sms' | 'unlock'; status: string; incident_id?: string | null }
