import { describe, expect, it } from 'vitest'
import { musicSwipeTarget } from './gesture'

describe('Tesla music sheet swipe', () => {
  it('opens on an upward drag and closes on a downward drag', () => {
    expect(musicSwipeTarget(false, -100, 0)).toBe(true)
    expect(musicSwipeTarget(true, 100, 0)).toBe(false)
  })
  it('accepts a short decisive flick, but ignores a tap and a small wobble', () => {
    expect(musicSwipeTarget(false, -20, -800)).toBe(true)
    expect(musicSwipeTarget(true, 20, 800)).toBe(false)
    expect(musicSwipeTarget(false, -4, 0)).toBe(false)
    expect(musicSwipeTarget(true, 4, 0)).toBe(true)
  })
  it('does not invert an already expanded/collapsed sheet on a repeated swipe', () => {
    expect(musicSwipeTarget(true, -100, -800)).toBe(true)
    expect(musicSwipeTarget(false, 100, 800)).toBe(false)
  })
})
