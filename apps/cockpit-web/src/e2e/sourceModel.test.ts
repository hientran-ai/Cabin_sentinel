import { describe, expect, it } from 'vitest'
import type { FrameCounts } from './cabinCounts'
import {
  badgeOfKind, badgeOfObservation, cabinStatus, classifyCameraError, countsForSource, feedStatus, noResultReason, normalizeBox, resultBelongsToSource, summarizeSource,
} from './sourceModel'
import type { View } from './view'

const view = (over: Partial<View> = {}): View => ({ kind: 'current', tone: 'ok', headline: 'Chưa thấy nguy cơ', reason: 'x', caution: null, current: true, revision: 3, ...over })
const counts = (over: Partial<FrameCounts> = {}): FrameCounts => ({
  status: 'CURRENT', frameId: 'f1', observedAt: '2026-10-17T10:00:00Z', reason: null, age: 'DISABLED', person: 1, child: null, adult: null, ageUnknown: 1,
  pet: 0, dog: 0, cat: 0, items: null, lastKnown: null, ...over,
})
const live = (over = {}) => summarizeSource({ kind: 'device', running: true, localOnly: true, label: 'Camera', lastObservation: null, ...over })
const demo = (last: 'LIVE' | 'DEMO' | 'UPLOAD' | null) => summarizeSource({ kind: 'clip', running: true, localOnly: false, label: 'clip', lastObservation: last })
const none = () => summarizeSource({ kind: 'none', running: false, localOnly: false, label: '', lastObservation: null })

describe('source badges', () => {
  it('rejects a previous clip run even when both sources are DEMO', () => {
    expect(resultBelongsToSource('DEMO', 'DEMO', 'r2', 'session-r1-frame')).toBe(false)
    expect(resultBelongsToSource('DEMO', 'DEMO', 'r2', 'session-r2-frame')).toBe(true)
  })
  it('names the source by how the picture got there', () => {
    expect(badgeOfKind('device')).toBe('LIVE'); expect(badgeOfKind('clip')).toBe('DEMO'); expect(badgeOfKind('upload')).toBe('UPLOAD'); expect(badgeOfKind('none')).toBe('NONE')
    expect(badgeOfObservation('DEVICE_CAMERA')).toBe('LIVE'); expect(badgeOfObservation('CLIP_FRAME')).toBe('DEMO'); expect(badgeOfObservation('UPLOAD')).toBe('UPLOAD')
  })
  it('an unknown observation source is never claimed to be anything', () => {
    expect(badgeOfObservation('SOMETHING_NEW')).toBe('NONE'); expect(badgeOfObservation(undefined)).toBe('NONE'); expect(badgeOfObservation(null)).toBe('NONE')
  })
  it('a result belongs to the current source only when both are the same real source', () => {
    expect(resultBelongsToSource('LIVE', 'LIVE')).toBe(true)
    expect(resultBelongsToSource('LIVE', 'DEMO')).toBe(false)
    expect(resultBelongsToSource('DEMO', null)).toBe(false)
    expect(resultBelongsToSource('NONE', 'NONE')).toBe(false)
  })
})

describe('live camera on the hosted build (preview only)', () => {
  it('is LIVE but never analysed: no number, cabin UNKNOWN even if the backend still holds an old SAFE', () => {
    const s = live()
    expect(s.badge).toBe('LIVE'); expect(s.analysis).toBe('preview-only')
    expect(countsForSource(counts(), s, 'LIVE')).toBeNull()
    expect(cabinStatus(view({ tone: 'ok' }), s)).toBe('UNKNOWN')
    expect(noResultReason(counts(), s, null)).toMatch(/chưa được AI phân tích/)
  })
})

