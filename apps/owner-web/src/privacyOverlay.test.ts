import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapPrivacyBox, paintPrivacyMasks } from './privacyOverlay'

describe('mapPrivacyBox', () => {
  it('scales backend coordinates to the webcam canvas with bounded padding', () => {
    expect(mapPrivacyBox([100, 50, 200, 150], 640, 480, 1280, 960, 0.1)).toEqual({
      x: 180, y: 80, width: 240, height: 240,
    })
  })
})

describe('paintPrivacyMasks', () => {
  afterEach(() => vi.unstubAllGlobals())

  function harness() {
    vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 })
    const main = {
      clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      ellipse: vi.fn(), clip: vi.fn(), imageSmoothingEnabled: true, filter: 'none',
    }
    const small = { clearRect: vi.fn(), drawImage: vi.fn() }
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => main) } as unknown as HTMLCanvasElement
    const scratch = { width: 0, height: 0, getContext: vi.fn(() => small) } as unknown as HTMLCanvasElement
    const video = { readyState: 2, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement
    return { main, small, canvas, scratch, video }
  }

  it('leaves the video unchanged until backend mask boxes exist', () => {
    const h = harness()
    expect(paintPrivacyMasks(h.canvas, h.scratch, h.video, [], 640, 480)).toBe(true)
    expect(h.main.clearRect).toHaveBeenCalledWith(0, 0, 640, 480)
    expect(h.main.drawImage).not.toHaveBeenCalled()
  })

  it('clips and paints pixelated webcam pixels inside each backend face box', () => {
    const h = harness()
    expect(paintPrivacyMasks(h.canvas, h.scratch, h.video, [[100, 50, 200, 150]], 640, 480)).toBe(true)
    expect(h.small.drawImage).toHaveBeenCalledOnce()
    expect(h.main.ellipse).toHaveBeenCalledOnce()
    expect(h.main.clip).toHaveBeenCalledOnce()
    expect(h.main.drawImage).toHaveBeenCalledOnce()
  })
})
