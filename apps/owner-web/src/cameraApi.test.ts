import { describe, expect, it, vi } from 'vitest'
import { detectionText, CameraApi, CameraApiError, getFaceMasks, holdDetections, holdFaceMasks, getPrivacyPreview, trackFaceMasks, validateCameraSnapshot, type CameraSnapshot, type PrivacyPreview } from './cameraApi'

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

  it('keeps a stable id for a moving face and holds a briefly missed one', () => {
    const [a, b] = trackFaceMasks([], [[100, 100, 160, 160], [300, 100, 360, 160]], 1_000)
    const moved = trackFaceMasks([a!, b!], [[110, 105, 170, 165]], 1_200)
    expect(moved).toEqual([
      { id: a!.id, box: [110, 105, 170, 165], seenAt: 1_200 },
      { id: b!.id, box: [300, 100, 360, 160], seenAt: 1_000 },
    ])
    expect(trackFaceMasks(moved, [], 1_900)).toEqual([]) // missed for longer than the hold
    expect(trackFaceMasks([a!, b!], [[500, 300, 560, 360]], 1_100)[0]!.id).toBe(3) // far away: a new face
  })

  it('accepts age_group and rejects unknown values', () => {
    const detection = { class: 'person', confidence: 0.9, age_group: 'child' }
    expect(() => validateCameraSnapshot({ ...snapshot, vision_detections: [detection] })).not.toThrow()
    expect(() => validateCameraSnapshot({ ...snapshot, vision_detections: [{ ...detection, age_group: 'senior' }] }))
      .toThrow(/không hợp lệ/)
    expect(detectionText(detection, true)).toBe('person (Trẻ em)')
    expect(detectionText({ class: 'dog' }, true)).toBe('dog')
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

describe('CameraApi.analyzeCpu', () => {
  const SHA = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
  const reply = (extra: object) => ({
    session_id: 's1', frame: { width: 480, height: 640 },
    reasoning: { revision: 1, risk_level: 'SAFE', rule_id: 'R', reason: 'ok', occupancy_state: 'PRESENT', decision_current: true },
    vision: { detections: [{ class: 'person', confidence: 0.9, bbox: [1, 2, 30, 40] }], latency_ms: 50 }, ...extra,
  })
  const run = (body: object) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
    const api = new CameraApi('http://backend.test', fetcher)
    return { fetcher, result: api.analyzeCpu(new Blob(['x']), 's1', 'tok', 3, new Date().toISOString()) }
  }

  it('sends privacy=boxes and returns frame size plus masked boxes', async () => {
    const { fetcher, result } = run(reply({ preview: { status: 'PROCESSED', method: 'YUNET_SOFT_OVAL', model_sha256: SHA,
      width: 480, height: 640, detected_faces: 1, masked_regions: 1, masked_boxes: [[10, 10, 50, 60]], latency_ms: 20 } }))
    const snapshot = await result
    const form = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1].body as FormData
    expect(form.get('privacy')).toBe('boxes')
    expect(snapshot.frame).toMatchObject({ width: 480, height: 640, sequence: 3 })
    expect(snapshot.vision_detections[0]?.bbox).toEqual([1, 2, 30, 40])
    expect(getFaceMasks(getPrivacyPreview(snapshot))).toEqual([[10, 10, 50, 60]])
  })

  it('has no masks (full blur fallback) when the backend reports masking unavailable', async () => {
    const snapshot = await run(reply({ preview: { status: 'UNAVAILABLE', reason: 'x' } })).result
    expect(snapshot.preview?.status).toBe('UNAVAILABLE')
    expect(getFaceMasks(getPrivacyPreview(snapshot))).toBeUndefined()
  })

  it('has no masks against an older backend that returns neither frame nor preview', async () => {
    const { frame: _f, ...old } = reply({})
    const snapshot = await run(old).result
    expect(snapshot.frame).toBeNull()
    expect(getFaceMasks(getPrivacyPreview(snapshot))).toBeUndefined()
  })
})

