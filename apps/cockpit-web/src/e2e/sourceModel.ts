// One place that decides what the observation source is called and what may be said about it. Pure functions: the screens only
// format these answers. Nothing here computes cabin risk; it only refuses to present a stale, foreign or missing result as current.
import type { FrameCounts } from './cabinCounts'
import type { Tone, View } from './view'

/** How the picture on screen got there. LIVE = a camera of this device, DEMO = a bundled sample clip, UPLOAD = an image the user chose. */
export type SourceBadge = 'LIVE' | 'DEMO' | 'UPLOAD' | 'SIM' | 'NONE'
/** 'simulated' = no picture exists at all (e.g. a blocked camera): the screen says so, it never plays an unrelated video. */
export type SourceKindLite = 'none' | 'clip' | 'upload' | 'device' | 'simulated'

export const BADGE_TEXT: Record<SourceBadge, string> = { LIVE: 'LIVE', DEMO: 'DEMO', UPLOAD: 'ẢNH TẢI LÊN', SIM: 'MÔ PHỎNG', NONE: 'CHƯA CÓ NGUỒN' }
export const BADGE_LONG: Record<SourceBadge, string> = {
  LIVE: 'Camera trực tiếp của thiết bị này', DEMO: 'Clip mẫu có sẵn, không phải camera', UPLOAD: 'Ảnh do bạn tải lên', SIM: 'Mô phỏng, không có hình thật', NONE: 'Chưa chọn nguồn quan sát',
}

export const badgeOfKind = (k: SourceKindLite): SourceBadge => (k === 'device' ? 'LIVE' : k === 'clip' ? 'DEMO' : k === 'upload' ? 'UPLOAD' : k === 'simulated' ? 'SIM' : 'NONE')

/** Backend `source` field of an observation (CLIP_FRAME | DEVICE_CAMERA | UPLOAD) as a badge. Anything else is not claimed to be anything. */
export function badgeOfObservation(source: string | null | undefined): SourceBadge {
  switch (source) {
    case 'DEVICE_CAMERA': return 'LIVE'
    case 'CLIP_FRAME': return 'DEMO'
    case 'UPLOAD': return 'UPLOAD'
    default: return 'NONE'
  }
}

export type DevicePhase = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'busy' | 'insecure' | 'unsupported' | 'error'

/** What a failed getUserMedia call means for the person in front of the screen. `retry` = trying again can help without changing anything else. */
export interface CameraFailure { phase: DevicePhase; title: string; hint: string; retry: boolean }

export function classifyCameraError(name: string | null | undefined): CameraFailure {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return { phase: 'denied', title: 'Camera bị chặn', hint: 'Cho phép camera cho trang này (biểu tượng khoá hoặc camera cạnh thanh địa chỉ, hoặc Cài đặt trình duyệt), rồi bấm Thử lại.', retry: true }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { phase: 'unavailable', title: 'Không tìm thấy camera', hint: 'Thiết bị này không có camera hoặc camera đã bị rút ra. Cắm camera rồi bấm Thử lại, hoặc dùng clip mẫu.', retry: true }
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return { phase: 'busy', title: 'Camera đang được ứng dụng khác dùng', hint: 'Đóng ứng dụng hoặc tab đang dùng camera (cuộc gọi video, ứng dụng quay phim) rồi bấm Thử lại.', retry: true }
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return { phase: 'error', title: 'Camera không đáp ứng yêu cầu', hint: 'Đã thử lại với cấu hình đơn giản nhưng vẫn không được. Thử Chuyển camera hoặc dùng clip mẫu.', retry: true }
    case 'InsecureContext':
      return { phase: 'insecure', title: 'Cần kết nối bảo mật (HTTPS)', hint: 'Trình duyệt chỉ cho mở camera trên trang https hoặc localhost. Mở lại bằng địa chỉ https.', retry: false }
    case 'Unsupported':
      return { phase: 'unsupported', title: 'Trình duyệt không hỗ trợ camera', hint: 'Dùng Safari, Chrome hoặc Edge bản mới, hoặc dùng clip mẫu.', retry: false }
    default:
      return { phase: 'error', title: 'Không mở được camera', hint: 'Bấm Thử lại. Nếu vẫn lỗi, tải lại trang hoặc dùng clip mẫu.', retry: true }
  }
}

