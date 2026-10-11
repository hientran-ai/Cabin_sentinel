export type Locale = 'vi' | 'en'
export type RiskLevel = 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'ERROR'
export type ScenarioId = 'safe' | 'notice' | 'warning' | 'critical' | 'action_failure' | 'camera' | 'stale' | 'offline'

export interface LocalizedText { vi: string; en: string }

export interface VehicleSnapshot {
  id: string
  name: string
  plate: string
  model: string
  riskLevel: RiskLevel
  reason: LocalizedText
  recommendation: LocalizedText
  ruleId: string
  revision: number
  temperatureC?: number
  occupancy: 'PRESENT' | 'SUSPECTED' | 'ABSENT' | 'UNKNOWN'
  camera: 'OK' | 'BLOCKED' | 'NO_FEED'
  edge: 'CONNECTED' | 'DEGRADED' | 'OFFLINE'
  cloud: 'CONNECTED' | 'DEGRADED' | 'OFFLINE'
  engine: 'ON' | 'OFF' | 'UNKNOWN'
  doorsLocked: boolean | null
  decisionCurrent: boolean
  updatedAt: string
  activeIncidentId?: string
  actions: ActionResult[]
}

export interface ActionResult {
  id: string
  label: LocalizedText
  status: 'SIMULATED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'RUNNING' | 'PLANNED' | 'ATTEMPTED' | 'UNKNOWN' | 'IDLE'
  detail: LocalizedText
}

export interface Incident {
  id: string
  vehicleId: string
  riskLevel: RiskLevel
  title: LocalizedText
  reason: LocalizedText
  ruleId: string
  status: 'ACTIVE' | 'MONITORING' | 'RESOLVED' | 'EVALUATION'
  occurredAt: string
  temperatureC?: number
  occupancy: VehicleSnapshot['occupancy']
  revision?: number
  acknowledgedAt?: string
}

export interface NotificationSettings {
  push: boolean
  sms: boolean
  email: boolean
  quietHours: boolean
  emergencyContact: string
  emergencyPhone: string
}

export interface CabinTelemetrySample {
  recordedAt: string
  temperatureC: number
  occupancyConfidence: number
  signal: 'NORMAL' | 'OCCUPANCY' | 'STALE'
}

export interface CabinRealtimeSnapshot {
  feedState: 'LIVE' | 'CONNECTING' | 'NO_FEED'
  modelState: 'RUNNING' | 'WARMING_UP' | 'UNAVAILABLE'
  modelName: string
  inferenceAt: string
  latencyMs?: number
  occupantConfidence: number
  facesBlurredAtEdge: boolean
  transport: 'WEBRTC' | 'HLS' | 'NONE'
  detections: string[]
}

export interface OwnerRepository {
  listVehicles(): Promise<VehicleSnapshot[]>
  listIncidents(): Promise<Incident[]>
  getCabinTelemetry(vehicleId: string): Promise<CabinTelemetrySample[]>
  getCabinRealtimeState(vehicleId: string): Promise<CabinRealtimeSnapshot>
  getNotificationSettings(): Promise<NotificationSettings>
}
