import { describe, expect, it } from 'vitest'
import { fanFromX, fanLevel, FAN_MAX } from './VinfastClimatePanel'
import { hueAt } from './VinfastSettings'

describe('climate fan arc', () => {
  it('maps the pointer to 0..6 and clamps outside the arc', () => {
    expect(fanFromX(100, 100, 600)).toBe(0); expect(fanFromX(700, 100, 600)).toBe(FAN_MAX); expect(fanFromX(400, 100, 600)).toBe(3)
    expect(fanFromX(-50, 100, 600)).toBe(0); expect(fanFromX(9999, 100, 600)).toBe(FAN_MAX); expect(fanFromX(10, 0, 0)).toBe(0)
  })
  it('a blower that is off shows 0; the store range 1..10 is clamped to the 0..6 arc', () => {
    expect(fanLevel(false, 5)).toBe(0); expect(fanLevel(true, 9)).toBe(FAN_MAX); expect(fanLevel(true, 0)).toBe(1); expect(fanLevel(true, 3)).toBe(3)
  })
})

describe('colour wheel', () => {
  it('measures hue clockwise from the left edge like the source wheel (red left, yellow up-left, blue bottom)', () => {
    expect(hueAt(-1, 0)).toBe(0); expect(hueAt(0, -1)).toBe(90); expect(hueAt(1, 0)).toBe(180); expect(hueAt(0, 1)).toBe(270)
  })
})
