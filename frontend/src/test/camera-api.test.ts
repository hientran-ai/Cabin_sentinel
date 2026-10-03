import { describe, expect, it, vi } from 'vitest'
import { CameraAPI, CameraError, adaptCameraState } from '../api/camera'

const snapshot = () => ({ session_id: 'camera-1', revision: 3, risk_level: 'CRITICAL', rule_id: 'HOT_OCCUPANT', reason: 'Hot occupied cabin', occupancy_state: 'PRESENT', camera_status: 'OK',
  camera: { source: 'browser', requested: 'RUNNING', device_reported: 'CAPTURING', last_sequence: 1 },
  frame: { sequence: 1, captured_at: new Date().toISOString(), width: 640, height: 480, latency_ms: 20 },
  decision_current: true, freshness: { as_of: new Date().toISOString(), sensor: { status: 'FRESH', age_s: .1 }, vision: { status: 'FRESH', age_s: .1 } },
  data_quality: { status: 'CURRENT', issues: [] }, vision_detections: [{ class: 'person', confidence: .9, bbox: [10, 20, 100, 200] }],
  actions: [{ tool: 'trigger_horn', status: 'simulated' }, { tool: 'request_unlock', status: 'pending_human_confirmation' }],
})

describe('camera transport and contract', () => {
  it('calls browser fetch with the Window receiver', async () => {
    const fetcher = function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(Response.json({ named_endpoints: {} }))
    }
    await expect(new CameraAPI('https://example.test', fetcher).available()).resolves.toBe(false)
  })
  it('detects missing camera endpoints before requesting camera permission', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ named_endpoints: { '/analyze': {} } }))
    const api = new CameraAPI('https://example.test', fetcher)
    await expect(api.available()).resolves.toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('parses chunked SSE, sends credentials only in POST body and omits cookies', async () => {
    const encoder = new TextEncoder()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ event_id: 'evt' }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ start(c) {
        for (const s of ['event: heart', 'beat\ndata: null\n\nevent: complete\r\n', 'data: [{"revision":1}]\r\n\r\n']) c.enqueue(encoder.encode(s))
        c.close()
      } })))
    const api = new CameraAPI('https://example.test/', fetcher)
    await expect(api.call('camera_status', ['sid', 'memory-token'])).resolves.toEqual({ revision: 1 })
    expect(fetcher.mock.calls[0][0]).toBe('https://example.test/gradio_api/call/camera_status')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', body: JSON.stringify({ data: ['sid', 'memory-token'] }) })
    expect(fetcher.mock.calls[1][0]).not.toContain('memory-token')
  })
  it('surfaces backend STALE_FRAME rather than an empty detection result', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ event_id: 'evt' }))
      .mockResolvedValueOnce(new Response('event: complete\ndata: [{"error":"Frame too old","code":"STALE_FRAME","decision_current":false}]\n\n'))
    await expect(new CameraAPI('https://example.test', fetcher).call('camera_frame', [])).rejects.toMatchObject({ code: 'STALE_FRAME' })
  })
  it('maps backend risk/actions and capture time without inventing omitted telemetry', () => {
    const state = adaptCameraState(snapshot())
    expect(state).toMatchObject({ vehicleId: 'DEMO_camera-1', riskState: 'CRITICAL', decisionCurrent: true, sensors: { temperatureC: null, engine: 'UNKNOWN', doorsLocked: null } })
    expect(state.toolResults.map(t => t.status)).toEqual(['SIMULATED', 'PENDING_CONFIRMATION'])
    expect(state.objects[0].bbox).toEqual([10, 20, 100, 200])
  })
  it('withholds current SAFE for absent/stale frames, missing freshness or stopped source', () => {
    for (const update of [
      { frame: null }, { frame: { ...snapshot().frame, captured_at: new Date(Date.now() - 5000).toISOString() } },
      { freshness: {} }, { camera: { ...snapshot().camera, requested: 'STOPPED' } }, { decision_current: false },
    ]) expect(adaptCameraState({ ...snapshot(), risk_level: 'SAFE', ...update }).decisionCurrent).toBe(false)
  })
  it.each(['ERROR', 'DISCONNECTED'])('accepts %s camera status as explicit unavailable data', (camera_status) => {
    expect(() => adaptCameraState({ ...snapshot(), camera_status, decision_current: false, camera: { ...snapshot().camera, device_reported: camera_status } })).not.toThrow()
    expect(adaptCameraState({ ...snapshot(), camera_status, decision_current: false, camera: { ...snapshot().camera, device_reported: camera_status } }).decisionCurrent).toBe(false)
  })
  it('rejects malformed detections and unknown camera session responses explicitly', () => {
    expect(() => adaptCameraState({ risk_level: 'SAFE' })).toThrow(CameraError)
    expect(() => adaptCameraState({ ...snapshot(), vision_detections: [{}] })).toThrow(CameraError)
    expect(() => adaptCameraState({ ...snapshot(), risk_level: 'UNRECOGNIZED' })).toThrow(CameraError)
    expect(() => adaptCameraState({ ...snapshot(), occupancy_state: 'UNRECOGNIZED' })).toThrow(CameraError)
    expect(() => adaptCameraState({ ...snapshot(), actions: [null] })).toThrow(CameraError)
  })
})

describe('camera action receipts', () => {
  it('keeps simulated/pending receipts from the ledger when a later frame has no new actions', async () => {
    const { adaptCameraState } = await import('../api/camera')
    const now = new Date().toISOString()
    const state = adaptCameraState({ session_id: 's', revision: 3, risk_level: 'CRITICAL', rule_id: 'HOT_OCCUPANT', reason: 'r', occupancy_state: 'PRESENT',
      camera_status: 'OK', decision_current: true, camera: { source: 'browser', requested: 'RUNNING', device_reported: 'CAPTURING', last_sequence: 2 },
      frame: { sequence: 2, captured_at: now, width: 640, height: 480 }, vision_detections: [], actions: [],
      action_ledger: [{ action_key: 'k1', tool: 'trigger_horn', status: 'simulated', revision: 2 }, { action_key: 'k2', tool: 'request_unlock', status: 'pending_human_confirmation', revision: 2 }],
      unlock_request: { request_id: 'u', status: 'pending' } })
    expect(state.toolResults.map(t => `${t.action}:${t.status}`)).toEqual(['TRIGGER_HORN:SIMULATED', 'REQUEST_UNLOCK:PENDING_CONFIRMATION'])
    expect(state.unlockRequest?.status).toBe('pending')
  })
})
