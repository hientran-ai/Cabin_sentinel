export type RiskState = 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'ERROR'
export type CameraStatus = 'OK' | 'BLOCKED' | 'NO_FEED'
export type EngineState = 'ON' | 'OFF'
export type ConnectionState = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE'
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
  action: 'TRIGGER_HORN' | 'CRACK_WINDOW' | 'SEND_SMS'
  status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED'
  message?: string
  timestamp?: string
  latencyMs?: number
}

export interface AgentState {
  eventId: string
  timestamp: string
  riskState: RiskState
  ruleId: string
  reason: string
  cameraStatus: CameraStatus
  sensors: SensorState
  objects: DetectedObject[]
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
