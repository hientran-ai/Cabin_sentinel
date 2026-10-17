import { describe, expect, it } from 'vitest'
import { appendFrom, summarize, toCsv, toJsonl, type LogEntry } from './evidenceLog'
import type { ObservationEvent, ServerState } from './types'

const obs = (frame: string, dets: { class: string; confidence: number; age_group?: string }[] = [], over: Partial<ObservationEvent> = {}): ObservationEvent => ({
  event_id: 1, event_type: 'observation', frame_id: frame, accepted: true, observed_at: '2026-10-17T10:00:00Z', received_at: '2026-10-17T10:00:00Z',
  timings_ms: { infer_detector: 40, server_total: 50 }, vision: { source: 'MODEL_INFERENCE', detections: dets, age_classifier: { status: 'disabled' } },
  model: { file: 'yolov8n.pt', sha256: 'f59b3d833e0123456789' }, ...over,
})
const st = (o: ObservationEvent | null, rev = 1, over: Partial<ServerState> = {}): ServerState => ({
  vehicle_id: 'v', session_id: 'abcdef123456', revision: rev, risk_level: 'SAFE', previous_risk_level: null, rule_id: 'EMPTY_CABIN', reason: '', occupancy_state: 'ABSENT',
  occupancy_reason_code: '', evidence_conflicts: [], incident_id: null, incident: null, alert: null, data_quality: null, decision_current: true, evaluated_at: '',
  camera_status: 'OK', sensor_snapshot: null, detected_objects: [], action_results: [], action_ledger: [], unlock_request: null,
  freshness: { as_of: '', sensor: { status: 'FRESH', age_s: 1, observed_at: '' }, vision: { status: 'FRESH', age_s: 1, observed_at: '' } },
  simulation: { vehicle_source: 'SIMULATED', action_mode: 'SIMULATED', vision_source: 'MODEL_INFERENCE', runtime: 'HOSTED_SIMULATION' },
  ttl_s: { sensor: 5, vision: 3 }, server_time: '', last_observation: o, model: { ready: true }, ...over,
})

describe('evidence log', () => {
  it('records one entry per frame and does not repeat when the same state is polled again', () => {
    let l: LogEntry[] = []
    l = appendFrom(l, st(obs('f1'), 1)); const again = appendFrom(l, st(obs('f1'), 1))
    expect(l).toHaveLength(1); expect(again).toBe(l)
    l = appendFrom(l, st(obs('f2'), 1)); expect(l).toHaveLength(2)
  })
  it('a new revision without a new frame (ack, resolve) is a decision entry', () => {
    let l = appendFrom([], st(obs('f1'), 1)); l = appendFrom(l, st(obs('f1'), 2))
    expect(l.map((e) => e.kind)).toEqual(['frame', 'decision'])
  })
  it('stores class, confidence and age label but no box coordinates', () => {
    const e = appendFrom([], st(obs('f1', [{ class: 'person', confidence: 0.9123, age_group: 'child' }])))[0]!
    expect(e.dets).toEqual([{ c: 'person', p: 0.91, age: 'child' }]); expect(JSON.stringify(e)).not.toContain('bbox')
  })
  it('summary counts only what was logged; child label needs the age classifier to be ok', () => {
    const a = obs('f1', [{ class: 'person', confidence: 0.9, age_group: 'child' }])
    const b = obs('f2', [{ class: 'person', confidence: 0.9, age_group: 'child' }, { class: 'cat', confidence: 0.7 }], { vision: { source: 'M', detections: [{ class: 'person', confidence: 0.9, age_group: 'child' }, { class: 'cat', confidence: 0.7 }], age_classifier: { status: 'ok' } } })
    const s = summarize([...appendFrom([], st(a)), ...appendFrom([], st(b), new Date())].map((e, i) => ({ ...e, n: i + 1 })))
    expect(s).toMatchObject({ frames: 2, withPerson: 2, withPet: 1, withChildLabel: 1, ageLabelFrames: 1 })
    expect(s.inferMeanMs).toBe(40); expect(s.models).toEqual(['yolov8n.pt · f59b3d833e'])
  })
  it('a blocked camera is counted as a fault, not as an empty frame', () => {
    const e = appendFrom([], st(obs('f1', [], { event_type: 'camera_status', camera_status: 'BLOCKED', vision: undefined }), 1, { risk_level: 'ERROR', decision_current: false }))
    expect(summarize(e)).toMatchObject({ cameraFaults: 1, withPerson: 0, notCurrent: 1 })
  })
  it('exports JSONL with a meta line and a disclaimer, and CSV with escaped cells', () => {
    const l = appendFrom([], st(obs('f,1', [{ class: 'dog', confidence: 0.8 }])))
    const lines = toJsonl(l).trim().split('\n').map((x) => JSON.parse(x))
    expect(lines[0]).toMatchObject({ type: 'meta', source: 'HOSTED_SIMULATION' }); expect(lines[0].disclaimer).toMatch(/không phải độ chính xác/); expect(lines[1].type).toBe('entry')
    const csv = toCsv(l); expect(csv.split('\n')[0]).toContain('person,dog,cat'); expect(csv).toContain('"f,1"')
  })
})
