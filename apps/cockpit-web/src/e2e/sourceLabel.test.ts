import { describe, expect, it } from 'vitest'
import { normalizeSourceLabel } from './capture'

describe('source label metadata follows the existing API contract', () => {
  it('removes punctuation rejected by the API while retaining readable Vietnamese text', () => {
    expect(normalizeSourceLabel('DEMO-01 Cabin trống, có người bên ngoài')).toBe('DEMO-01 Cabin trống có người bên ngoài')
  })
  it('limits metadata length to the backend contract', () => {
    expect(normalizeSourceLabel('a'.repeat(100))).toHaveLength(64)
  })
})