describe('getFaceMasks', () => {
  const at = Date.parse(preview.captured_at)
  const withBoxes = { ...preview, masked_regions: 1, masked_boxes: [[10, 20, 60, 80]] as [number, number, number, number][] }

  it('returns recent, consistent face boxes', () => {
    expect(getFaceMasks(withBoxes, at + 500)).toEqual([[10, 20, 60, 80]])
  })

  it('falls back to a full blur when boxes are stale, missing, inconsistent or malformed', () => {
    expect(getFaceMasks(withBoxes, at + 2_000)).toBeUndefined()
    expect(getFaceMasks(preview, at)).toBeUndefined()
    expect(getFaceMasks({ ...withBoxes, masked_regions: 2 }, at)).toBeUndefined()
    expect(getFaceMasks({ ...withBoxes, masked_boxes: [[60, 20, 10, 80]] }, at)).toBeUndefined()
    expect(getFaceMasks(undefined, at)).toBeUndefined()
  })

  it('allows an empty mask list only when no region was masked', () => {
    expect(getFaceMasks({ ...preview, masked_regions: 0, masked_boxes: [] }, at)).toEqual([])
  })
})

describe('overlay hold (anti-flicker)', () => {
  const base = Date.parse('2026-10-04T12:00:00.000Z')
  const preview = (offsetMs: number, boxes: [number, number, number, number][], width = 640): PrivacyPreview => ({
    status: 'PROCESSED', method: 'YUNET_SOFT_OVAL', model_sha256: 'x', data_url: '', width, height: 480,
    detected_faces: boxes.length, masked_regions: boxes.length, masked_boxes: boxes, latency_ms: 1, sequence: offsetMs,
    captured_at: new Date(base + offsetMs).toISOString(),
  })

  it('keeps a face masked when the newest frame misses it', () => {
    const seen = preview(0, [[10, 10, 50, 50]])
    const missed = preview(300, [])
    expect(holdFaceMasks([seen, missed], missed, base + 400)).toEqual([[10, 10, 50, 50]])
  })

  it('drops masks older than the hold window and from a different frame size', () => {
    const old = preview(0, [[1, 1, 5, 5]])
    const resized = preview(200, [[2, 2, 6, 6]], 320)
    const latest = preview(1_000, [[10, 10, 50, 50]])
    expect(holdFaceMasks([old, resized, latest], latest, base + 1_100)).toEqual([[10, 10, 50, 50]])
  })

  it('still requires a fresh newest preview (full-frame blur otherwise)', () => {
    const latest = preview(0, [[10, 10, 50, 50]])
    expect(holdFaceMasks([latest], latest, base + 2_000)).toBeUndefined()
    expect(holdFaceMasks([], undefined, base)).toBeUndefined()
  })

  it('does not stack masks for the same face seen in several frames', () => {
    const a = preview(0, [[10, 10, 50, 50]])
    const b = preview(100, [[12, 11, 52, 51]])
    const latest = preview(200, [[14, 12, 54, 52], [200, 200, 240, 240]])
    expect(holdFaceMasks([a, b, latest], latest, base + 250)).toEqual([[14, 12, 54, 52], [200, 200, 240, 240]])
  })

  it('accepts a preview captured a moment after the render clock tick', () => {
    const latest = preview(0, [[10, 10, 50, 50]])
    expect(holdFaceMasks([latest], latest, base)).toEqual([[10, 10, 50, 50]])
  })

  it('holds the last person boxes briefly, then lets them go', () => {
    const last = { at: 1_000 }
    expect(holdDetections(undefined, last, 1_400)).toBe(last)
    expect(holdDetections(undefined, last, 1_600)).toBeUndefined()
    const fresh = { at: 1_500 }
    expect(holdDetections(fresh, last, 1_500)).toBe(fresh)
  })
})
