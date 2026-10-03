import type { AgentState, CameraStatus, DetectedObject, EvidenceConflict, OccupancyState, RiskState, SeatEvidence, ToolResult, UnlockRequest } from '../types/agent'
import type { BackendActionResult, BackendCabinState, BackendDemoResponse, BackendEvidenceConflict, BackendSeatEvidence, BackendUnlockRequest } from '../types/backend'

type UnknownRecord = Record<string, unknown>
const riskStates: RiskState[] = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
const cameraStates: CameraStatus[] = ['OK', 'BLOCKED', 'NO_FEED']
const occupancyStates: OccupancyState[] = ['PRESENT', 'SUSPECTED', 'ABSENT', 'UNKNOWN']
const objectClasses: DetectedObject['class'][] = ['person', 'dog', 'cat', 'cell_phone', 'backpack']
const toolActions: ToolResult['action'][] = ['TRIGGER_HORN', 'CRACK_WINDOW', 'SEND_SMS', 'SEND_NOTIFICATION', 'REQUEST_UNLOCK']
const toolStatuses: ToolResult['status'][] = ['IDLE', 'RUNNING', 'SUCCESS', 'FAILED', 'SIMULATED', 'PENDING_CONFIRMATION', 'PLANNED', 'ATTEMPTED', 'UNKNOWN']

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

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
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
  planned: 'PLANNED', attempted: 'ATTEMPTED', unknown: 'UNKNOWN',
}

function adaptBackendTools(value: BackendActionResult[] | undefined): ToolResult[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const action = backendActionMap[item.tool ?? ''] ?? 'UNKNOWN_ACTION'
    const status = backendStatusMap[item.status ?? ''] ?? 'UNKNOWN'
    if (!action || !status) return []
    return [{
      action,
      status,
      actionKey: item.action_key,
      revision: item.revision,
      incidentId: item.incident_id,
      message: item.error
        ? `Backend error: ${item.error}`
        : status === 'SIMULATED'
          ? 'Mô phỏng — no physical action was performed.'
          : status === 'PENDING_CONFIRMATION'
            ? 'Waiting for human confirmation.'
            : undefined,
      timestamp: item.expires_at,
    }]
  })
}

function adaptSeatEvidence(value: BackendSeatEvidence[] | undefined): SeatEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const evidenceId = text(item.evidence_id, '')
    if (!evidenceId) return []
    const orientation = ['REAR_FACING', 'FORWARD_FACING', 'UNKNOWN'].includes(text(item.seat_orientation, ''))
      ? text(item.seat_orientation, 'UNKNOWN') as SeatEvidence['orientation']
      : 'UNKNOWN'
    const quality = ['OK', 'DEGRADED', 'UNKNOWN'].includes(text(item.quality, ''))
      ? text(item.quality, 'UNKNOWN') as SeatEvidence['quality']
      : 'UNKNOWN'
    const confidence = typeof item.orientation_confidence === 'number' && Number.isFinite(item.orientation_confidence)
      ? item.orientation_confidence
      : undefined
    return [{
      evidenceId,
      childSeatPresent: optionalBoolean(item.child_seat_present),
      orientation,
      orientationConfidence: confidence,
      position: text(item.seat_position, '') || undefined,
      observedAt: text(item.observed_at, '') || undefined,
      source: text(item.source, 'unknown source'),
      modelVersion: text(item.model_version, '') || undefined,
      quality,
    }]
  })
}

