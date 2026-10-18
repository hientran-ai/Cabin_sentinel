// Validate untrusted JSON before it reaches either cockpit or phone components.
// Unknown enums and missing nested safety evidence reject the response; they never become SAFE.
type Obj = Record<string, unknown>
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string'
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const bool = (v: unknown) => typeof v === 'boolean'
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v)
const list = (v: unknown, check: (v: unknown) => boolean) => Array.isArray(v) && v.every(check)
const one = (v: unknown, values: readonly unknown[]) => values.includes(v)
const RISK = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
function requireShape(ok: boolean, field: string): asserts ok { if (!ok) throw new Error(field) }
const detection = (v: unknown) => obj(v) && str(v.class) && num(v.confidence) && Number(v.confidence) >= 0 && Number(v.confidence) <= 1 && (v.bbox == null || (Array.isArray(v.bbox) && v.bbox.length === 4 && v.bbox.every(num)))
const model = (v: unknown) => obj(v) && bool(v.ready) && (v.classes_used === undefined || list(v.classes_used, str)) && (v.age_classifier === undefined || str(v.age_classifier)) && (v.file === undefined || str(v.file)) && (v.sha256 === undefined || str(v.sha256))
const age = (v: unknown) => obj(v) && one(v.status, ['FRESH', 'STALE', 'UNKNOWN']) && nullable(v.age_s, num) && nullable(v.observed_at, str)
const step = (v: unknown) => obj(v) && str(v.tool) && (v.parameters == null || obj(v.parameters))

function care(v: unknown) {
  requireShape(obj(v) && one(v.status, ['IDLE', 'ACTIVE', 'ENDED']) && one(v.profile, ['CHILD', 'ADULT', 'PET', 'UNKNOWN']) && bool(v.auto_consent) && list(v.plan, step) && obj(v.countdown) && bool(v.countdown.armed) && nullable(v.countdown.remaining_s, num) && list(v.notes, str), 'care')
}

function state(v: unknown) {
  requireShape(obj(v), 'state')
  requireShape(str(v.vehicle_id) && str(v.session_id) && num(v.revision) && Number.isInteger(v.revision) && Number(v.revision) >= 1, 'state.identity')
  requireShape(one(v.risk_level, RISK) && nullable(v.previous_risk_level, (x) => one(x, RISK)) && str(v.rule_id) && str(v.reason), 'state.risk')
  requireShape(one(v.occupancy_state, ['PRESENT', 'SUSPECTED', 'ABSENT', 'UNKNOWN']) && str(v.occupancy_reason_code) && bool(v.decision_current), 'state.evidence')
  requireShape(obj(v.freshness) && age(v.freshness.sensor) && age(v.freshness.vision), 'state.freshness')
  requireShape(nullable(v.data_quality, (x) => obj(x) && one(x.status, ['CURRENT', 'STALE', 'UNKNOWN']) && list(x.issues, str)), 'state.quality')
  requireShape(nullable(v.incident_id, str) && nullable(v.incident, (x) => obj(x) && str(x.incident_id) && one(x.status, ['OPEN', 'RESOLVED']) && nullable(x.acknowledged_at, str)), 'state.incident')
  requireShape(nullable(v.alert, (x) => obj(x) && str(x.stage) && num(x.sequence)), 'state.alert')
  requireShape(list(v.evidence_conflicts, (x) => obj(x) && str(x.type)) && list(v.action_results, step) && list(v.action_ledger, (x) => obj(x) && str(x.tool) && str(x.status)), 'state.actions')
  requireShape(nullable(v.detected_objects, (x) => list(x, (d) => obj(d) && str(d.class_name) && num(d.confidence))) && nullable(v.sensor_snapshot, obj), 'state.snapshot')
  requireShape(model(v.model) && obj(v.ttl_s) && num(v.ttl_s.sensor) && num(v.ttl_s.vision) && obj(v.simulation) && str(v.simulation.action_mode), 'state.provenance')
  requireShape(nullable(v.unlock_request, (x) => obj(x) && str(x.request_id) && str(x.status) && str(x.expires_at)), 'state.unlock')
  if (v.last_observation != null) {
    const o = v.last_observation
    requireShape(obj(o) && str(o.frame_id) && bool(o.accepted) && str(o.observed_at), 'state.observation')
    if (o.event_type === 'observation') requireShape(obj(o.vision) && list(o.vision.detections, detection), 'state.detections')
  }
  if (v.care != null) care(v.care)
  if (v.items != null) requireShape(obj(v.items) && list(v.items.reminders, (r) => obj(r) && str(r.id) && str(r.class) && one(r.status, ['OPEN', 'TAKEN', 'SNOOZED']) && list(r.evidence_frames, str)), 'state.items')
  if (obj(v.last_observation) && obj(v.last_observation.vision) && v.last_observation.vision.items !== undefined) requireShape(list(v.last_observation.vision.items, detection), 'state.item_detections')
}

function notification(v: unknown) {
  return obj(v) && num(v.notification_id) && str(v.stage) && num(v.revision) && nullable(v.risk_level, (x) => one(x, RISK)) && obj(v.channels)
    && obj(v.channels.in_app_feed) && one(v.channels.in_app_feed.state, ['PUBLISHED', 'IN_APP_DELIVERED'])
    && obj(v.channels.push) && one(v.channels.push.state, ['PLANNED', 'NOT_PLANNED', 'SIMULATED', 'FAILED', 'UNKNOWN'])
}

export function validateApiPayload(path: string, value: unknown): void {
  if (/\/state$/.test(path)) { state(value); return }
  if (/\/notifications$/.test(path)) { requireShape(list(value, notification), 'notifications'); return }
  requireShape(obj(value), 'response')
  if (path === '/status') requireShape(model(value.model) && obj(value.ttl_s) && num(value.upload_limit_bytes), 'status')
  else if (path === '/sessions') requireShape(str(value.session_id) && !!value.session_id && str(value.session_token) && !!value.session_token && str(value.vehicle_id), 'session')
  else if (path.includes('/history?')) requireShape(list(value.items, (x) => obj(x) && num(x.event_id) && str(x.type)) && num(value.next_after), 'history')
  else if (/\/observations$/.test(path)) requireShape(str(value.frame_id) && bool(value.accepted) && bool(value.replayed) && obj(value.vision) && list(value.vision.detections, detection) && obj(value.timings_ms), 'observation')
  else if (path.includes('/care/')) care(value)
}
