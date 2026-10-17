import { describe, expect, it } from 'vitest'
import { fitArtboard } from './layout'

// Catch cropping/stretching of the original Figma artboard in the embedded cockpit and after a resize.
describe('Tesla Figma artboard fitting', () => {
  it.each([
    [1920, 1200, 1, 0, 0],
    [1920, 1080, 0.9, 96, 0],
    [1280, 720, 0.6, 64, 0],
    [390, 844, 0.203125, 0, 300.125],
  ])('fits %i × %i without stretching or cropping', (w, h, scale, x, y) => {
    expect(fitArtboard(w, h)).toEqual({ scale, x, y })
  })
  it('keeps a collapsed container finite while ResizeObserver waits for layout', () => {
    expect(fitArtboard(0, 0)).toEqual({ scale: 0, x: 0, y: 0 })
  })
})
