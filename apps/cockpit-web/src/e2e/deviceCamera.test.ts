import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeviceStream, startDeviceCamera, stopDeviceCamera, useDeviceCamera } from './deviceCamera'

interface FakeTrack { stop: ReturnType<typeof vi.fn>; onended: null | (() => void); getSettings: () => { facingMode?: string } }
const track = (facing = 'user'): FakeTrack => ({ stop: vi.fn(), onended: null, getSettings: () => ({ facingMode: facing }) })
const streamOf = (t: FakeTrack) => ({ getTracks: () => [t], getVideoTracks: () => [t] }) as unknown as MediaStream
const setMedia = (getUserMedia: unknown, devices = 1) => vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices: async () => Array.from({ length: devices }, () => ({ kind: 'videoinput' })) } })
const err = (name: string) => Object.assign(new Error(name), { name })

beforeEach(() => { vi.stubGlobal('isSecureContext', true); stopDeviceCamera() })
afterEach(() => { vi.unstubAllGlobals(); stopDeviceCamera() })

describe('device camera lifecycle', () => {
  it('goes requesting -> live and keeps the stream', async () => {
    const t = track(); setMedia(vi.fn(async () => streamOf(t)))
    const p = startDeviceCamera('user')
    expect(useDeviceCamera.getState().phase).toBe('requesting')
    const s = await p
    expect(s).not.toBeNull(); expect(useDeviceCamera.getState().phase).toBe('live'); expect(getDeviceStream()).toBe(s)
  })
  it('stop releases every track and returns to idle; restart works again', async () => {
    const t1 = track(), t2 = track()
    const gum = vi.fn().mockResolvedValueOnce(streamOf(t1)).mockResolvedValueOnce(streamOf(t2)); setMedia(gum)
    await startDeviceCamera(); stopDeviceCamera()
    expect(t1.stop).toHaveBeenCalledTimes(1); expect(useDeviceCamera.getState().phase).toBe('idle'); expect(getDeviceStream()).toBeNull()
    await startDeviceCamera()
    expect(useDeviceCamera.getState().phase).toBe('live'); expect(gum).toHaveBeenCalledTimes(2)
  })
  it('a permission answer that arrives after stop is discarded and its camera is released', async () => {
    const t = track(); let resolve!: (s: MediaStream) => void
    setMedia(vi.fn(() => new Promise<MediaStream>((r) => { resolve = r })))
    const p = startDeviceCamera(); stopDeviceCamera(); resolve(streamOf(t))
    expect(await p).toBeNull(); expect(t.stop).toHaveBeenCalled(); expect(useDeviceCamera.getState().phase).toBe('idle'); expect(getDeviceStream()).toBeNull()
  })
  it('a newer start wins over an older one still waiting for the prompt', async () => {
    const slow = track(), fast = track(); let resolveSlow!: (s: MediaStream) => void
    const gum = vi.fn().mockImplementationOnce(() => new Promise<MediaStream>((r) => { resolveSlow = r })).mockResolvedValueOnce(streamOf(fast)); setMedia(gum)
    const first = startDeviceCamera(); const second = await startDeviceCamera()
    resolveSlow(streamOf(slow))
    expect(await first).toBeNull(); expect(slow.stop).toHaveBeenCalled(); expect(getDeviceStream()).toBe(second)
  })
  it.each([['NotAllowedError', 'denied'], ['NotFoundError', 'unavailable'], ['NotReadableError', 'busy']])('%s ends in phase %s with a retry', async (name, phase) => {
    setMedia(vi.fn(async () => { throw err(name) }))
    expect(await startDeviceCamera()).toBeNull()
    const st = useDeviceCamera.getState(); expect(st.phase).toBe(phase); expect(st.retry).toBe(true); expect(st.title).toBeTruthy()
  })
  it('OverconstrainedError retries once with no constraints', async () => {
    const t = track(); const gum = vi.fn().mockRejectedValueOnce(err('OverconstrainedError')).mockResolvedValueOnce(streamOf(t)); setMedia(gum)
    expect(await startDeviceCamera('environment')).not.toBeNull()
    expect(gum).toHaveBeenCalledTimes(2); expect(gum.mock.calls[1]![0]).toEqual({ video: true, audio: false })
  })
  it('refuses on an insecure page and without getUserMedia, with the reason', async () => {
    vi.stubGlobal('isSecureContext', false); setMedia(vi.fn())
    expect(await startDeviceCamera()).toBeNull(); expect(useDeviceCamera.getState().phase).toBe('insecure')
    vi.stubGlobal('isSecureContext', true); vi.stubGlobal('navigator', {})
    expect(await startDeviceCamera()).toBeNull(); expect(useDeviceCamera.getState().phase).toBe('unsupported')
  })
  it('a camera that is unplugged or revoked while live shows an error and releases the stream', async () => {
    const t = track(); setMedia(vi.fn(async () => streamOf(t)))
    await startDeviceCamera(); t.onended?.()
    expect(useDeviceCamera.getState().phase).toBe('error'); expect(getDeviceStream()).toBeNull(); expect(useDeviceCamera.getState().retry).toBe(true)
  })
  it('reports whether switching between cameras is possible', async () => {
    setMedia(vi.fn(async () => streamOf(track())), 2)
    await startDeviceCamera(); await new Promise((r) => setTimeout(r, 0))
    expect(useDeviceCamera.getState().canFlip).toBe(true)
  })
})
