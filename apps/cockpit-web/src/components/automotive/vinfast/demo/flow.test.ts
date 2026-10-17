import { describe, expect, it } from 'vitest'
import { flowSteps, type FlowInput } from './flow'
import type { NotificationItem, ServerState } from '../../../../e2e/types'

const state = (over: Partial<ServerState> = {}): ServerState => ({
  vehicle_id: 'v', session_id: 's', revision: 4, risk_level: 'CRITICAL', previous_risk_level: null, rule_id: 'HOT_OCCUPANT', reason: '', occupancy_state: 'PRESENT', occupancy_reason_code: '',
  evidence_conflicts: [], incident_id: 'i', incident: { incident_id: 'i', status: 'OPEN', opened_at: '', acknowledged_at: null, resolved_at: null }, alert: null, data_quality: null,
  decision_current: true, evaluated_at: '', camera_status: 'OK', sensor_snapshot: null, detected_objects: [], action_results: [], action_ledger: [], unlock_request: null,
  freshness: { as_of: '', sensor: { status: 'FRESH', age_s: 1, observed_at: '' }, vision: { status: 'FRESH', age_s: 1, observed_at: '' } },
  simulation: { vehicle_source: 'SIMULATED', action_mode: 'SIMULATED', vision_source: 'MODEL_INFERENCE', runtime: 'HOSTED_SIMULATION' }, ttl_s: { sensor: 5, vision: 3 }, server_time: '',
  last_observation: { event_id: 1, event_type: 'observation', frame_id: 'f', accepted: true, observed_at: '', received_at: '' }, model: { ready: true }, ...over,
})
const note = (delivered: boolean): NotificationItem => ({ notification_id: 1, incident_id: 'i', stage: 'INITIAL', sequence: 1, revision: 4, sent_at: '', delivery_mode: '', risk_level: 'CRITICAL', rule_id: null, reason: null,
  channels: { in_app_feed: { state: delivered ? 'IN_APP_DELIVERED' : 'PUBLISHED', delivered_at: delivered ? 'x' : null }, push: { state: 'SIMULATED', provider_accepted: true, os_delivery: '' } } })
const base: FlowInput = { hasSession: true, sourceRunning: true, sourceKind: 'clip', state: null, notifications: [], connection: 'ok' }
const ids = (i: FlowInput) => flowSteps(i).map((s) => `${s.id}:${s.status}`)

describe('flowSteps', () => {
  it('with nothing running the first stage is active and the rest are pending', () => {
    expect(flowSteps({ ...base, hasSession: false, sourceRunning: false, sourceKind: 'none' }).map((s) => s.status)).toEqual(['active', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending'])
  })
  it('a running source alone does not claim the model ran or anything was committed', () => {
    expect(ids(base)).toEqual(['source:done', 'model:active', 'commit:pending', 'cockpit:pending', 'phone:pending', 'ack:pending', 'resolve:pending'])
  })
  it('a revision created only by telemetry (no image yet) is not a committed image decision', () => {
    expect(ids({ ...base, state: state({ last_observation: null }) }).slice(0, 4)).toEqual(['source:done', 'model:active', 'commit:pending', 'cockpit:pending'])
  })
  it('a critical committed state lights the cockpit stage; the phone stage waits for a real delivery receipt', () => {
    expect(ids({ ...base, state: state() })).toEqual(['source:done', 'model:done', 'commit:done', 'cockpit:done', 'phone:active', 'ack:pending', 'resolve:pending'])
    expect(flowSteps({ ...base, state: state(), notifications: [note(false)] })[4]!.status).toBe('active')
    expect(flowSteps({ ...base, state: state(), notifications: [note(true)] })[4]!.status).toBe('done')
  })
  it('acknowledge and resolve come only from the incident record', () => {
    const acked = state({ incident: { incident_id: 'i', status: 'OPEN', opened_at: '', acknowledged_at: 't', resolved_at: null } })
    expect(ids({ ...base, state: acked, notifications: [note(true)] }).slice(5)).toEqual(['ack:done', 'resolve:active'])
    // after the owner resolves, the risk falls back to SAFE: earlier stages must stay done, not regress
    const done = state({ risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', incident: { incident_id: 'i', status: 'RESOLVED', opened_at: '', acknowledged_at: 't', resolved_at: 't2' } })
    expect(flowSteps({ ...base, state: done, notifications: [note(true)] }).every((s) => s.status === 'done')).toBe(true)
  })
  it('stale evidence or a lost link marks the stage as unverifiable (warn), never as a calm done', () => {
    const stale = state({ risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', decision_current: false })
    expect(flowSteps({ ...base, state: stale })[3]!.status).toBe('warn')
    expect(flowSteps({ ...base, state: state({ risk_level: 'SAFE' }), connection: 'lost' })[3]!.status).toBe('warn')
  })
  it('a camera fault is shown on the model stage as unverifiable, never as a calm step', () => {
    const cam = state({ risk_level: 'ERROR', rule_id: 'CAMERA_UNAVAILABLE', last_observation: { event_id: 2, event_type: 'camera_status', frame_id: 'c', accepted: true, observed_at: '', received_at: '', camera_status: 'BLOCKED' } })
    expect(flowSteps({ ...base, state: cam })[1]!.status).toBe('warn')
  })
  it('a calm SAFE result does not light the alert stage', () => {
    expect(flowSteps({ ...base, state: state({ risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', incident: null }) })[3]!.status).toBe('active')
  })
})
