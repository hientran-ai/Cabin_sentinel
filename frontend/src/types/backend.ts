export interface BackendFreshnessSource {
  status?: 'FRESH' | 'STALE' | 'UNKNOWN'
  age_s?: number | null
  observed_at?: string | null
}

export interface BackendActionResult {
  tool?: string
  status?: string
  error?: string
  request_id?: string
  expires_at?: string
}

export interface BackendDetection {
  class?: string
  class_name?: string
  confidence?: number
  bbox?: [number, number, number, number]
}

export interface BackendSeatEvidence {
  evidence_id?: string
  child_seat_present?: boolean | null
  seat_orientation?: string
  orientation_confidence?: number | null
  seat_position?: string | null
  observed_at?: string
  source?: string
  model_version?: string | null
  quality?: string
  seat_detection_id?: string | null
  related_occupant_detection_id?: string | null
}

export interface BackendEvidenceConflict {
  type?: string
  skew_s?: number
  seat_detection_id?: string
  sensor?: { radar_presence?: boolean; observed_at?: string }
  vision?: { detected_objects?: BackendDetection[]; observed_at?: string }
  seat_evidence?: BackendSeatEvidence[]
  previous?: { observed_at?: string; detected_objects?: BackendDetection[] }
  current?: { observed_at?: string; detected_objects?: BackendDetection[] }
}

export interface BackendUnlockRequest {
  request_id?: string
  incident_id?: string | null
  created_at?: string
  expires_at?: string
  status?: string
}

export interface BackendCabinState {
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
  detected_objects?: BackendDetection[] | null
  occupancy_state?: string
  occupancy_reason_code?: string
  evidence_conflicts?: BackendEvidenceConflict[]
  seat_configuration_state?: string
  seat_evidence?: BackendSeatEvidence[]
  reasoning_latency_ms?: number | null
  unlock_request?: BackendUnlockRequest | null
  action_results?: BackendActionResult[]
  evaluated_at?: string
  freshness?: {
    as_of?: string
    sensor?: BackendFreshnessSource
    vision?: BackendFreshnessSource
  }
  decision_current?: boolean
}

export interface BackendDemoResponse {
  session_id: string
  vision: {
    source: 'MODEL_INFERENCE'
    detections: BackendDetection[]
    latency_ms: number | null
  }
  vehicle_state: {
    vehicle_id: string
    timestamp: string
    temperature: number
    engine_status: string
    doors_locked: boolean
    radar_presence?: boolean
    scenario: string
  }
  reasoning: {
    revision: number
    risk_level: string
    rule_id: string
    reason: string
    occupancy_state: string
    decision_current: boolean
    freshness: BackendCabinState['freshness']
  }
  actions: BackendActionResult[]
}

export interface BackendHealth {
  status?: string
  backend?: string
  vision?: string
  database?: string
  mqtt?: string
}
