import { describe, expect, it, vi } from 'vitest'
import { CameraStream } from '../api/cameraStream'

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const noFeed = { session_id: 'sid', session_token: 'memory-token', revision: 1, risk_level: 'ERROR', rule_id: 'NO_FEED', reason: 'No frame', occupancy_state: 'UNKNOWN', camera_status: 'NO_FEED', decision_current: false,
  camera: { source: 'browser', requested: 'RUNNING', device_reported: 'UNKNOWN', last_sequence: 0 }, frame: null, vision_detections: [], actions: [] }
function fixture() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() }
  const media = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) }
  const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() }
  const api = { available: vi.fn().mockResolvedValue(true), upload: vi.fn().mockResolvedValue({ path: '/tmp/frame.jpg' }), call: vi.fn().mockImplementation(async (name: string) => name === 'camera_start' ? noFeed : { ...noFeed, session_token: undefined }) }
  const result = vi.fn(), error = vi.fn(), state = vi.fn()
  const controller = new CameraStream({ api, mediaDevices: media as unknown as MediaDevices, video: video as unknown as HTMLVideoElement, capture: async () => new Blob(['public fixture']), onResult: result, onError: error, onState: state, intervalMs: 1 })
  return { controller, track, media, video, api, result, error, state }
}

describe('sequential camera lifecycle', () => {
  it('does not announce STOPPED from an older concurrent stop request', async () => {
    const f = fixture(), frame = deferred<unknown>(), first = deferred<unknown>(), second = deferred<unknown>()
    let stops = 0
    f.api.call.mockImplementation(async (name: string) => {
      if (name === 'camera_frame') return frame.promise
      if (name === 'camera_stop') return ++stops === 1 ? first.promise : second.promise
      return noFeed
    })
    await f.controller.start('normal')
    const older = f.controller.stop(), latest = f.controller.stop()
    first.resolve(noFeed); await older
    expect(f.state.mock.calls.filter(c => c[0] === 'STOPPED')).toHaveLength(0)
    second.resolve(noFeed); await latest
    expect(f.state.mock.calls.filter(c => c[0] === 'STOPPED')).toHaveLength(1)
    frame.resolve(noFeed); await f.controller.finished
  })
  it('never opens the webcam if the live deployment lacks camera APIs', async () => {
    const f = fixture(); f.api.available.mockResolvedValue(false)
    await expect(f.controller.start('normal')).rejects.toThrow(/not deployed/)
    expect(f.media.getUserMedia).not.toHaveBeenCalled()
  })
  it('closes tracks immediately while backend stop is pending and discards late inference', async () => {
    const f = fixture(); let finishFrame!: (v: unknown) => void; let finishStop!: (v: unknown) => void
    const entered = deferred<void>()
    f.api.call.mockImplementation(async (name: string) => {
      if (name === 'camera_start') return noFeed
      if (name === 'camera_frame') { entered.resolve(undefined); return new Promise(r => { finishFrame = r }) }
      if (name === 'camera_stop') return new Promise(r => { finishStop = r })
      return noFeed
    })
    await f.controller.start('normal'); await entered.promise
    const before = f.result.mock.calls.length
    const closing = f.controller.stop()
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.video.srcObject).toBeNull()
    finishStop(noFeed); await closing
    finishFrame({ ...noFeed, risk_level: 'SAFE', decision_current: true })
    await f.controller.finished
    expect(f.result.mock.calls.length).toBe(before)
  })
  it('releases a camera granted after Stop during the permission prompt', async () => {
    const f = fixture(); const grant = deferred<unknown>()
    f.media.getUserMedia.mockReturnValue(grant.promise as Promise<MediaStream>)
    const starting = f.controller.start('normal')
    await vi.waitFor(() => expect(f.media.getUserMedia).toHaveBeenCalled())
    await f.controller.stop(); grant.resolve({ getTracks: () => [f.track] }); await starting
    expect(f.track.stop).toHaveBeenCalledOnce()
    expect(f.api.call).not.toHaveBeenCalled()
  })
  it('runs one capture/upload/inference at a time and continues with a new frame after errors', async () => {
    const f = fixture(); let frames = 0
    f.api.call.mockImplementation(async (name: string) => {
      if (name === 'camera_frame') { frames++; if (frames === 1) throw new Error('frame unavailable') }
      return noFeed
    })
    await f.controller.start('normal')
    await vi.waitFor(() => expect(frames).toBeGreaterThanOrEqual(2))
    await f.controller.stop(); await f.controller.finished
    expect(f.error).toHaveBeenCalled()
    const requests = f.api.call.mock.calls.filter(c => c[0] === 'camera_frame')
    expect(requests[0][1][3]).toBe(1); expect(requests[1][1][3]).toBe(2)
  })
})
