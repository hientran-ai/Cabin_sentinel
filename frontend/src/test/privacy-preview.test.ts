import { describe, expect, it } from 'vitest'
import * as preview from '../api/privacyPreview'

const now = Date.parse('2026-10-03T12:00:00Z')
const sample = () => ({
  frame: { sequence: 3, captured_at: new Date(now).toISOString(), width: 640, height: 480 },
  preview: { status: 'PROCESSED', method: 'YUNET_SOFT_OVAL', sequence: 3,
    captured_at: new Date(now).toISOString(), width: 640, height: 480,
    detected_faces: 1, masked_regions: 1, data_url: 'data:image/jpeg;base64,YWJj' },
})

describe('processed camera preview admission', () => {
  it('accepts only the processed image belonging to the current frame', () => {
    expect(preview.getPrivacyPreview(sample(), now)?.data_url).toBe('data:image/jpeg;base64,YWJj')
  })
  it.each([
    { preview: undefined },
    { preview: { ...sample().preview, status: 'UNAVAILABLE' } },
    { preview: { ...sample().preview, sequence: 2 } },
    { preview: { ...sample().preview, captured_at: new Date(now - 1).toISOString() } },
    { preview: { ...sample().preview, width: 800 } },
    { preview: { ...sample().preview, data_url: 'https://example.org/raw.jpg' } },
    { preview: { ...sample().preview, data_url: 'data:image/svg+xml;base64,YWJj' } },
    { preview: { ...sample().preview, detected_faces: -1 } },
  ])('withholds mismatched, missing or untrusted image without a raw fallback', changes => {
    expect(preview.getPrivacyPreview({ ...sample(), ...changes }, now)).toBeUndefined()
  })
  it('withholds stale and future captures', () => {
    expect(preview.getPrivacyPreview(sample(), now + 3001)).toBeUndefined()
    expect(preview.getPrivacyPreview(sample(), now - 1)).toBeUndefined()
  })
})
