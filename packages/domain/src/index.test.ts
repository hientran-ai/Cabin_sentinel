import { describe, expect, it } from 'vitest'
import { acceptNewerRevision, formatTemperature, isStale, severityPresentation } from './index'

describe('display-only domain helpers', () => {
  it('formats values without deriving a risk level', () => expect(formatTemperature(34.82, 'en')).toBe('34.8°C'))
  it('treats invalid and old timestamps as stale', () => {
    expect(isStale('invalid', 10, 20_000)).toBe(true)
    expect(isStale('1970-01-01T00:00:15.000Z', 10, 20_000)).toBe(false)
  })
  it('rejects duplicate and older revisions', () => {
    expect(acceptNewerRevision(4, 4)).toBe(false)
    expect(acceptNewerRevision(4, 3)).toBe(false)
    expect(acceptNewerRevision(4, 5)).toBe(true)
  })
  it('gives every backend severity a non-color label and icon', () => {
    for (const value of Object.values(severityPresentation)) {
      expect(value.label).toBeTruthy()
      expect(value.icon).toBeTruthy()
    }
  })
})
