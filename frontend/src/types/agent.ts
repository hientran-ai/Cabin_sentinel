export type RiskState = 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'ERROR'
export type CameraStatus = 'OK' | 'BLOCKED' | 'NO_FEED'
export type EngineState = 'ON' | 'OFF' | 'UNKNOWN'
export type ConnectionState = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE'
export type OccupancyState = 'PRESENT' | 'SUSPECTED' | 'ABSENT' | 'UNKNOWN'
export type AcknowledgementReason =
  | 'CABIN_CLEAR'
  | 'OCCUPANT_WITH_OWNER'
  | 'KEEP_ACTIVE'

export interface DetectedObject {
  class: 'person' | 'dog' | 'cat' | 'cell_phone' | 'backpack'
  confidence: number
  bbox: [number, number, number, number]
  faceBlurred?: boolean
}

export interface SensorState {
  temperatureC: number
  engine: EngineState
  doorsLocked: boolean
}

export interface ToolResult {
  action: 'TRIGGER_HORN' | 'CRACK_WINDOW' | 'SEND_SMS' | 'SEND_NOTIFICATION' | 'REQUEST_UNLOCK'
  status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SIMULATED' | 'PENDING_CONFIRMATION'
  message?: string
  timestamp?: string
  latencyMs?: number
}

export interface EvidenceConflict {
  type: string
  detail: string
}

export interface SeatEvidence {
  evidenceId: string
  childSeatPresent?: boolean
  orientation: 'REAR_FACING' | 'FORWARD_FACING' | 'UNKNOWN'
  orientationConfidence?: number
  position?: string
  observedAt?: string
  source: string
  modelVersion?: string
  quality: 'OK' | 'DEGRADED' | 'UNKNOWN'
}

export interface UnlockRequest {
  requestId: string
  incidentId?: string
  createdAt?: string
  expiresAt?: string
  status: 'pending' | 'expired' | 'canceled' | 'unknown'
}

export interface AgentState {
  vehicleId: string
  revision: number
  previousRiskState?: RiskState
  eventId: string
  timestamp: string
  riskState: RiskState
  ruleId: string
  reason: string
  cameraStatus: CameraStatus
  sensors: SensorState
  objects: DetectedObject[]
  occupancyState: OccupancyState
  occupancyReasonCode: string
  radarPresence?: boolean
  evidenceConflicts: EvidenceConflict[]
  seatEvidence: SeatEvidence[]
  seatConfigurationState: string
  reasoningLatencyMs?: number
  decisionCurrent?: boolean
  unlockRequest?: UnlockRequest
  evidenceFrameUrl?: string
  durationSeconds: number
  internetAvailable: boolean
  dataAgeMs: number
  toolResults: ToolResult[]
  acknowledgementStatus: 'NONE' | 'PENDING' | 'ACKNOWLEDGED'
}

export interface SystemHealth {
  edgeConnected: boolean
  internetAvailable: boolean
  cameraStatus: CameraStatus
  lastHeartbeat: string
}

export interface SimulationUpdate {
  temperatureC?: number
  engine?: EngineState
  doorsLocked?: boolean
  scenario?: RiskState
}

export type DemoScenario = 'normal' | 'parked_locked' | 'hot_locked'

export interface BackendCapabilities {
  manualEmergencyActions: boolean
  acknowledgement: boolean
  simulationControls: boolean
  demoAnalysis: boolean
}
