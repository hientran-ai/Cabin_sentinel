import { describe, expect, it } from 'vitest'
import { ageCapability, ageCapabilityOf, frameCounts, trackingCaps } from './cabinCounts'
import type { Detection, ObservationEvent, ServerState } from './types'

const obs = (over: Partial<ObservationEvent> = {}, dets: Detection[] = [], age = 'disabled'): ObservationEvent => ({
  event_id: 1, event_type: 'observation', frame_id: 'f1', accepted: true, observed_at: '2026-10-16T10:00:00Z', received_at: '2026-10-16T10:00:00Z',
  vision: { source: 'MODEL_INFERENCE', detections: dets, age_classifier: { status: age } }, ...over,
})
const state = (o: ObservationEvent | null, over: Partial<ServerState> = {}): ServerState => ({
  vehicle_id: 'v', session_id: 's1', revision: 3, risk_level: 'SAFE', previous_risk_level: null, rule_id: 'EMPTY_CABIN', reason: '', occupancy_state: 'ABSENT',
  occupancy_reason_code: '', evidence_conflicts: [], incident_id: null, incident: null, alert: null, data_quality: null, decision_current: true, evaluated_at: '',
  camera_status: 'OK', sensor_snapshot: null, detected_objects: [], action_results: [], action_ledger: [], unlock_request: null,
  freshness: { as_of: '', sensor: { status: 'FRESH', age_s: 1, observed_at: '' }, vision: { status: 'FRESH', age_s: 1, observed_at: '' } },
  simulation: { vehicle_source: 'SIMULATED', action_mode: 'SIMULATED', vision_source: 'MODEL_INFERENCE', runtime: 'HOSTED_SIMULATION' },
  ttl_s: { sensor: 5, vision: 3 }, server_time: '', last_observation: o, model: { ready: true }, ...over,
})
const fresh = { sessionId: 's1', visionFresh: true, connection: 'ok' as const }
const person = (age_group?: string | null): Detection => ({ class: 'person', confidence: 0.9, age_group })

describe('frameCounts: count per accepted frame', () => {
  it('counts supported item detections in their separate channel without counting occupants', () => {
    const o = obs({ vision: { source: 'MODEL_INFERENCE', detections: [], items: [{ class: 'backpack', confidence: 0.8 }, { class: 'cell phone', confidence: 0.7 }] } })
    const c = frameCounts({ state: state(o, { model: { ready: true, items_tracking: true } }), ...fresh })
    expect(c.items).toBe(2)
    expect(c.person).toBe(0)
  })
  it('no state or no observation is NO_DATA with every count null (not zero)', () => {
    const a = frameCounts({ state: null, ...fresh })
    expect(a.status).toBe('NO_DATA'); expect([a.person, a.child, a.adult, a.pet, a.items]).toEqual([null, null, null, null, null])
    expect(frameCounts({ state: state(null), ...fresh }).status).toBe('NO_DATA')
  })
  it('a current frame with detections counts person and pets per frame', () => {
    const c = frameCounts({ state: state(obs({}, [person(), person(), { class: 'dog', confidence: 0.8 }, { class: 'cat', confidence: 0.7 }])), ...fresh })
    expect(c).toMatchObject({ status: 'CURRENT', person: 2, pet: 2, dog: 1, cat: 1, frameId: 'f1' })
  })
  it('a current frame with no detections is a real 0, but only for the classes the model reports', () => {
    const c = frameCounts({ state: state(obs()), ...fresh })
    expect(c).toMatchObject({ status: 'CURRENT', person: 0, pet: 0 })
    expect(c.items).toBeNull(); expect(c.child).toBeNull(); expect(c.adult).toBeNull()
  })
  it.each(['disabled', 'load_failed', 'error'])('age classifier %s: child and adult are null, every person is age-unknown', (st) => {
    const c = frameCounts({ state: state(obs({}, [person('adult'), person('child')], st)), ...fresh })
    expect(c.child).toBeNull(); expect(c.adult).toBeNull(); expect(c.ageUnknown).toBe(2); expect(c.person).toBe(2)
  })
  it('age classifier ok: child, adult and unknown come from the per-person evidence only', () => {
    const c = frameCounts({ state: state(obs({}, [person('child'), person('adult'), person('unknown'), person(null)], 'ok')), ...fresh })
    expect(c).toMatchObject({ person: 4, child: 1, adult: 1, ageUnknown: 2, age: 'AVAILABLE' })
  })
  it('person is never turned into child by a class name or by the age field on a non-person', () => {
    const c = frameCounts({ state: state(obs({}, [{ class: 'dog', confidence: 0.9, age_group: 'child' }, person()], 'ok')), ...fresh })
    expect(c.child).toBe(0); expect(c.person).toBe(1)
  })
  it('a stale frame never shows a current count; the old numbers live only in lastKnown', () => {
    const c = frameCounts({ state: state(obs({}, [person()])), ...fresh, visionFresh: false })
    expect(c.status).toBe('STALE'); expect(c.person).toBeNull(); expect(c.pet).toBeNull(); expect(c.lastKnown).toEqual({ person: 1, pet: 0, frameId: 'f1' })
  })
  it('a lost link makes the frame stale even when the vision source looked fresh', () => {
    const c = frameCounts({ state: state(obs({}, [person()])), ...fresh, connection: 'lost' })
    expect(c.status).toBe('STALE'); expect(c.person).toBeNull()
  })
  it('a camera status event or a rejected frame gives no counts', () => {
    expect(frameCounts({ state: state(obs({ event_type: 'camera_status', camera_status: 'BLOCKED', vision: undefined })), ...fresh })).toMatchObject({ status: 'UNAVAILABLE', person: null })
    expect(frameCounts({ state: state(obs({ accepted: false }, [person()])), ...fresh })).toMatchObject({ status: 'UNAVAILABLE', person: null })
  })
  it('a state of another session is ignored (late response after a session change)', () => {
    expect(frameCounts({ state: state(obs({}, [person()]), { session_id: 'other' }), ...fresh })).toMatchObject({ status: 'WRONG_SESSION', person: null })
    expect(frameCounts({ state: state(obs({}, [person()])), ...fresh, sessionId: null }).status).toBe('WRONG_SESSION')
  })
  it('does not depend on risk fields: same detections give the same counts under any risk level', () => {
    const a = frameCounts({ state: state(obs({}, [person()]), { risk_level: 'CRITICAL', rule_id: 'HOT_OCCUPANT' }), ...fresh })
    const b = frameCounts({ state: state(obs({}, [person()]), { risk_level: 'SAFE', rule_id: 'EMPTY_CABIN' }), ...fresh })
    expect(a).toEqual(b)
  })
})

