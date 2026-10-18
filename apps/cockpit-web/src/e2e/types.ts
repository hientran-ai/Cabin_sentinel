// Shapes of the committed read model returned by /api/v1/e2e. Everything risk-related is produced by the
// backend (CabinService); the UI only formats it. Field names follow the backend contract verbatim.
export type RiskLevel = 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'ERROR'
export type SourceStatus = 'FRESH' | 'STALE' | 'UNKNOWN'
export interface SourceAge { status: SourceStatus; age_s: number | null; observed_at: string | null }

export interface Incident {
  incident_id: string; status: 'OPEN' | 'RESOLVED'; opened_at: string; acknowledged_at: string | null
  resolved_at: string | null; resolution?: string
}
export interface ActionResult { tool: string; status: string; revision?: number; incident_id?: string | null; request_id?: string; expires_at?: string; parameters?: Record<string, unknown> }
export interface Detection { class: string; confidence: number; bbox?: number[] | null; age_group?: string | null }
export interface ModelInfo { ready: boolean; file?: string; sha256?: string; size_bytes?: number; ultralytics_version?: string; framework?: string; runtime?: string; classes_used?: string[]; confidence_threshold?: number; age_classifier?: string
  /** Reserved: true only when the server really exposes a forgotten-item tracking channel. No such field exists today. */
  items_tracking?: boolean; item_classes?: string[] }

export interface ObservationEvent {
  event_id: number; event_type: 'observation' | 'camera_status'; frame_id: string; accepted: boolean
  source?: string; source_label?: string; observed_at: string; received_at: string; capture_age_ms?: number
  vision?: { source: string; exterior_count?: number; detections: Detection[]; items?: Detection[]; age_classifier?: { status: string } }
  media_time_s?: number | null
  timings_ms?: Record<string, number>; model?: { file?: string; sha256?: string; ultralytics_version?: string }
  camera_status?: string; origin?: string; reason?: string
}

export interface ServerState {
  vehicle_id: string; session_id: string; revision: number
  risk_level: RiskLevel; previous_risk_level: RiskLevel | null; rule_id: string; reason: string
  occupancy_state: 'PRESENT' | 'SUSPECTED' | 'ABSENT' | 'UNKNOWN'; occupancy_reason_code: string
  evidence_conflicts: { type: string }[]
  incident_id: string | null; incident: Incident | null
  alert: { stage: string; sequence: number; initial_sent_at: string; delivery_mode: string; lock_timing?: { status: string; latency_s: number | null } } | null
  data_quality: { status: 'CURRENT' | 'STALE' | 'UNKNOWN'; issues: string[] } | null
  decision_current: boolean; evaluated_at: string; camera_status: string | null
  sensor_snapshot: Record<string, unknown> | null
  detected_objects: { class_name: string; confidence: number }[] | null
  action_results: ActionResult[]
  action_ledger: { action_key: string; incident_id: string | null; tool: string; status: string; outcome: string; revision: number }[]
  unlock_request: { request_id: string; status: string; expires_at: string } | null
  freshness: { as_of: string; sensor: SourceAge; vision: SourceAge }
  simulation: { vehicle_source: string; action_mode: string; vision_source: string; runtime: string }
  ttl_s: { sensor: number; vision: number }; server_time: string
  connectivity?: Connectivity
  last_observation: ObservationEvent | null; model: ModelInfo
  care?: CareView
  items?: { source: string; telemetry_source: string; identity_tracking: false; reminders: ItemReminder[] }
}
export interface ItemReminder { id: string; class: string; status: 'OPEN' | 'TAKEN' | 'SNOOZED'; evidence_frames: string[]; snoozed_until?: string; simulated: true; not_emergency: true }

export type CareProfile = 'CHILD' | 'ADULT' | 'PET' | 'UNKNOWN'
export interface CareStep { tool: string; status?: string; skipped?: string; parameters?: Record<string, unknown> }
/** Cabin Care as committed by the backend. It never carries a risk level: comfort is a bridge, not a resolution. */
export interface CareView {
  status: 'IDLE' | 'ACTIVE' | 'ENDED'; profile: CareProfile; incident_id: string | null; auto_consent: boolean
  responded_at: string | null; started_by: string | null; started_at: string | null; music: string | null
  ended_at: string | null; ended_by: string | null; end_reason: string | null; plan: CareStep[]
  simulated: true; can_start: boolean; occupancy_evidence: boolean; target_c: number; never_resolves_incident: true
  countdown: { armed: boolean; remaining_s: number | null; after_s: number }
  suggestion: { kind: 'ASK' | CareProfile; text: string } | null; notes: string[]
}

export interface NotificationItem {
  notification_id: number; incident_id: string | null; stage: string; sequence: number; revision: number; sent_at: string
  delivery_mode: string; risk_level: RiskLevel | null; rule_id: string | null; reason: string | null
  channels: {
    in_app_feed: { state: 'PUBLISHED' | 'IN_APP_DELIVERED'; delivered_at: string | null }
    push: { state: 'PLANNED' | 'NOT_PLANNED' | 'SIMULATED' | 'FAILED' | 'UNKNOWN'; provider_accepted: boolean; os_delivery: string }
  }
}

export interface HistoryItem { event_id: number; type: string; at: string | null; [k: string]: unknown }

export interface ServiceStatus {
  mode: string; model: ModelInfo; ttl_s: { sensor: number; vision: number }; database: string
  push_os: string; oem: string; upload_limit_bytes: number
}

export interface SensorInput {
  trip_ended?: boolean
  temperature: number; engine_status: 'ON' | 'OFF' | 'UNKNOWN'; doors_locked: boolean; radar_presence: boolean
  driver_present: boolean | null; gear: 'P' | 'R' | 'N' | 'D' | 'UNKNOWN'; vehicle_speed_kph: number | null
  hvac_status: 'ACTIVE' | 'INACTIVE' | 'FAULT' | 'UNKNOWN'; window_status: 'CLOSED' | 'VENTED' | 'OPEN' | 'UNKNOWN'
  powertrain_type: 'EV' | 'ICE' | 'UNKNOWN'; operation_mode: 'NONE' | 'PET' | 'CAMP' | 'REMOTE_START' | 'UNKNOWN'
  battery_soc_pct: number | null
}

export interface ObservationReply {
  frame_id: string; accepted: boolean; replayed: boolean; ignored_reason: string | null
  observed_at: string; received_at: string; capture_age_ms: number
  vision: { detections: Detection[] }; timings_ms: Record<string, number>; committed: { revision: number; risk_level: RiskLevel } | null
  /** face-masked picture of THIS frame, returned once and never stored by the backend. Absent when the model has no masker. */
  preview?: { status: 'PROCESSED' | 'UNAVAILABLE'; data_url: string | null; method?: string; detected_faces?: number; masked_regions?: number; fallback_regions?: number; coverage_verified?: false }
}

/** State of the (simulated) vehicle edge link of this session, owned by the backend. Not the browser connection, not camera health. */
export interface Connectivity {
  state: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'SYNCING'; link: 'UP' | 'DROPPED'; simulated: true; reason: string
  dropped_at: string | null; restored_at: string | null; last_vehicle_message_at: string | null; changed_at: string | null
  disconnect_after_s: number; drops: number; note: string; incidents_unchanged: true
}
