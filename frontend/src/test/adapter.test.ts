import { describe, expect, it } from 'vitest'
import { adaptAgentState, adaptBackendState, adaptDemoResponse } from '../api/adapter'

describe('adaptAgentState', () => {
  it('maps snake_case backend payloads into the frontend contract', () => {
    const state = adaptAgentState({
      event_id: 'evt-1', risk_state: 'warning', rule_id: 'R-12', reason: 'Occupant detected',
      camera_status: 'ok', sensor_state: { temperature_c: 32.5, engine: 'off', doors_locked: true },
      duration_seconds: 42, internet_available: true, data_age_ms: 250,
      acknowledgement_status: 'PENDING', objects: [], tool_results: [],
    })
    expect(state).toMatchObject({
      eventId: 'evt-1', riskState: 'WARNING', ruleId: 'R-12', cameraStatus: 'OK',
      sensors: { temperatureC: 32.5, engine: 'OFF', doorsLocked: true }, dataAgeMs: 250,
    })
  })

  it('fails closed to ERROR for unknown risk and camera values', () => {
    const state = adaptAgentState({ status: 'unknown', camera_status: 'unknown' })
    expect(state.riskState).toBe('ERROR')
    expect(state.cameraStatus).toBe('NO_FEED')
  })

  it('drops malformed objects and tool results instead of crashing components', () => {
    const state = adaptAgentState({
      risk_state: 'CRITICAL', camera_status: 'OK',
      sensors: { doors_locked: 'false' },
      objects: [{ class: 'person', confidence: 4, bbox: [1, 2] }, { class: 'unknown', confidence: 0.9, bbox: [1, 2, 3, 4] }],
      tool_results: [{ action: 'DELETE_EVENT', status: 'SUCCESS' }, { action: 'SEND_SMS', status: 'BOGUS' }],
    })
    expect(state.objects).toEqual([])
    expect(state.toolResults).toEqual([])
    expect(state.sensors.doorsLocked).toBe(false)
    expect(state.dataAgeMs).toBe(3001)
  })

  it('maps the committed CabinService state without inventing actions or bbox data', () => {
    const state = adaptBackendState({
      vehicle_id: 'CAR_1', revision: 7, incident_id: 'incident-7', risk_level: 'CRITICAL',
      rule_id: 'HOT_OCCUPANT', reason: 'Living being remains in hot vehicle',
      temperature: 40, engine_status: 'UNKNOWN', doors_locked: true, camera_status: 'OK',
      detected_objects: [{ class_name: 'dog', confidence: 0.91 }],
      action_results: [
        { tool: 'trigger_horn', status: 'simulated' },
        { tool: 'request_unlock', status: 'pending_human_confirmation' },
      ],
      evaluated_at: '2026-09-30T01:00:00Z', decision_current: false,
      freshness: { vision: { status: 'STALE', age_s: 4.2 }, sensor: { status: 'FRESH', age_s: 1 } },
    })
    expect(state).toMatchObject({
      vehicleId: 'CAR_1', eventId: 'incident-7', riskState: 'CRITICAL',
      sensors: { temperatureC: 40, engine: 'UNKNOWN', doorsLocked: true },
      dataAgeMs: 4200,
    })
    expect(state.objects[0]).toMatchObject({ class: 'dog', confidence: 0.91, bbox: [0, 0, 0, 0] })
    expect(state.toolResults.map((tool) => [tool.action, tool.status])).toEqual([
      ['TRIGGER_HORN', 'SIMULATED'], ['REQUEST_UNLOCK', 'PENDING_CONFIRMATION'],
    ])
  })

  it('maps the synchronous demo response into AgentState', () => {
    const state = adaptDemoResponse({
      session_id: 'demo-1',
      vision: { source: 'MODEL_INFERENCE', detections: [{ class: 'person', confidence: 0.88 }], latency_ms: 25 },
      vehicle_state: { vehicle_id: 'DEMO_demo-1', timestamp: '2026-09-30T01:00:00Z', temperature: 40, engine_status: 'OFF', doors_locked: true, scenario: 'hot_locked' },
      reasoning: { revision: 2, risk_level: 'CRITICAL', rule_id: 'HOT_OCCUPANT', reason: 'Hot occupied cabin', decision_current: true, freshness: { vision: { status: 'FRESH', age_s: 0.1 }, sensor: { status: 'FRESH', age_s: 0.2 } } },
      actions: [{ tool: 'send_sms', status: 'simulated' }],
    })
    expect(state).toMatchObject({ vehicleId: 'DEMO_demo-1', eventId: 'demo-1', riskState: 'CRITICAL', ruleId: 'HOT_OCCUPANT' })
    expect(state.toolResults[0]).toMatchObject({ action: 'SEND_SMS', status: 'SIMULATED' })
  })
})
