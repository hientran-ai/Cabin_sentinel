import { describe, expect, it } from 'vitest'
import { headMaskRegions } from './headMask'

describe('privacy head regions (40% head, 15% padding)', () => {
  it('covers each person/pet at different positions, preserving the remaining cabin', () => {
    expect(headMaskRegions([{ class: 'person', bbox: [20, 20, 60, 120] }, { class: 'dog', bbox: [100, 50, 140, 150] }], 200, 200)).toEqual([[14, 14, 66, 66], [94, 44, 146, 96]])
  })
  it('clips padding at all image edges', () => {
    expect(headMaskRegions([{ class: 'person', bbox: [-10, -10, 30, 90] }, { class: 'cat', bbox: [180, 180, 220, 280] }], 200, 200)).toEqual([[0, 0, 36, 36], [174, 174, 200, 200]])
  })
  it.each([[], [{ class: 'person' }], [{ class: 'person', bbox: [1, 2, NaN, 8] }], [{ class: 'person', bbox: [8, 2, 1, 9] }], [{ class: 'person', bbox: [400, 400, 410, 410] }], [{ class: 'backpack', bbox: [1, 1, 20, 30] }]].map(detections => ({ detections })))('requires full-frame fallback when no reliable regions exist: %j', ({ detections }) => {
    expect(headMaskRegions(detections, 200, 200)).toBeNull()
  })
  it('fails closed for the whole frame if even one detection lacks a box', () => {
    expect(headMaskRegions([{ class: 'person', bbox: [20, 20, 60, 120] }, { class: 'person' }], 200, 200)).toBeNull()
  })
})
