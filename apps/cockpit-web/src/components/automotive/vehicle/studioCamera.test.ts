import { describe, expect, it } from 'vitest'
import { SPEC, gapToRect, solveStudioCamera } from './studioCamera'

/** A car-sized box with tyres on y=0, centred on the origin, +X forward (L = 4.35). */
function carCloud(L = 4.35, W = 1.9, H = 1.5) {
  const pts: number[] = []
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) for (const y of [0, 0.4, H]) for (const z of [-W / 2, W / 2]) pts.push(-L / 2 + (L * i) / 8, y, z + 0 * j)
  return new Float32Array(pts)
}

describe('studio camera fit (HMI V6 section 5 and 7)', () => {
  for (const [w, h] of [[1872, 1008], [1872, 888], [1248, 568]] as const) {
    it(`reaches footprint, width and horizon targets at ${w}x${h}`, () => {
      const f = solveStudioCamera(w, h, 4.35, carCloud())
      const T = SPEC.target
      expect(f.achieved.footprintX).toBeCloseTo(T.footprintX, 2)
      expect(f.achieved.footprintY).toBeCloseTo(T.footprintY, 2)
      expect(Math.abs(f.achieved.widthFrac - T.width)).toBeLessThanOrEqual(SPEC.tol.width)
      expect(Math.abs(f.achieved.horizonY - T.horizon)).toBeLessThanOrEqual(SPEC.tol.horizon)
      expect(f.polarDeg).toBeGreaterThanOrEqual(SPEC.polarMinDeg)
      expect(f.polarDeg).toBeLessThanOrEqual(SPEC.polarMaxDeg)
      expect(f.distance).toBeGreaterThanOrEqual(SPEC.distMinL * 4.35)
      expect(f.distance).toBeLessThanOrEqual(SPEC.distMaxL * 4.35)
    })
  }

  it('reports what the unmodified 78 degree seed camera gives (horizon far from 50%)', () => {
    const f = solveStudioCamera(1872, 1008, 4.35, carCloud())
    expect(f.strict.polarDeg).toBe(78)
    expect(f.strict.withoutShift.horizonY).toBeLessThan(0.3)
  })

  it('keeps the clearance to the cabin card by using the width tolerance, and reports it', () => {
    const card = { x: 32, y: 462, w: 320, h: 154, gap: 16 }
    const f = solveStudioCamera(1248, 568, 4.35, carCloud(), card)
    expect(f.achieved.widthFrac).toBeGreaterThanOrEqual(SPEC.target.width - SPEC.tol.width - 1e-6)
    if (f.gapToCard !== undefined && f.gapToCard < card.gap) expect(f.deviations.some((d) => d.startsWith('CONFLICT'))).toBe(true)
    expect(gapToRect(f, 1248, 568, carCloud(), card)).toBeCloseTo(f.gapToCard ?? 0, 3)
  })
})
