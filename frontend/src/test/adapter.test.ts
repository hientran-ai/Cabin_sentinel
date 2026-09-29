import { describe, expect, it } from 'vitest'
import { adaptAgentState } from '../api/adapter'

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
})
