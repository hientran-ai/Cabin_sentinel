import { describe, expect, it } from 'vitest'
import { translator } from './i18n'

describe('Owner Web locale resources', () => {
  it('provides Vietnamese and English labels for the complete demo flow', () => {
    const vi = translator('vi')
    const en = translator('en')
    for (const key of ['overview', 'events', 'demoCritical', 'demoActionFailure', 'demoDisclosure'] as const) {
      expect(vi(key)).toBeTruthy()
      expect(en(key)).toBeTruthy()
      expect(vi(key)).not.toBe(en(key))
    }
  })
})