function conflictDetail(conflict: BackendEvidenceConflict): string {
  if (conflict.type === 'PRESENCE_DISAGREEMENT') {
    const radar = conflict.sensor?.radar_presence === true ? 'presence' : conflict.sensor?.radar_presence === false ? 'clear' : 'unknown'
    const detections = Array.isArray(conflict.vision?.detected_objects) ? conflict.vision.detected_objects.length : 0
    return `Radar reports ${radar}; Vision reports ${detections} detection${detections === 1 ? '' : 's'}.`
  }
  if (conflict.type === 'ORIENTATION_DISAGREEMENT') {
    const orientations = [...new Set((conflict.seat_evidence ?? []).map((seat) => seat.seat_orientation).filter(Boolean))]
    return `Seat ${conflict.seat_detection_id ?? 'unknown'} has conflicting orientations${orientations.length ? `: ${orientations.join(' / ')}` : ''}.`
  }
  if (conflict.type === 'TIMESTAMP_SKEW') return `Sensor and Vision timestamps differ by ${number(conflict.skew_s).toFixed(1)} seconds.`
  if (conflict.type === 'CONFIDENCE_REGRESSION') return 'A previously confirmed living-object detection dropped below the confidence threshold.'
  return text(conflict.type, 'UNKNOWN_CONFLICT').replaceAll('_', ' ').toLowerCase()
}

function adaptConflicts(value: BackendEvidenceConflict[] | undefined): EvidenceConflict[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const type = text(item.type, '')
    return type ? [{ type, detail: conflictDetail(item) }] : []
  })
}

function adaptUnlockRequest(value: BackendUnlockRequest | null | undefined): UnlockRequest | undefined {
  if (!value) return undefined
  const requestId = text(value.request_id, '')
  if (!requestId) return undefined
  const rawStatus = text(value.status, 'unknown')
  return {
    requestId,
    incidentId: text(value.incident_id, '') || undefined,
    createdAt: text(value.created_at, '') || undefined,
    expiresAt: text(value.expires_at, '') || undefined,
    status: ['pending', 'expired', 'canceled'].includes(rawStatus)
      ? rawStatus as UnlockRequest['status']
      : 'unknown',
  }
}

function backendDataAgeMs(payload: BackendCabinState): number {
  const sources = [payload.freshness?.sensor, payload.freshness?.vision]
  const knownAges = sources.map(source => source?.age_s).filter((age): age is number => typeof age === 'number' && Number.isFinite(age) && age >= 0)
  if (sources.some(source => !source || source.status !== 'FRESH' ||
    typeof source.age_s !== 'number' || !Number.isFinite(source.age_s) || source.age_s < 0)) return Math.max(3001, ...knownAges.map(age => age * 1000))
  const ages = sources.map(source => source!.age_s as number)
  if (payload.decision_current === false) return Math.max(3001, ...ages.map(age => age * 1000))
  return Math.max(...ages) * 1000
}

