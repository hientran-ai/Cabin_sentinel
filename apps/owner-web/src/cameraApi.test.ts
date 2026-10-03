import { describe, expect, it, vi } from 'vitest'
import { CameraApi, CameraApiError, getPrivacyPreview, validateCameraSnapshot, type CameraSnapshot } from './cameraApi'

const snapshot: CameraSnapshot = {
  session_id: 'session-1', session_token: 'token-1', revision: 1, risk_level: 'WARNING',
  rule_id: 'COOL_OCCUPANT', reason: 'Person detected', occupancy_state: 'PRESENT',
  camera_status: 'OK', decision_current: true,
  camera: { requested: 'RUNNING', device_reported: 'CAPTURING' },
  frame: { sequence: 1, captured_at: '2026-10-03T10:00:00Z', width: 640, height: 480, latency_ms: 42 },
  vision_detections: [{ class: 'person', confidence: 0.9, bbox: [10, 20, 100, 200] }],
}

const preview = {
  status: 'PROCESSED' as const,
  method: 'YUNET_SOFT_OVAL' as const,
  model_sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  data_url: 'data:image/jpeg;base64,YWJj', width: 640, height: 480,
  detected_faces: 1, masked_regions: 1, latency_ms: 12,
  sequence: 1, captured_at: '2026-10-03T10:00:00Z',
}

describe('CameraApi', () => {
  it('discovers every required camera endpoint through the same origin proxy', async () => {
    const named_endpoints = Object.fromEntries(['start', 'status', 'frame', 'stop', 'report'].map(name => [`/camera_${name}`, {}]))
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ named_endpoints }), { status: 200 }))
    const api = new CameraApi('https://frontend.example', fetcher)

    await expect(api.available()).resolves.toBe(true)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://frontend.example/gradio_api/info')
  })

  it('reads the completed Gradio SSE camera result', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ event_id: 'event-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(`event: complete\ndata: ${JSON.stringify([snapshot])}\n\n`, { status: 200 }))
    const api = new CameraApi('https://frontend.example', fetcher)

    const result = await api.call('camera_start', ['hot_locked', 'browser'])

    expect(result).toMatchObject({ session_id: 'session-1', risk_level: 'WARNING' })
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://frontend.example/gradio_api/call/camera_start/event-1')
  })

  it('rejects malformed detection confidence', () => {
    expect(() => validateCameraSnapshot({ ...snapshot, vision_detections: [{ class: 'person', confidence: 2 }] }))
      .toThrowError(CameraApiError)
  })

  it('accepts a fresh face-masked preview matching the processed frame', () => {
    expect(getPrivacyPreview({ ...snapshot, preview }, Date.parse('2026-10-03T10:00:02Z')))
      .toEqual(preview)
  })

  it('withholds unavailable, stale, or mismatched privacy previews', () => {
    expect(getPrivacyPreview({ ...snapshot, preview: { status: 'UNAVAILABLE', reason: 'model_missing' } }, Date.parse('2026-10-03T10:00:01Z'))).toBeUndefined()
    expect(getPrivacyPreview({ ...snapshot, preview }, Date.parse('2026-10-03T10:00:04Z'))).toBeUndefined()
    expect(getPrivacyPreview({ ...snapshot, preview: { ...preview, sequence: 2 } }, Date.parse('2026-10-03T10:00:01Z'))).toBeUndefined()
  })
})
