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

export interface BackendCabinState {
  vehicle_id?: string
  revision?: number
  incident_id?: string | null
  risk_level?: string
  rule_id?: string
  reason?: string
  temperature?: number | null
  engine_status?: string | null
  doors_locked?: boolean | null
  camera_status?: string | null
  detected_objects?: BackendDetection[] | null
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
    scenario: string
  }
  reasoning: {
    revision: number
    risk_level: string
    rule_id: string
    reason: string
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
