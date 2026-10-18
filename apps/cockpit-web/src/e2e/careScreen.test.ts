import { beforeEach, describe, expect, it } from 'vitest'
import { careKeyOf, careScreenVisible, hideCareScreen, showCareScreen, useCareScreen } from './careScreen'
import { useE2e } from './store'
import type { CareView, ServerState } from './types'

const care = (over: Partial<CareView> = {}): CareView => ({
  status: 'ACTIVE', profile: 'CHILD', incident_id: 'i1', auto_consent: false, responded_at: null, started_by: 'COCKPIT_OCCUPANT', started_at: '2026-10-17T10:00:00Z', music: null,
  ended_at: null, ended_by: null, end_reason: null, plan: [], simulated: true, can_start: false, occupancy_evidence: true, target_c: 24, never_resolves_incident: true,
  countdown: { armed: false, remaining_s: null, after_s: 30 }, suggestion: null, notes: [], ...over,
})
const withCare = (c: CareView | undefined) => useE2e.setState({ state: { care: c } as unknown as ServerState })

beforeEach(() => { useCareScreen.setState({ hiddenKey: null }); withCare(undefined) })

describe('care screen can always be left without stopping the mode', () => {
  it('is visible while a mode is active and hidden by "home", while the mode keeps running', () => {
    withCare(care())
    expect(careScreenVisible()).toBe(true)
    hideCareScreen()
    expect(careScreenVisible()).toBe(false)
    expect(useE2e.getState().state?.care?.status).toBe('ACTIVE')
  })
  it('a new care run shows the screen again; the old hidden choice does not stick', () => {
    withCare(care({ started_at: 'a' })); hideCareScreen()
    withCare(care({ started_at: 'b' }))
    expect(careScreenVisible()).toBe(true)
  })
  it('can be reopened from the chip', () => {
    withCare(care()); hideCareScreen(); showCareScreen()
    expect(careScreenVisible()).toBe(true)
  })
  it('nothing to show when no mode is active', () => {
    withCare(care({ status: 'IDLE' }))
    expect(careKeyOf(useE2e.getState().state?.care)).toBeNull(); expect(careScreenVisible()).toBe(false)
  })
})
