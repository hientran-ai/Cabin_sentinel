import type { V1CabinZone, V1VideoFrameResult } from '@cabinsentinel/contracts'

/** ~2.5 frames per second: the rules need vision newer than 3 s, and the HF CPU detector takes 100-400 ms per frame. */
export const FRAME_INTERVAL_MS = 400
/** One frame detecting, one uploading. More only makes every result older. */
export const MAX_IN_FLIGHT = 2
export const MIN_ZONE = 0.03

export interface SampleVideo {
  id: string
  /** File under samples/ (several samples may share one clip with a different installation). */
  video: string
  /** Verified-empty picture of this car taken at installation (same camera pose), if the team has one. */
  reference?: string
  title: [vi: string, en: string]
  source: [vi: string, en: string]
  /** What a person checking the cabin by eye would say. The backend never sees this. */
  occupant: boolean
  truth: [vi: string, en: string]
  zones: V1CabinZone[]
}

const seat = (name: string, box: V1CabinZone['box'], extra: Partial<V1CabinZone> = {}): V1CabinZone => ({ name, kind: 'seat', box, ...extra })
const glass = (name: string, box: V1CabinZone['box']): V1CabinZone => ({ name, kind: 'exclude', box })

/** Each sample is a different car and camera position, so each ships the zones a fitter would mark at installation. */
// The two team clips of the same car are stabilised onto one camera pose (embedded/dev/pi_sim/stabilise.py), as a
// bolted camera would see them, so the empty-cabin picture taken at installation lines up with both.
const SAME_CAR_SEATS = (rearRight: Partial<V1CabinZone> = {}): V1CabinZone[] => [
  seat('front_left', [0.2, 0.5, 0.4, 1]), seat('rear_left', [0.4, 0.52, 0.55, 0.9], { detail: true }),
  seat('rear_right', [0.55, 0.58, 0.7, 0.95], { detail: true, ...rearRight }), seat('front_right', [0.7, 0.5, 0.99, 1]),
  glass('window_left', [0.18, 0.44, 0.32, 0.62]), glass('rear_glass', [0.4, 0.47, 0.66, 0.6]),
]

export const SAMPLES: SampleVideo[] = [
  {
    id: 'child-rear', video: 'child-rear', reference: 'empty-cabin-ref.jpg', occupant: true,
    title: ['Trẻ trên ghế an toàn phía sau', 'Child in a rear child seat'],
    source: ['Nhóm tự quay, mặt đã làm mờ; detector không thấy trẻ', 'Recorded by the team, face pixelated; the detector misses the child'],
    truth: ['Có trẻ ở ghế sau bên phải', 'A child in the rear-right seat'],
    zones: SAME_CAR_SEATS({ child_seat: 'forward_facing' }),
  },
  {
    id: 'empty-cabin', video: 'empty-cabin', reference: 'empty-cabin-ref.jpg', occupant: false,
    title: ['Cabin trống', 'Empty cabin'],
    source: ['Nhóm tự quay, cùng xe, ghế trẻ em không có ai', 'Recorded by the team, same car, child seat unoccupied'],
    truth: ['Không có ai', 'Nobody inside'],
    zones: SAME_CAR_SEATS({ child_seat: 'forward_facing' }),
  },
  {
    id: 'rear-facing', video: 'empty-cabin', reference: 'empty-cabin-ref.jpg', occupant: true,
    title: ['Ghế trẻ em quay ngược', 'Rear-facing child seat'],
    source: ['Cùng video cabin trống; ghế sau phải khai báo là ghế quay ngược', 'Same empty-cabin clip; rear-right declared as a rear-facing seat'],
    truth: ['Camera không thể kiểm em bé trong ghế quay ngược: phải nhắc kiểm tra', 'The camera cannot see into a rear-facing seat: a check must be prompted'],
    zones: SAME_CAR_SEATS({ child_seat: 'rear_facing' }),
  },
  {
    id: 'adult-front', video: 'adult-front', occupant: true,
    title: ['Người lớn ghế trước', 'Adult in the front seat'],
    source: ['Nhóm tự quay, mặt đã làm mờ', 'Recorded by the team, face pixelated'],
    truth: ['Có người lớn ở ghế trước bên trái', 'An adult in the front-left seat'],
    zones: [seat('front_left', [0, 0.1, 0.5, 1]), seat('rear_center', [0.5, 0.3, 0.82, 1]), seat('rear_right', [0.82, 0.2, 1, 1]),
      glass('rear_glass', [0.45, 0.03, 0.9, 0.27])],
  },
  {
    id: 'ai-child', video: 'ai-child', occupant: true,
    title: ['Trẻ ngồi ghế nâng, cửa kính thấy đường', 'Child on a booster, street visible through the glass'],
    source: ['Video do AI tạo (Gemini), không có người thật', 'AI-generated video (Gemini), no real person'],
    truth: ['Có trẻ ở ghế bên phải', 'A child on the right seat'],
    zones: [seat('seat_left', [0.18, 0.35, 0.45, 1]), seat('seat_middle', [0.42, 0.38, 0.56, 0.85]), seat('seat_right', [0.55, 0.38, 0.85, 1]),
      glass('window_left', [0, 0.28, 0.2, 0.6]), glass('window_right', [0.8, 0.28, 1, 0.62]), glass('rear_glass', [0.36, 0.33, 0.62, 0.42])],
  },
]

