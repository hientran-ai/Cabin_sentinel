import type { AgentState, CameraStatus, DetectedObject, RiskState, ToolResult } from '../types/agent'

type UnknownRecord = Record<string, unknown>
const riskStates: RiskState[] = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
const cameraStates: CameraStatus[] = ['OK', 'BLOCKED', 'NO_FEED']
const objectClasses: DetectedObject['class'][] = ['person', 'dog', 'cat', 'cell_phone', 'backpack']
const toolActions: ToolResult['action'][] = ['TRIGGER_HORN', 'CRACK_WINDOW', 'SEND_SMS']
const toolStatuses: ToolResult['status'][] = ['IDLE', 'RUNNING', 'SUCCESS', 'FAILED']

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : {}
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function adaptObjects(value: unknown): DetectedObject[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const item = record(entry)
    const objectClass = text(item.class, '') as DetectedObject['class']
    const bbox = item.bbox
    if (!objectClasses.includes(objectClass) || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return []
    const confidence = number(item.confidence, -1)
    if (confidence < 0 || confidence > 1) return []
    return [{ class: objectClass, confidence, bbox: bbox as DetectedObject['bbox'], faceBlurred: item.faceBlurred === true || item.face_blurred === true }]
  })
}

function adaptTools(value: unknown): ToolResult[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const item = record(entry)
    const action = text(item.action, '') as ToolResult['action']
    const status = text(item.status, '') as ToolResult['status']
    if (!toolActions.includes(action) || !toolStatuses.includes(status)) return []
    return [{
      action,
      status,
      message: text(item.message, '') || undefined,
      timestamp: text(item.timestamp, '') || undefined,
      latencyMs: typeof item.latencyMs === 'number' ? item.latencyMs : typeof item.latency_ms === 'number' ? item.latency_ms : undefined,
    }]
  })
}

export function adaptAgentState(payload: unknown): AgentState {
  const raw = record(payload)
  const sensors = record(raw.sensors ?? raw.sensor_state)
  const risk = text(raw.riskState ?? raw.risk_state ?? raw.status, 'ERROR').toUpperCase()
  const camera = text(raw.cameraStatus ?? raw.camera_status, 'NO_FEED').toUpperCase()
  return {
    eventId: text(raw.eventId ?? raw.event_id, 'unknown-event'),
    timestamp: text(raw.timestamp, new Date().toISOString()),
    riskState: riskStates.includes(risk as RiskState) ? risk as RiskState : 'ERROR',
    ruleId: text(raw.ruleId ?? raw.rule_id, 'UNMAPPED'),
    reason: text(raw.reason, 'Backend did not provide a reason.'),
    cameraStatus: cameraStates.includes(camera as CameraStatus) ? camera as CameraStatus : 'NO_FEED',
    sensors: {
      temperatureC: number(sensors.temperatureC ?? sensors.temperature_c),
      engine: text(sensors.engine, 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
      doorsLocked: boolean(sensors.doorsLocked ?? sensors.doors_locked, true),
    },
    objects: adaptObjects(raw.objects),
    evidenceFrameUrl: text(raw.evidenceFrameUrl ?? raw.evidence_frame_url, '') || undefined,
    durationSeconds: number(raw.durationSeconds ?? raw.duration_seconds),
    internetAvailable: boolean(raw.internetAvailable ?? raw.internet_available, false),
    dataAgeMs: number(raw.dataAgeMs ?? raw.data_age_ms, 3001),
    toolResults: adaptTools(raw.toolResults ?? raw.tool_results),
    acknowledgementStatus: ['NONE', 'PENDING', 'ACKNOWLEDGED'].includes(text(raw.acknowledgementStatus ?? raw.acknowledgement_status, 'NONE'))
      ? text(raw.acknowledgementStatus ?? raw.acknowledgement_status, 'NONE') as AgentState['acknowledgementStatus']
      : 'NONE',
  }
}