describe('sample clip and counts', () => {
  it('prints counts only for a current frame of the same source', () => {
    expect(countsForSource(counts(), demo('DEMO'), 'DEMO')?.person).toBe(1)
    expect(countsForSource(counts(), demo('DEMO'), 'LIVE')).toBeNull()
    expect(countsForSource(counts({ status: 'STALE' }), demo('DEMO'), 'DEMO')).toBeNull()
    expect(countsForSource(counts({ status: 'NO_DATA' }), demo(null), null)).toBeNull()
  })
  it('waits for the first result instead of showing zero', () => {
    const s = demo(null)
    expect(s.analysis).toBe('waiting')
    expect(countsForSource(counts(), s, null)).toBeNull()
  })
  it('explains a result that came from another source', () => {
    expect(noResultReason(counts(), live({ localOnly: false }), 'DEMO')).toMatch(/DEMO/)
  })
  it('stopping the source drops the number and says why', () => {
    const s = none()
    expect(countsForSource(counts(), s, 'DEMO')).toBeNull()
    expect(noResultReason(counts({ status: 'STALE' }), s, 'DEMO')).toMatch(/Nguồn đã dừng/)
  })
})

describe('cabin status for the first screen', () => {
  it('never says SAFE when the verdict is not current or the tone is unknown', () => {
    expect(cabinStatus(view({ current: false, kind: 'stale' }), demo('DEMO'))).toBe('UNKNOWN')
    expect(cabinStatus(view({ tone: 'unknown' }), demo('DEMO'))).toBe('UNKNOWN')
    expect(cabinStatus(view({ kind: 'last-known', current: false, tone: 'unknown' }), demo('DEMO'))).toBe('UNKNOWN')
  })
  it('passes the backend verdict through when it is current and analysed', () => {
    expect(cabinStatus(view({ tone: 'ok' }), demo('DEMO'))).toBe('SAFE')
    expect(cabinStatus(view({ tone: 'warning' }), demo('DEMO'))).toBe('WARNING')
    expect(cabinStatus(view({ tone: 'critical' }), demo('DEMO'))).toBe('CRITICAL')
    expect(cabinStatus(view({ tone: 'info' }), demo('DEMO'))).toBe('NOTICE')
  })
  it('feed status: OFFLINE wins, no source is NO_DATA', () => {
    expect(feedStatus(demo('DEMO'), 'lost')).toBe('OFFLINE')
    expect(feedStatus(none(), 'ok')).toBe('NO_DATA')
    expect(feedStatus(live(), 'ok')).toBe('LIVE')
    expect(feedStatus(demo('DEMO'), 'ok')).toBe('DEMO')
  })
})

describe('camera errors', () => {
  it.each([
    ['NotAllowedError', 'denied', true], ['SecurityError', 'denied', true], ['NotFoundError', 'unavailable', true], ['NotReadableError', 'busy', true],
    ['OverconstrainedError', 'error', true], ['InsecureContext', 'insecure', false], ['Unsupported', 'unsupported', false], ['Whatever', 'error', true],
  ])('%s -> %s (retry %s)', (name, phase, retry) => {
    const f = classifyCameraError(name)
    expect(f.phase).toBe(phase); expect(f.retry).toBe(retry); expect(f.title.length).toBeGreaterThan(3); expect(f.hint.length).toBeGreaterThan(10)
  })
})

describe('bounding boxes', () => {
  it('normalises backend pixel xyxy against the analysed picture', () => {
    expect(normalizeBox([64, 48, 320, 240], 640, 480)).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 })
  })
  it('refuses anything that is not a valid box instead of drawing a guess', () => {
    expect(normalizeBox(undefined, 640, 480)).toBeNull(); expect(normalizeBox(null, 640, 480)).toBeNull(); expect(normalizeBox([1, 2, 3], 640, 480)).toBeNull()
    expect(normalizeBox([0, 0, NaN, 10], 640, 480)).toBeNull(); expect(normalizeBox([50, 50, 40, 60], 640, 480)).toBeNull(); expect(normalizeBox([0, 0, 10, 10], 0, 480)).toBeNull()
  })
  it('clamps a box that sticks out of the picture', () => {
    const b = normalizeBox([-20, -10, 700, 500], 640, 480)
    expect(b).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})