export type AnalysisState =
  | 'none'          // nothing is being observed
  | 'running'       // frames of this source are being analysed by the model
  | 'preview-only'  // the picture is shown but never analysed: no result may be claimed for it
  | 'waiting'       // analysis is expected but no result of this source has arrived yet
  | 'unavailable'   // simulated source with no picture: AI vision cannot verify the cabin; only non-vision evidence exists

export interface SourceSummary {
  badge: SourceBadge
  analysis: AnalysisState
  /** short sentence for the status row */
  line: string
}

export interface SourceInput {
  runId?: string
  lastFrameId?: string
  kind: SourceKindLite
  running: boolean
  /** the picture is shown here only: frames are not sent anywhere (device camera on a hosted build) */
  localOnly: boolean
  label: string
  /** badge of the newest committed observation, when this browser has one */
  lastObservation: SourceBadge | null
}

export function summarizeSource(i: SourceInput): SourceSummary {
  const badge = badgeOfKind(i.kind)
  if (badge === 'NONE') return { badge, analysis: 'none', line: 'Chưa có nguồn quan sát. Chọn camera của bạn, một clip mẫu hoặc tải ảnh.' }
  if (badge === 'SIM') return { badge, analysis: 'unavailable', line: 'MÔ PHỎNG CAMERA BỊ CHE: AI Vision không thể xác minh cabin. Chỉ còn dữ liệu cảm biến mô phỏng.' }
  if (badge === 'LIVE' && i.localOnly) {
    return { badge, analysis: 'preview-only', line: 'Hình chỉ hiển thị trên máy bạn và không được gửi đi, nên AI chưa phân tích khung này.' }
  }
  if (!i.running && i.kind !== 'upload') return { badge, analysis: 'none', line: 'Nguồn đã dừng; kết quả gần nhất không phải quan sát hiện tại.' }
  const arrived = resultBelongsToSource(badge, i.lastObservation, i.runId, i.lastFrameId)
  return { badge, analysis: arrived ? 'running' : 'waiting', line: arrived ? `${BADGE_LONG[badge]} · đã có kết quả phân tích` : `${BADGE_LONG[badge]} · đang chờ kết quả phân tích` }
}

/** A result may be shown as the result of the current source only when it came from that source. */
export const resultBelongsToSource = (current: SourceBadge, observation: SourceBadge | null, runId?: string, frameId?: string): boolean =>
  current !== 'NONE' && observation !== null && current === observation && (!runId || !!frameId?.includes(`-${runId}-`))

export type CabinStatus = 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'
export const CABIN_STATUS_TEXT: Record<CabinStatus, string> = { SAFE: 'SAFE', NOTICE: 'LƯU Ý', WARNING: 'WARNING', CRITICAL: 'CRITICAL', UNKNOWN: 'UNKNOWN' }
export const CABIN_STATUS_TONE: Record<CabinStatus, Tone> = { SAFE: 'ok', NOTICE: 'info', WARNING: 'warning', CRITICAL: 'critical', UNKNOWN: 'unknown' }

/** Four-state summary for the first screen. UNKNOWN whenever the verdict is not current, the link is down or the live picture is not analysed.
 *  SAFE only ever means "no risk found in current evidence" (SR-01), never "the cabin is empty". */