describe('ageCapability', () => {
  it('maps backend statuses and never treats an unknown status as available', () => {
    expect(ageCapability('ok')).toBe('AVAILABLE'); expect(ageCapability('disabled')).toBe('DISABLED')
    expect(ageCapability('load_failed')).toBe('LOAD_FAILED'); expect(ageCapability('error')).toBe('ERROR')
    expect(ageCapability(undefined)).toBe('UNKNOWN'); expect(ageCapability('weights-ok')).toBe('UNKNOWN')
  })
  it('per-frame status wins over the server status; the server status is the fallback', () => {
    expect(ageCapabilityOf(state(obs({}, [], 'error')), 'ok')).toBe('ERROR')
    expect(ageCapabilityOf(state(null, { model: { ready: true, age_classifier: 'ok' } }))).toBe('AVAILABLE')
    expect(ageCapabilityOf(null, 'load_failed')).toBe('LOAD_FAILED')
  })
})

describe('trackingCaps: what the server can really track', () => {
  const st = (caps: ReturnType<typeof trackingCaps>) => Object.fromEntries(caps.map((c) => [c.key, c.status]))
  it('today: person and pets ready, age off, forgotten items not supported', () => {
    expect(st(trackingCaps({ ready: true, classes_used: ['person', 'cat', 'dog'], age_classifier: 'disabled' }))).toEqual({ child: 'OFF', person: 'READY', pet: 'READY', items: 'NOT_SUPPORTED' })
  })
  it('child becomes ready only when the age classifier is ok; a failed load is an error, never ready', () => {
    expect(st(trackingCaps({ ready: true, classes_used: ['person'], age_classifier: 'ok' })).child).toBe('READY')
    expect(st(trackingCaps({ ready: true, classes_used: ['person'], age_classifier: 'load_failed' })).child).toBe('ERROR')
  })
  it('items need an explicit server flag; a longer class list alone does not enable them', () => {
    expect(st(trackingCaps({ ready: true, classes_used: ['person', 'backpack', 'handbag'] })).items).toBe('NOT_SUPPORTED')
    expect(st(trackingCaps({ ready: true, items_tracking: true })).items).toBe('READY')
  })
  it('no model status or a model that is not ready is never reported as ready', () => {
    expect(Object.values(st(trackingCaps(null)))).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'])
    expect(st(trackingCaps({ ready: false, classes_used: ['person', 'dog'] }))).toMatchObject({ person: 'ERROR', pet: 'ERROR' })
  })
})
