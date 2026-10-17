import { describe, expect, it } from 'vitest'
import { fitVinfast, REGIONS, region, VF_ARTBOARD_REM } from './layout'
import { isTap, swipeDismiss } from './gesture'

describe('geometry', () => {
  it('source-labelled sizes match Aurora A06', () => {
    const size = (id: string) => [region(id).w, region(id).h]
    expect(size('status')).toEqual([1920, 64]); expect(size('airbag')).toEqual([196, 64]); expect(size('ipc')).toEqual([584, 245])
    expect(size('prompt')).toEqual([584, 132]); expect(size('rail')).toEqual([96, 575]); expect(size('navigation')).toEqual([632, 856])
    expect(size('multimedia')).toEqual([632, 416]); expect(size('climate')).toEqual([1632, 112]); expect(size('quick')).toEqual([144, 112]); expect(size('library')).toEqual([144, 112])
  })
  it('every region stays inside the 1920 x 1080 canvas', () => {
    for (const r of REGIONS) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(1920); expect(r.y + r.h).toBeLessThanOrEqual(1080) }
  })
  it('status, content and the bottom row tile the canvas height without overlap', () => {
    expect(region('status').h + 904 + region('climate').h).toBe(1080)
    expect(region('climate').x).toBe(region('quick').w); expect(region('climate').x + region('climate').w).toBe(region('library').x)
  })
  it('widgets that must stay visible together do not overlap', () => {
    const a = region('navigation'), b = region('multimedia'), c = region('launcher'), n = region('notification'), r = region('rail')
    const hit = (p: typeof a, q: typeof a) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
    expect(hit(a, b)).toBe(false); expect(hit(b, c)).toBe(false); expect(hit(n, r)).toBe(false); expect(hit(a, n)).toBe(false)
  })
  it('artboard is 16:9 in rem for the demo page', () => { expect(VF_ARTBOARD_REM.w / VF_ARTBOARD_REM.h).toBeCloseTo(16 / 9, 5) })
})

describe('fitVinfast keeps the aspect ratio', () => {
  it.each([[1920, 1080, 1], [1600, 900, 1600 / 1920], [1280, 720, 1280 / 1920]])('%d x %d', (w, h, s) => {
    const f = fitVinfast(w, h); expect(f.scale).toBeCloseTo(s, 6); expect(f.x).toBeCloseTo(0, 6); expect(f.y).toBeCloseTo(0, 6)
  })
  it('letterboxes instead of stretching', () => {
    const f = fitVinfast(1920, 1200); expect(f.scale).toBe(1); expect(f.y).toBe(60)
    const g = fitVinfast(1000, 1080); expect(g.scale).toBeCloseTo(1000 / 1920, 6)
  })
  it('a zero-size container does not produce NaN', () => { expect(fitVinfast(0, 0).scale).toBe(0) })
})

describe('swipe boundary', () => {
  it('dismisses at 96 px and not at 95 px with no velocity', () => { expect(swipeDismiss(96, 0)).toBe(true); expect(swipeDismiss(95, 0)).toBe(false) })
  it('dismisses a flick at .65 px/ms but not .64', () => { expect(swipeDismiss(40, 650)).toBe(true); expect(swipeDismiss(40, 640)).toBe(false) })
  it('a tiny jitter with high velocity never dismisses, wrong direction never dismisses', () => { expect(swipeDismiss(5, 2000)).toBe(false); expect(swipeDismiss(-200, 2000)).toBe(false); expect(swipeDismiss(NaN, 1)).toBe(false) })
  it('a swipe is not a tap', () => { expect(isTap(3, 120)).toBe(true); expect(isTap(40, 120)).toBe(false); expect(isTap(2, 900)).toBe(false) })
})