export function sampleUrl(file: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.endsWith('/') ? base : `${base}/`}samples/${file.includes('.') ? file : `${file}.mp4`}`
}

export const SEAT_STATE: Record<string, [vi: string, en: string]> = {
  OCCUPIED: ['có người (detector)', 'occupied (detector)'],
  SEAT_CHANGED: ['khác ảnh cabin trống: có thể có người', 'differs from the empty cabin: possible occupant'],
  REAR_FACING_UNVERIFIABLE: ['ghế quay ngược: camera không kiểm được', 'rear-facing seat: camera cannot verify'],
  EMPTY_VERIFIED: ['trống (khớp ảnh tham chiếu)', 'empty (matches the reference)'],
  PENDING_EMPTY: ['đang xác minh trống…', 'verifying empty…'],
  CANDIDATE: ['nghi ngờ (cần 3/5 khung)', 'candidate (needs 3 of 5)'],
  NO_HIT: ['không thấy (chưa xác minh)', 'nothing seen (not verified)'],
}

/** A box drawn by dragging, in normalised coordinates; null when it is too small to be meant. */
export function boxFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): V1CabinZone['box'] | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const x1 = clamp(Math.min(a.x, b.x)), x2 = clamp(Math.max(a.x, b.x))
  const y1 = clamp(Math.min(a.y, b.y)), y2 = clamp(Math.max(a.y, b.y))
  if (x2 - x1 < MIN_ZONE || y2 - y1 < MIN_ZONE) return null
  const r = (v: number) => Math.round(v * 1000) / 1000
  return [r(x1), r(y1), r(x2), r(y2)]
}

export function nextZoneName(zones: V1CabinZone[], kind: V1CabinZone['kind']): string {
  const prefix = kind === 'seat' ? 'seat' : 'glass'
  let n = 1
  while (zones.some(z => z.name === `${prefix}_${n}`)) n += 1
  return `${prefix}_${n}`
}

// -- metrics ---------------------------------------------------------------------------------------------------------
export interface FrameRecord { sentAt: number; doneAt: number; outcome: 'ok' | 'late' | 'failed'; serverMs?: number; inferenceMs?: number | null }

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]!
}

export interface SimMetrics {
  sent: number
  ok: number
  late: number
  failed: number
  roundTrip: { p50: number | null; p95: number | null }
  inference: { p50: number | null; p95: number | null }
  server: { p50: number | null }
  /** Processed frames per second over the last 10 s. */
  fps: number
  /** From pressing Start to the first WARNING/CRITICAL verdict. */
  firstAlertMs: number | null
}

export function summarize(records: FrameRecord[], startedAt: number | null, firstAlertAt: number | null, now: number): SimMetrics {
  const ok = records.filter(r => r.outcome === 'ok')
  const trips = ok.map(r => r.doneAt - r.sentAt)
  const inference = ok.map(r => r.inferenceMs).filter((v): v is number => typeof v === 'number')
  const server = ok.map(r => r.serverMs).filter((v): v is number => typeof v === 'number')
  const recent = ok.filter(r => now - r.doneAt <= 10_000)
  const window = startedAt === null ? 10_000 : Math.min(10_000, Math.max(1_000, now - startedAt))
  return {
    sent: records.length, ok: ok.length,
    late: records.filter(r => r.outcome === 'late').length,
    failed: records.filter(r => r.outcome === 'failed').length,
    roundTrip: { p50: percentile(trips, 50), p95: percentile(trips, 95) },
    inference: { p50: percentile(inference, 50), p95: percentile(inference, 95) },
    server: { p50: percentile(server, 50) },
    fps: Math.round((recent.length / (window / 1000)) * 10) / 10,
    firstAlertMs: startedAt !== null && firstAlertAt !== null ? firstAlertAt - startedAt : null,
  }
}

export const isAlert = (risk: string | null | undefined) => risk === 'WARNING' || risk === 'CRITICAL'

/** Does the backend's verdict agree with what a person sees in the sample? Pending until there is a verdict. */
export function expectation(occupant: boolean, result: V1VideoFrameResult | undefined): 'pass' | 'fail' | 'camera' | 'pending' {
  if (!result || !result.risk_level) return 'pending'
  if (result.camera_status !== 'OK') return 'camera'
  return isAlert(result.risk_level) === occupant ? 'pass' : 'fail'
}

export const ms = (value: number | null | undefined) => (typeof value === 'number' ? `${Math.round(value)} ms` : '—')
