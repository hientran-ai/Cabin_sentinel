import { describe, expect, it } from 'vitest'
import { adaptBackendState } from '../../../frontend/src/api/adapter'
import { ownerSnapshot } from './backendMapping'

describe('Owner Web backend mapping', () => {
  it('keeps the backend verdict but marks a stale SAFE evaluation as historical', () => {
    const state = adaptBackendState({ vehicle_id: 'DEMO_a', revision: 7, risk_level: 'SAFE', decision_current: false,
      reason: 'Historical safe evidence', rule_id: 'EMPTY_CABIN', occupancy_state: 'ABSENT', temperature: 25 })
    const value = ownerSnapshot(state, false)
    expect(value).toMatchObject({ id: 'DEMO_a', riskLevel: 'SAFE', decisionCurrent: false, temperatureC: 25 })
    expect(value.plate).toBe('—')
    expect(value.name).not.toBe('Aurora')
  })
  it('does not invent sensor, location, WebRTC or successful actuator data', () => {
    const value = ownerSnapshot(adaptBackendState({ risk_level: 'ERROR', action_results: [
      { tool: 'request_unlock', status: 'pending_human_confirmation' },
      { tool: 'trigger_horn', status: 'simulated' },
      { tool: 'send_sms', status: 'unknown' },
    ] }), false)
    expect(value.temperatureC).toBeUndefined()
    expect(value.doorsLocked).toBeNull()
    expect(value.actions.map(item => item.status)).toEqual(['PENDING', 'SIMULATED', 'UNKNOWN'])
    expect(value.actions[1]?.detail.vi).toContain('Mô phỏng')
  })
})
