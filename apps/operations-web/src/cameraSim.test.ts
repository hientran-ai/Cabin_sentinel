import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { V1VideoFrameResult } from '@cabinsentinel/contracts'
import { SAMPLES, boxFromDrag, expectation, nextZoneName, percentile, sampleUrl, summarize } from './cameraSim'

const result = (risk: string, camera: V1VideoFrameResult['camera_status'] = 'OK') => ({ risk_level: risk, camera_status: camera }) as V1VideoFrameResult

describe('camera simulator helpers', () => {
  it('ships zones a backend calibration accepts: seats first, glass never over half a seat', () => {
    for (const sample of SAMPLES) {
      const seats = sample.zones.filter(z => z.kind === 'seat')
      const glass = sample.zones.filter(z => z.kind === 'exclude')
      expect(seats.length).toBeGreaterThan(0)
      expect(glass.reduce((sum, z) => sum + (z.box[2] - z.box[0]) * (z.box[3] - z.box[1]), 0)).toBeLessThanOrEqual(0.5)
      for (const s of seats) {
        const area = (s.box[2] - s.box[0]) * (s.box[3] - s.box[1])
        const hidden = glass.reduce((sum, g) => {
          const w = Math.min(s.box[2], g.box[2]) - Math.max(s.box[0], g.box[0])
          const h = Math.min(s.box[3], g.box[3]) - Math.max(s.box[1], g.box[1])
          return sum + (w > 0 && h > 0 ? w * h : 0)
        }, 0)
        expect(hidden).toBeLessThanOrEqual(area * 0.5)
      }
      expect(new Set(sample.zones.map(z => z.name)).size).toBe(sample.zones.length)
    }
    expect(sampleUrl('ai-child', '/admin/')).toBe('/admin/samples/ai-child.mp4')
    expect(sampleUrl('empty-cabin-ref.jpg', '/admin/')).toBe('/admin/samples/empty-cabin-ref.jpg')
    for (const sample of SAMPLES) {
      expect(existsSync(`public/samples/${sample.video}.mp4`)).toBe(true)
      if (sample.reference) expect(existsSync(`public/samples/${sample.reference}`)).toBe(true)
      expect(sample.zones.every(z => z.kind === 'seat' || (!z.child_seat && !z.detail))).toBe(true)
    }
    const rearFacing = SAMPLES.find(s => s.id === 'rear-facing')!
    expect(rearFacing.occupant).toBe(true)
    expect(rearFacing.zones.some(z => z.child_seat === 'rear_facing')).toBe(true)
  })

  it('turns a drag into an ordered, clamped box and ignores a click', () => {
    expect(boxFromDrag({ x: 0.6, y: 0.9 }, { x: 0.2, y: 1.3 })).toEqual([0.2, 0.9, 0.6, 1])
    expect(boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.6 })).toBeNull()
    expect(nextZoneName([{ name: 'seat_1', kind: 'seat', box: [0, 0, 1, 1] }], 'seat')).toBe('seat_2')
    expect(nextZoneName([], 'exclude')).toBe('glass_1')
  })

  it('reports percentiles, drops and time to the first alert', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
    const m = summarize([
      { sentAt: 0, doneAt: 300, outcome: 'ok', serverMs: 120, inferenceMs: 90 },
      { sentAt: 400, doneAt: 900, outcome: 'ok', serverMs: 140, inferenceMs: 110 },
      { sentAt: 800, doneAt: 1000, outcome: 'late' },
      { sentAt: 1200, doneAt: 1300, outcome: 'failed' },
    ], 0, 2_500, 2_000)
    expect(m).toMatchObject({ sent: 4, ok: 2, late: 1, failed: 1, firstAlertMs: 2_500 })
    expect(m.roundTrip).toEqual({ p50: 300, p95: 500 })
    expect(m.inference.p50).toBe(90)
  })

  it('compares the verdict with what a person sees, and a camera fault is neither pass nor fail', () => {
    expect(expectation(true, undefined)).toBe('pending')
    expect(expectation(true, result('WARNING'))).toBe('pass')
    expect(expectation(true, result('SAFE'))).toBe('fail')
    expect(expectation(false, result('SAFE'))).toBe('pass')
    expect(expectation(false, result('CRITICAL'))).toBe('fail')
    expect(expectation(true, result('ERROR', 'BLOCKED'))).toBe('camera')
  })
})