export function adaptBackendState(payload: BackendCabinState): AgentState {
  const risk = text(payload.risk_level, 'ERROR').toUpperCase()
  const cameraRaw = text(payload.camera_status, 'NO_FEED').toUpperCase()
  const revision = number(payload.revision)
  const previousRisk = text(payload.previous_risk_level, '').toUpperCase()
  const occupancy = text(payload.occupancy_state, 'UNKNOWN').toUpperCase()
  return {
    vehicleId: text(payload.vehicle_id, 'unknown'),
    revision,
    previousRiskState: riskStates.includes(previousRisk as RiskState) ? previousRisk as RiskState : undefined,
    eventId: text(payload.incident_id, '') || `${text(payload.vehicle_id, 'unknown')}-r${revision}`,
    timestamp: text(payload.evaluated_at ?? payload.freshness?.as_of, new Date().toISOString()),
    riskState: riskStates.includes(risk as RiskState) ? risk as RiskState : 'ERROR',
    ruleId: text(payload.rule_id, 'UNMAPPED'),
    reason: text(payload.reason, 'Backend did not provide a reason.'),
    cameraStatus: cameraRaw === 'OK' ? 'OK' : cameraRaw === 'BLOCKED' ? 'BLOCKED' : 'NO_FEED',
    sensors: {
      temperatureC: typeof payload.temperature === 'number' && Number.isFinite(payload.temperature) ? payload.temperature : null,
      engine: ['ON', 'OFF'].includes(text(payload.engine_status, '').toUpperCase())
        ? text(payload.engine_status, '').toUpperCase() as 'ON' | 'OFF'
        : 'UNKNOWN',
      doorsLocked: typeof payload.doors_locked === 'boolean' ? payload.doors_locked : null,
    },
    objects: adaptObjects(payload.detected_objects, true),
    occupancyState: occupancyStates.includes(occupancy as OccupancyState) ? occupancy as OccupancyState : 'UNKNOWN',
    occupancyReasonCode: text(payload.occupancy_reason_code, 'SOURCE_UNAVAILABLE'),
    radarPresence: optionalBoolean(payload.radar_presence),
    evidenceConflicts: adaptConflicts(payload.evidence_conflicts),
    seatEvidence: adaptSeatEvidence(payload.seat_evidence),
    seatConfigurationState: text(payload.seat_configuration_state, 'NOT_ENOUGH_EVIDENCE'),
    reasoningLatencyMs: typeof payload.reasoning_latency_ms === 'number' && Number.isFinite(payload.reasoning_latency_ms) ? payload.reasoning_latency_ms : undefined,
    decisionCurrent: payload.decision_current === true
      ? typeof payload.temperature === 'number' && Number.isFinite(payload.temperature) &&
        ['ON', 'OFF'].includes(text(payload.engine_status, '').toUpperCase()) &&
        typeof payload.doors_locked === 'boolean' && typeof payload.camera_status === 'string' &&
        Array.isArray(payload.detected_objects) && occupancyStates.includes(occupancy as OccupancyState)
      : typeof payload.decision_current === 'boolean' ? false : undefined,
    unlockRequest: adaptUnlockRequest(payload.unlock_request),
    durationSeconds: 0,
    internetAvailable: true,
    dataAgeMs: backendDataAgeMs(payload),
    toolResults: adaptBackendTools([...(payload.action_results ?? []), ...(payload.action_ledger ?? []).filter(item => !(payload.action_results ?? []).some(result => result.action_key && result.action_key === item.action_key))]),
    dataQuality: payload.data_quality,
    incident: payload.incident ? { incidentId: payload.incident.incident_id, status: payload.incident.status, acknowledgedAt: payload.incident.acknowledged_at } : undefined,
    simulation: payload.simulation?.vehicle_source === 'SIMULATED',
    acknowledgementStatus: payload.incident?.acknowledged_at ? 'ACKNOWLEDGED' : 'NONE',
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
    radar_presence: payload.vehicle_state.radar_presence,
    camera_status: 'OK',
    detected_objects: payload.vision.detections,
    action_results: payload.actions,
    occupancy_state: payload.reasoning.occupancy_state,
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
  const previousRisk = text(raw.previousRiskState ?? raw.previous_risk_level, '').toUpperCase()
  const occupancy = text(raw.occupancyState ?? raw.occupancy_state, 'UNKNOWN').toUpperCase()
  return {
    vehicleId: text(raw.vehicleId ?? raw.vehicle_id, 'unknown'),
    revision: number(raw.revision),
    previousRiskState: riskStates.includes(previousRisk as RiskState) ? previousRisk as RiskState : undefined,
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
    occupancyState: occupancyStates.includes(occupancy as OccupancyState) ? occupancy as OccupancyState : 'UNKNOWN',
    occupancyReasonCode: text(raw.occupancyReasonCode ?? raw.occupancy_reason_code, 'SOURCE_UNAVAILABLE'),
    radarPresence: optionalBoolean(raw.radarPresence ?? raw.radar_presence),
    evidenceConflicts: Array.isArray(raw.evidenceConflicts) ? raw.evidenceConflicts as EvidenceConflict[] : [],
    seatEvidence: Array.isArray(raw.seatEvidence) ? raw.seatEvidence as SeatEvidence[] : [],
    seatConfigurationState: text(raw.seatConfigurationState ?? raw.seat_configuration_state, 'NOT_ENOUGH_EVIDENCE'),
    reasoningLatencyMs: typeof (raw.reasoningLatencyMs ?? raw.reasoning_latency_ms) === 'number' ? raw.reasoningLatencyMs as number ?? raw.reasoning_latency_ms as number : undefined,
    decisionCurrent: typeof (raw.decisionCurrent ?? raw.decision_current) === 'boolean' ? (raw.decisionCurrent ?? raw.decision_current) as boolean : undefined,
    unlockRequest: raw.unlockRequest as UnlockRequest | undefined,
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
