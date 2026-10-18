import { describe, expect, it } from 'vitest'
// @ts-ignore plain JS module shared with the phone UI (no type declarations)
import { DEFAULT_MODES, dueModes, loadModes, loadProfiles, presetFor, profileLine, sanitizeMode, sanitizeProfile, saveProfiles, scheduleMatches, startArgs } from './phone/modesLogic.js'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => (m.has(k) ? m.get(k) : null), setItem: (k: string, v: unknown) => m.set(k, String(v)) } }
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi)          // 2026-10-19 is a Monday, 2026-10-18 a Sunday

describe('profiles', () => {
  it('a 2 year old child gets 24 °C and a lullaby, a dog gets 23 °C and no music', () => {
    expect(presetFor({ kind: 'CHILD', age: 2 })).toMatchObject({ temp: 24, music: 'twinkle' })
    expect(presetFor({ kind: 'PET' })).toMatchObject({ temp: 23, music: 'off', volume: 0 })
  })
  it('clamps values and keeps only known music ids', () => {
    const p = sanitizeProfile({ kind: 'CHILD', name: '  Na  ', age: 99, temp: 50, volume: -5, music: 'evil' })
    expect(p).toMatchObject({ name: 'Na', age: 17, temp: 28, volume: 0, music: 'off' })
    expect(sanitizeProfile({ kind: 'PET', temp: 5, music: 'twinkle' })).toMatchObject({ temp: 20, music: 'off' })
  })
  it('keeps a photo only when it is a small local JPEG data URL and was consented to', () => {
    const jpeg = 'data:image/jpeg;base64,AAAA'
    expect(sanitizeProfile({ kind: 'CHILD', photo: jpeg, photo_consent: true })).toMatchObject({ photo: jpeg, photo_consent: true })
    expect(sanitizeProfile({ kind: 'CHILD', photo: jpeg })).toMatchObject({ photo: jpeg, photo_consent: false })
    expect(sanitizeProfile({ kind: 'CHILD', photo: 'https://example.com/a.jpg' }).photo).toBeNull()
    expect(sanitizeProfile({ kind: 'CHILD', photo: 'data:image/jpeg;base64,' + 'A'.repeat(70000) }).photo).toBeNull()
  })
  it('round-trips through storage and survives corrupt data', () => {
    const st = mem(); saveProfiles(st, [{ kind: 'PET', name: 'Mực', breed: 'Corgi', age: 3 }])
    expect(loadProfiles(st)).toHaveLength(1); expect(profileLine(loadProfiles(st)[0])).toBe('Corgi · 3 tuổi · 23 °C')
    st.setItem('cs.profiles.v1', '{oops'); expect(loadProfiles(st)).toEqual([])
  })
})

describe('modes and schedule', () => {
  it('only the profile kind and a music id are ever sent to the backend', () => {
    const [pickup, pet, camp] = (DEFAULT_MODES() as unknown[]).map((m) => sanitizeMode(m))
    expect(startArgs(pickup)).toEqual({ profile: 'CHILD', music: 'twinkle' })
    expect(startArgs(pet)).toEqual({ profile: 'PET', music: undefined })
    expect(startArgs({ ...camp, music: 'off' })).toEqual({ profile: 'ADULT', music: undefined })
    expect(Object.keys(startArgs(pickup)).sort()).toEqual(['music', 'profile'])
  })
  it('falls back to defaults when nothing is stored', () => {
    expect(loadModes(mem()).map((m: { name: string }) => m.name)).toEqual(['Đón bé', 'Đi cùng thú cưng', 'Cắm trại'])
  })
  it('a schedule is off by default and matches only inside its window on its days', () => {
    const m = sanitizeMode({ ...DEFAULT_MODES()[0] })
    expect(scheduleMatches(m, at(2026, 10, 19, 7, 30))).toBe(false)
    const on = { ...m, schedule: { ...m.schedule, enabled: true } }
    expect(scheduleMatches(on, at(2026, 10, 19, 7, 30))).toBe(true)      // Monday inside 07:00–08:00
    expect(scheduleMatches(on, at(2026, 10, 19, 6, 59))).toBe(false)
    expect(scheduleMatches(on, at(2026, 10, 19, 8, 0))).toBe(false)      // end is exclusive
    expect(scheduleMatches(on, at(2026, 10, 18, 7, 30))).toBe(false)     // Sunday
    expect(dueModes([on, m], at(2026, 10, 19, 7, 30)).map((x: { id: string }) => x.id)).toEqual(['pickup'])
  })
  it('rejects malformed times and unknown days', () => {
    const m = sanitizeMode({ name: 'x', profile: 'CHILD', schedule: { enabled: true, days: [1, 9, 'a', 1], from: '25:99', to: '08:00' } })
    expect(m.schedule).toEqual({ enabled: true, days: [1], from: '07:00', to: '08:00' })
  })
})
