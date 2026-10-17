import { describe, expect, it } from 'vitest'
import { buildSensor, deriveView, friendlyError, mergeState } from './view'
import type { ServerState } from './types'

const base = (over: Partial<ServerState> = {}): ServerState => ({
  vehicle_id: 'DEMO_a', session_id: 'a', revision: 5, risk_level: 'CRITICAL', previous_risk_level: 'WARNING', rule_id: 'HOT_OCCUPANT',
  reason: 'Living being detected in hot parked cabin', occupancy_state: 'PRESENT', occupancy_reason_code: 'OCCUPANT_CONFIRMED', evidence_conflicts: [],
  incident_id: 'i1', incident: null, alert: null, data_quality: { status: 'CURRENT', issues: [] }, decision_current: true, evaluated_at: '', camera_status: 'OK',
  sensor_snapshot: null, detected_objects: [], action_results: [], action_ledger: [], unlock_request: null,
  freshness: { as_of: '', sensor: { status: 'FRESH', age_s: 1, observed_at: '' }, vision: { status: 'FRESH', age_s: 1, observed_at: '' } },
  simulation: { vehicle_source: 'SIMULATED', action_mode: 'SIMULATED', vision_source: 'MODEL_INFERENCE', runtime: 'HOSTED_SIMULATION' },
  ttl_s: { sensor: 5, vision: 3 }, server_time: '', last_observation: null, model: { ready: true }, ...over,
})

describe('deriveView never invents safety', () => {
  it('no session, no state and a lost link are all unknown, never ok', () => {
    expect(deriveView({ hasSession: false, state: null, connection: 'ok' }).tone).toBe('unknown')
    expect(deriveView({ hasSession: true, state: null, connection: 'ok' }).tone).toBe('unknown')
    expect(deriveView({ hasSession: true, state: null, connection: 'lost' }).kind).toBe('waiting')
  })
  it('a lost link keeps the last committed text but marks it as old and unknown', () => {
    const v = deriveView({ hasSession: true, state: base({ risk_level: 'SAFE', rule_id: 'EMPTY_CABIN' }), connection: 'lost' })
    expect(v.kind).toBe('last-known'); expect(v.current).toBe(false); expect(v.tone).toBe('unknown'); expect(v.headline).toMatch(/cũ/)
  })
  it('stale evidence is not current even when the backend risk is SAFE', () => {
    const v = deriveView({ hasSession: true, state: base({ risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', decision_current: false }), connection: 'ok' })
    expect(v.kind).toBe('stale'); expect(v.current).toBe(false)
  })
  it('SAFE from "nothing detected" always carries the empty-cabin caution and never says "an toàn"', () => {
    const v = deriveView({ hasSession: true, state: base({ risk_level: 'SAFE', rule_id: 'EMPTY_CABIN' }), connection: 'ok' })
    expect(v.caution).toMatch(/không có nghĩa là xe trống/); expect(v.headline.toLowerCase()).not.toContain('an toàn')
  })
  it('ERROR is shown as unverified, not as ok', () => {
    expect(deriveView({ hasSession: true, state: base({ risk_level: 'ERROR', rule_id: 'CAMERA_UNAVAILABLE' }), connection: 'ok' }).tone).toBe('unknown')
  })
  it('CRITICAL maps to critical', () => {
    const v = deriveView({ hasSession: true, state: base(), connection: 'ok' })
    expect(v.tone).toBe('critical'); expect(v.current).toBe(true); expect(v.revision).toBe(5)
  })
})

describe('mergeState', () => {
  it('ignores an older revision and a late reply', () => {
    const a = base({ revision: 7 }); const b = base({ revision: 6, risk_level: 'SAFE' })
    expect(mergeState(a, b)).toBe(a); expect(mergeState(a, base({ revision: 7 })).revision).toBe(7)
  })
  it('a new session replaces whatever was shown', () => {
    expect(mergeState(base({ revision: 9 }), base({ session_id: 'b', revision: 1 })).session_id).toBe('b')
  })
})

describe('buildSensor', () => {
  const v = { gear: 'P' as const, speedKph: 0, locked: true, climateEnabled: false, cabinTemperature: 37.46, batteryLevel: 64.6, windows: { a: 'closed' as const, b: 'vent' as const } }
  it('carries vehicle facts only', () => {
    const s = buildSensor(v, { engineOn: false, driverPresent: false, radar: false, mode: 'NONE', hvacFault: false })
    expect(s).toMatchObject({ temperature: 37.5, engine_status: 'OFF', doors_locked: true, hvac_status: 'INACTIVE', window_status: 'VENTED', battery_soc_pct: 65 })
    expect(Object.keys(s).some((k) => /risk|occup|child|label/i.test(k))).toBe(false)
  })
  it('reports a climate fault explicitly', () => {
    expect(buildSensor({ ...v, climateEnabled: true }, { engineOn: true, driverPresent: true, radar: true, mode: 'PET', hvacFault: true }).hvac_status).toBe('FAULT')
  })
})

describe('friendlyError', () => {
  it('translates known rejections and passes unknown text through', () => {
    expect(friendlyError('Fresh, consistent empty-cabin evidence is required')).toMatch(/Chưa xác nhận/)
    expect(friendlyError('boom')).toBe('boom')
  })
})
