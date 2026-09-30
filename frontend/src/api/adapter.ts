import type { AgentState, CameraStatus, DetectedObject, RiskState, ToolResult } from '../types/agent'
import type { BackendActionResult, BackendCabinState, BackendDemoResponse } from '../types/backend'

type UnknownRecord = Record<string, unknown>
const riskStates: RiskState[] = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
const cameraStates: CameraStatus[] = ['OK', 'BLOCKED', 'NO_FEED']
const objectClasses: DetectedObject['class'][] = ['person', 'dog', 'cat', 'cell_phone', 'backpack']
const toolActions: ToolResult['action'][] = ['TRIGGER_HORN', 'CRACK_WINDOW', 'SEND_SMS', 'SEND_NOTIFICATION', 'REQUEST_UNLOCK']
const toolStatuses: ToolResult['status'][] = ['IDLE', 'RUNNING', 'SUCCESS', 'FAILED', 'SIMULATED', 'PENDING_CONFIRMATION']

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

function adaptObjects(value: unknown, bboxOptional = false): DetectedObject[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const item = record(entry)
    const objectClass = text(item.class ?? item.class_name, '') as DetectedObject['class']
    const bbox = item.bbox
    const validBbox = Array.isArray(bbox) && bbox.length === 4 && bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    if (!objectClasses.includes(objectClass) || (!validBbox && !bboxOptional)) return []
    const confidence = number(item.confidence, -1)
    if (confidence < 0 || confidence > 1) return []
    return [{ class: objectClass, confidence, bbox: validBbox ? bbox as DetectedObject['bbox'] : [0, 0, 0, 0], faceBlurred: item.faceBlurred === true || item.face_blurred === true }]
  })
}

const backendActionMap: Record<string, ToolResult['action'] | undefined> = {
  trigger_horn: 'TRIGGER_HORN',
  crack_window: 'CRACK_WINDOW',
  send_sms: 'SEND_SMS',
  send_notification: 'SEND_NOTIFICATION',
  request_unlock: 'REQUEST_UNLOCK',
}

const backendStatusMap: Record<string, ToolResult['status'] | undefined> = {
  idle: 'IDLE', running: 'RUNNING', success: 'SUCCESS', failed: 'FAILED',
  simulated: 'SIMULATED', pending_human_confirmation: 'PENDING_CONFIRMATION',
}

function adaptBackendTools(value: BackendActionResult[] | undefined): ToolResult[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const action = backendActionMap[item.tool ?? '']
    const status = backendStatusMap[item.status ?? '']
    if (!action || !status) return []
    return [{
      action,
      status,
      message: item.error
        ? `Backend error: ${item.error}`
        : status === 'SIMULATED'
          ? 'Simulation only — no physical action was performed.'
          : status === 'PENDING_CONFIRMATION'
            ? 'Waiting for human confirmation.'
            : undefined,
      timestamp: item.expires_at,
    }]
  })
}

function backendDataAgeMs(payload: BackendCabinState): number {
  const ages = [payload.freshness?.sensor?.age_s, payload.freshness?.vision?.age_s]
    .filter((age): age is number => typeof age === 'number' && Number.isFinite(age))
  if (payload.decision_current === false) return Math.max(3001, ...ages.map((age) => age * 1000))
  return ages.length ? Math.max(...ages) * 1000 : 3001
}

export function adaptBackendState(payload: BackendCabinState): AgentState {
  const risk = text(payload.risk_level, 'ERROR').toUpperCase()
  const cameraRaw = text(payload.camera_status, 'NO_FEED').toUpperCase()
  const revision = number(payload.revision)
  return {
    vehicleId: text(payload.vehicle_id, 'unknown'),
    eventId: text(payload.incident_id, '') || `${text(payload.vehicle_id, 'unknown')}-r${revision}`,
    timestamp: text(payload.evaluated_at ?? payload.freshness?.as_of, new Date().toISOString()),
    riskState: riskStates.includes(risk as RiskState) ? risk as RiskState : 'ERROR',
    ruleId: text(payload.rule_id, 'UNMAPPED'),
    reason: text(payload.reason, 'Backend did not provide a reason.'),
    cameraStatus: cameraRaw === 'OK' ? 'OK' : cameraRaw === 'BLOCKED' ? 'BLOCKED' : 'NO_FEED',
    sensors: {
      temperatureC: number(payload.temperature),
      engine: ['ON', 'OFF'].includes(text(payload.engine_status, '').toUpperCase())
        ? text(payload.engine_status, '').toUpperCase() as 'ON' | 'OFF'
        : 'UNKNOWN',
      doorsLocked: boolean(payload.doors_locked, true),
    },
    objects: adaptObjects(payload.detected_objects, true),
    durationSeconds: 0,
    internetAvailable: true,
    dataAgeMs: backendDataAgeMs(payload),
    toolResults: adaptBackendTools(payload.action_results),
    acknowledgementStatus: 'NONE',
  }
}

export function adaptDemoResponse(payload: BackendDemoResponse): AgentState {
  return adaptBackendState({
    vehicle_id: payload.vehicle_state.vehicle_id,
    revision: payload.reasoning.revision,
    incident_id: payload.session_id,
    risk_level: payload.reasoning.risk_level,
    rule_id: payload.reasoning.rule_id,
    reason: payload.reasoning.reason,
    temperature: payload.vehicle_state.temperature,
    engine_status: payload.vehicle_state.engine_status,
    doors_locked: payload.vehicle_state.doors_locked,
    camera_status: 'OK',
    detected_objects: payload.vision.detections,
    action_results: payload.actions,
    evaluated_at: payload.vehicle_state.timestamp,
    freshness: payload.reasoning.freshness,
    decision_current: payload.reasoning.decision_current,
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
  if ('risk_level' in raw) return adaptBackendState(raw as BackendCabinState)
  const sensors = record(raw.sensors ?? raw.sensor_state)
  const risk = text(raw.riskState ?? raw.risk_state ?? raw.status, 'ERROR').toUpperCase()
  const camera = text(raw.cameraStatus ?? raw.camera_status, 'NO_FEED').toUpperCase()
  return {
    vehicleId: text(raw.vehicleId ?? raw.vehicle_id, 'unknown'),
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