export function cabinStatus(view: View, source: SourceSummary): CabinStatus {
  if (!view.current || view.tone === 'unknown') return 'UNKNOWN'
  if (source.analysis === 'preview-only') return 'UNKNOWN'
  switch (view.tone) {
    case 'critical': return 'CRITICAL'
    case 'warning': return 'WARNING'
    case 'info': return 'NOTICE'
    case 'ok': return source.analysis === 'running' ? 'SAFE' : 'UNKNOWN'
    default: return 'UNKNOWN'
  }
}

export type FeedStatus = 'LIVE' | 'DEMO' | 'UPLOAD' | 'SIM' | 'OFFLINE' | 'RECONNECTING' | 'SYNCING' | 'NO_DATA'
export const FEED_TEXT: Record<FeedStatus, string> = { LIVE: 'LIVE', DEMO: 'DEMO', UPLOAD: 'ẢNH TẢI LÊN', SIM: 'MÔ PHỎNG', OFFLINE: 'OFFLINE', RECONNECTING: 'ĐANG NỐI LẠI', SYNCING: 'ĐANG ĐỒNG BỘ', NO_DATA: 'NO DATA' }

/** Connectivity of the observation source for the first screen. OFFLINE wins: with the server link down nothing on screen is current. */
export type VehicleLinkState = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'SYNCING'
/** `connection` = browser to backend. `vehicle` = the (simulated) vehicle edge link reported by the backend. They are different things. */
export function feedStatus(source: SourceSummary, connection: 'ok' | 'lost', vehicle: VehicleLinkState = 'CONNECTED'): FeedStatus {
  if (connection === 'lost') return 'OFFLINE'
  if (vehicle === 'DISCONNECTED') return 'OFFLINE'
  if (vehicle === 'RECONNECTING') return 'RECONNECTING'
  if (vehicle === 'SYNCING') return 'SYNCING'
  if (source.badge === 'NONE') return 'NO_DATA'
  return source.badge
}

/** The counts the first screen may print. null = say "no analysis result" instead of any number (never 0 by default). */
export function countsForSource(counts: FrameCounts, source: SourceSummary, observation: SourceBadge | null): FrameCounts | null {
  if (counts.status !== 'CURRENT') return null
  if (source.analysis !== 'running') return null
  if (!resultBelongsToSource(source.badge, observation)) return null
  return counts
}

/** Why there is no number to show, in one sentence the first screen can print. */
export function noResultReason(counts: FrameCounts, source: SourceSummary, observation: SourceBadge | null): string {
  if (source.analysis === 'preview-only') return 'Camera trực tiếp chưa được AI phân tích trên bản trực tuyến (hình không rời thiết bị).'
  if (source.badge === 'NONE') return counts.status === 'STALE' ? 'Nguồn đã dừng. Kết quả cũ không còn hiệu lực.' : 'Chưa có nguồn quan sát.'
  if (counts.status === 'CURRENT' && !resultBelongsToSource(source.badge, observation)) return `Kết quả gần nhất thuộc nguồn ${BADGE_TEXT[observation ?? 'NONE']}, không phải ${BADGE_TEXT[source.badge]}.`
  if (counts.status === 'STALE') return counts.reason ?? 'Khung đã hết hiệu lực.'
  if (counts.status === 'UNAVAILABLE' || counts.status === 'WRONG_SESSION') return counts.reason ?? 'Không có khung để đếm.'
  return 'Chưa có kết quả phân tích.'
}

/** Box in 0..1 of the analysed picture, or null. The backend sends pixel xyxy of the JPEG it analysed; anything else is not drawn. */
export function normalizeBox(bbox: unknown, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !(width > 0) || !(height > 0)) return null
  if (!bbox.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const [x1, y1, x2, y2] = bbox as [number, number, number, number]
  if (x2 <= x1 || y2 <= y1) return null
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const x = clamp(x1 / width), y = clamp(y1 / height), r = clamp(x2 / width), b = clamp(y2 / height)
  if (r - x <= 0 || b - y <= 0) return null
  return { x, y, w: r - x, h: b - y }
}
