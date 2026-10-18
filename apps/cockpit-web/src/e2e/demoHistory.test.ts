import { describe, expect, it } from 'vitest'
import './phone/demo-history.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D = (globalThis as any).__demoHistory
const NOW = Date.UTC(2026, 9, 18, 5, 0, 0) / 1000

describe('simulated sample history for judges', () => {
  const rows = D.build(NOW, 30)
  it('has alerts, camera, offline and test-video rows, newest first, all marked simulated', () => {
    expect(new Set(rows.map((r: any) => r.kind))).toEqual(new Set(['left_behind', 'camera_blocked', 'device_offline', 'replay']))
    expect(rows.every((r: any) => r.basis === 'simulated' && r.sealed === false && r.id.startsWith('demo-'))).toBe(true)
    expect(rows.map((r: any) => r.started_at)).toEqual([...rows.map((r: any) => r.started_at)].sort((a: number, b: number) => b - a))
  })
  it('respects the day range', () => {
    expect(D.build(NOW, 7).every((r: any) => r.started_at >= NOW - 7 * 86400)).toBe(true)
    expect(D.build(NOW, 30).length).toBeGreaterThan(D.build(NOW, 7).length)
  })
  it('incidents match the alert rows and never invent an open or manually closed one', () => {
    const inc = D.incidents(NOW)
    expect(inc).toHaveLength(D.ALERT_COUNT)
    expect(inc.every((i: any) => i.status === 'resolved' && i.basis === 'simulated' && i.id.startsWith('demo-inc-'))).toBe(true)
    const s = D.stats(rows); expect(s.left_behind).toBe(D.ALERT_COUNT); expect(s.open).toBe(0); expect(s.manual_close).toBe(0); expect(s.basis).toEqual(['simulated'])
  })
  it('summary has a bar per day, a coverage below 100 % because of camera/offline gaps, labelled simulated', () => {
    const sm = D.summary(NOW, 7, 420, D.build(NOW, 90), [])
    expect(sm.days).toHaveLength(7); expect(sm.days[6].today).toBe(true)
    expect(sm.days.some((d: any) => d.worst === 'critical')).toBe(true)
    expect(sm.coverage.basis).toBe('simulated'); expect(sm.coverage.pct).toBeLessThan(100); expect(sm.coverage.pct).toBeGreaterThan(90)
    expect(D.summary(NOW, 30, 420, D.build(NOW, 90), []).days).toHaveLength(30)
    expect(D.summary(NOW, 90, 420, D.build(NOW, 90), []).days).toHaveLength(13)
  })
  it('a live open incident shows up in the strip next to the sample ones', () => {
    const live = [{ id: 'live', level: 'critical', status: 'open', created_at: NOW - 600 }]
    const today = D.summary(NOW, 7, 420, rows, live).days[6]
    expect(today.incidents).toBeGreaterThanOrEqual(1); expect(today.open).toBe(1); expect(today.worst).toBe('critical')
  })
  it('observations are counts only, never images, and keep their gaps', () => {
    const o = D.observations(NOW, 24)
    expect(o.items.length).toBeGreaterThan(60); expect(o.items.length).toBeLessThan(96)
    expect(Object.keys(o.items[0]).some((k: string) => /image|photo|frame|face/.test(k))).toBe(false)
    expect(o.items.some((i: any) => i.pets > 0)).toBe(true)
  })
  it('CSV has the Noir header, one line per row and escapes commas', () => {
    const lines = D.csv(rows).trim().split('\n')
    expect(lines[0]).toBe('loai,bat_dau,ket_thuc,thoi_luong_giay,ghe,muc_do,ket_qua,nguon_so_lieu,giay_den_khi_xem,giay_den_khi_gui_tin,ma_su_co,da_niem_phong')
    expect(lines).toHaveLength(rows.length + 1); expect(lines.every((l: string) => l.split(',').length === 12)).toBe(true)
    expect(lines.some((l: string) => l.includes('simulated'))).toBe(true)
  })
})
