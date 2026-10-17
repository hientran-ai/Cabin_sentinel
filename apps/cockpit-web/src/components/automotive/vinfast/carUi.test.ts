import { describe, expect, it } from 'vitest'
import { partState, washBlockers } from './carUi'

describe('part state', () => {
  it('closed is neutral, open is open, a fault wins, no data is unknown (never closed)', () => {
    expect(partState(false)).toBe('closed'); expect(partState(true)).toBe('open'); expect(partState(true, true)).toBe('fault')
    expect(partState(undefined)).toBe('unknown'); expect(partState(null)).toBe('unknown')
  })
})
describe('car wash guard', () => {
  const ok = { windows: { a: 'closed' }, doors: { a: false }, chargingPortOpen: false, frontTrunkOpen: false, rearTrunkOpen: false }
  it('allows the mode only when everything is closed', () => { expect(washBlockers(ok)).toEqual([]) })
  it('lists every blocker', () => {
    expect(washBlockers({ ...ok, windows: { a: 'vent' }, chargingPortOpen: true, rearTrunkOpen: true })).toEqual(['Cửa sổ chưa đóng', 'Cổng sạc đang mở', 'Cốp đang mở'])
    expect(washBlockers({ ...ok, doors: { a: true } })).toEqual(['Cửa đang mở'])
  })
})
