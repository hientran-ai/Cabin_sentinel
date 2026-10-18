import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type Session } from './api'
import { petCareAvailable, startCareProfile, startPetCare } from './petCare'
import { useE2e } from './store'
import type { CareView, ServerState } from './types'

const care = (over: Partial<CareView> = {}) => ({ status: 'IDLE', profile: 'UNKNOWN', can_start: true, ...over }) as unknown as CareView

beforeEach(() => { useE2e.setState({ session: { id: 's1', token: 't' } as Session, state: { care: care() } as unknown as ServerState }) })
afterEach(() => { vi.restoreAllMocks(); useE2e.setState({ session: null, state: null }) })

describe('phone pet button', () => {
  it('is offered only when care can start and is not already running', () => {
    expect(petCareAvailable(care())).toBe(true)
    expect(petCareAvailable(care({ can_start: false }))).toBe(false)
    expect(petCareAvailable(care({ status: 'ACTIVE' }))).toBe(false)
    expect(petCareAvailable(undefined)).toBe(false)
  })
  it('declares PET from the phone, then starts the PET plan, in that order', async () => {
    const calls: string[] = []
    vi.spyOn(api, 'careDeclare').mockImplementation(async (_s, occupant, surface) => { calls.push(`declare:${occupant}:${surface}`); return {} as CareView })
    vi.spyOn(api, 'careStart').mockImplementation(async (_s, body, surface) => { calls.push(`start:${body.profile}:${surface}`); return {} as CareView })
    vi.spyOn(api, 'state').mockRejectedValue(new Error('poll off')); vi.spyOn(api, 'notifications').mockRejectedValue(new Error('poll off')); vi.spyOn(api, 'history').mockRejectedValue(new Error('poll off'))
    const r = await startPetCare()
    expect(r.ok).toBe(true)
    expect(calls).toEqual(['declare:PET:PHONE', 'start:PET:PHONE'])
  })
  it('does not start the plan when declaring fails', async () => {
    vi.spyOn(api, 'careDeclare').mockRejectedValue(new Error('offline'))
    const start = vi.spyOn(api, 'careStart')
    vi.spyOn(api, 'state').mockRejectedValue(new Error('poll off')); vi.spyOn(api, 'notifications').mockRejectedValue(new Error('poll off')); vi.spyOn(api, 'history').mockRejectedValue(new Error('poll off'))
    const r = await startPetCare()
    expect(r.ok).toBe(false)
    expect(start).not.toHaveBeenCalled()
  })
  it('starts a child mode with its music, and drops music for a pet', async () => {
    const calls: string[] = []
    vi.spyOn(api, 'careDeclare').mockImplementation(async (_s, occupant) => { calls.push(`declare:${occupant}`); return {} as CareView })
    vi.spyOn(api, 'careStart').mockImplementation(async (_s, body) => { calls.push(`start:${body.profile}:${body.music ?? '-'}`); return {} as CareView })
    vi.spyOn(api, 'state').mockRejectedValue(new Error('poll off')); vi.spyOn(api, 'notifications').mockRejectedValue(new Error('poll off')); vi.spyOn(api, 'history').mockRejectedValue(new Error('poll off'))
    await startCareProfile('CHILD', 'twinkle'); await startCareProfile('PET', 'twinkle')
    expect(calls).toEqual(['declare:CHILD', 'start:CHILD:twinkle', 'declare:PET', 'start:PET:-'])
  })
})
