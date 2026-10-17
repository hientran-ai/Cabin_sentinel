import { describe, expect, it } from 'vitest'
import { allowFigmaReference } from './reference'

// Removing the playground gate must fail: fixture text must not hide the live backend cabin chip.
describe('Figma reference presentation boundary', () => {
  it.each([
    ['?mode=playground&reference=1', true],
    ['?view=cockpit&reference=1', false],
    ['?reference=1', false],
    ['?mode=playground', false],
  ])('%s permits reference = %s', (search, allowed) => {
    expect(allowFigmaReference(search)).toBe(allowed)
  })
})
