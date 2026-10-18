// Pure presentation rules for the backend read model. No risk is ever computed here: when the backend has
// not answered (or the link is down) the UI says so; it never falls back to SAFE.
import type { NotificationItem, RiskLevel, SensorInput, ServerState } from './types'

export type Tone = 'ok' | 'info' | 'warning' | 'critical' | 'unknown'
export type ViewKind = 'no-session' | 'waiting' | 'current' | 'stale' | 'last-known' | 'vehicle-offline'

export interface View {
  kind: ViewKind
  tone: Tone
  headline: string
  reason: string
  /** extra line that must stay visible (SR-01: nothing detected is not an empty cabin) */
  caution: string | null
  /** current = fresh and the link is up; anything else must be shown as last-known */
  current: boolean
  revision: number | null
}

const HEADLINE: Record<RiskLevel, string> = {
  SAFE: 'Chưa thấy nguy cơ', NOTICE: 'Lưu ý', WARNING: 'Cảnh báo', CRITICAL: 'Nguy hiểm', ERROR: 'Không xác minh được',
}
const TONE: Record<RiskLevel, Tone> = { SAFE: 'ok', NOTICE: 'info', WARNING: 'warning', CRITICAL: 'critical', ERROR: 'unknown' }
/** Vietnamese wording for backend rule ids. The backend's own English `reason` stays visible in the evidence panel. */
export const RULE_VI: Record<string, string> = {
  HOT_OCCUPANT: 'Có người/thú trong xe đỗ đang nóng', HOT_ATTENDED_DRIVING: 'Xe đang chạy, có tài xế, trong xe nóng',
  BABY_SEAT_UNVERIFIED: 'Thấy ghế trẻ em, cần kiểm tra cabin', EV_PET_UNATTENDED: 'Chế độ thú cưng đang chạy, chưa xác nhận có người trông',
  ICE_REMOTE_START_OCCUPIED: 'Khởi động từ xa không xác nhận có người trông', ICE_REMOTE_START_EXPIRING: 'Khởi động từ xa sắp hết hạn, trong xe vẫn có người/thú',
  ICE_REMOTE_START_EXPIRED: 'Khởi động từ xa đã hết hạn, trong xe vẫn có người/thú', ATTENDED_DRIVING: 'Có tài xế và điều hoà đang chạy',
  COOL_OCCUPANT: 'Có người/thú còn lại trong xe', RADAR_FALLBACK: 'Radar báo có thể có người; chưa có hình ảnh xác nhận',
  SUSPECTED_OCCUPANT: 'Nghi có người/thú, cần xem lại', FORGOTTEN_ITEM: 'Có thể có đồ để quên trong xe',
  EMPTY_CABIN: 'Không phát hiện người/thú và radar không báo gì', CAMERA_UNAVAILABLE: 'Camera không thể xác minh cabin',
  SENSOR_UNAVAILABLE: 'Chưa có dữ liệu cảm biến', SENSOR_STALE: 'Dữ liệu cảm biến đã cũ', VISION_UNAVAILABLE: 'Chưa có hình ảnh mới còn hiệu lực',
  UNRESOLVED_OCCUPANT: 'Sự cố trước chưa đóng: cần người kiểm tra cabin',
  OCCUPANCY_UNVERIFIED: 'Chưa xác minh được cabin trống; model có thể bỏ sót người bị che hoặc quay lưng',
}
export const toneOf = (risk: RiskLevel | null | undefined): Tone => (risk ? TONE[risk] ?? 'unknown' : 'unknown')

/** `link` = the simulated VEHICLE link (backend). `connection` = browser to backend. Different causes, different wording. */
export function deriveView(i: { hasSession: boolean; state: ServerState | null; connection: 'ok' | 'lost'; link?: string }): View {
  const { state } = i
  if (!i.hasSession) return { kind: 'no-session', tone: 'unknown', headline: 'Chưa có phiên', reason: 'Chưa tạo phiên demo.', caution: null, current: false, revision: null }
  if (!state) return { kind: 'waiting', tone: 'unknown', headline: 'Chưa có dữ liệu', reason: i.connection === 'lost' ? 'Không kết nối được máy chủ.' : 'Chưa có quan sát nào được chấm điểm.', caution: null, current: false, revision: null }
  const caution = state.risk_level === 'SAFE'
    ? state.rule_id === 'EMPTY_CABIN' ? 'Không phát hiện người/thú không có nghĩa là xe trống. Model có thể bỏ sót.' : null
    : null
  const base = { tone: toneOf(state.risk_level), headline: HEADLINE[state.risk_level], reason: RULE_VI[state.rule_id] ?? state.reason, caution, revision: state.revision }
  if (i.connection !== 'lost' && (i.link === 'RECONNECTING' || i.link === 'DISCONNECTED')) {
    return { ...base, kind: 'vehicle-offline', current: false, tone: 'unknown', headline: 'Chưa thể xác minh',
      reason: 'Mất kết nối với xe. CabinSentinel không nhận được dữ liệu mới và hiện không thể xác minh tình trạng khoang xe.' }
  }
  if (i.connection === 'lost') return { ...base, kind: 'last-known', current: false, tone: 'unknown', headline: `Dữ liệu cũ · ${HEADLINE[state.risk_level]}` }
  if (!state.decision_current) return { ...base, kind: 'stale', current: false }
  return { ...base, kind: 'current', current: true }
}

/** Never let an older revision overwrite a newer one (late or reordered responses). */
export function mergeState(prev: ServerState | null, next: ServerState): ServerState {
  if (!prev || prev.session_id !== next.session_id) return next
  return next.revision >= prev.revision ? next : prev
}

export const OCCUPANCY: Record<ServerState['occupancy_state'], string> = {
  PRESENT: 'Có người/thú trong xe', SUSPECTED: 'Nghi có người/thú', ABSENT: 'Không phát hiện ai', UNKNOWN: 'Chưa xác minh',
}

export function ageText(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 0) return 'giờ máy lệch'
  return seconds < 10 ? `${seconds.toFixed(1)} s` : seconds < 120 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} phút`
}

export interface VehicleForSensor {
  gear: 'P' | 'R' | 'N' | 'D'; speedKph: number; locked: boolean; climateEnabled: boolean; cabinTemperature: number
  batteryLevel: number; windows: Record<string, 'closed' | 'vent' | 'open'>
}
export interface SimInput { engineOn: boolean; driverPresent: boolean; radar: boolean; mode: SensorInput['operation_mode']; hvacFault: boolean; telemetryEnabled?: boolean; tripEnded?: boolean }

/** Telemetry for the backend. Only vehicle facts; no risk, occupant or child field exists in this shape. */
export function buildSensor(v: VehicleForSensor, sim: SimInput): SensorInput {
  const states = Object.values(v.windows)
  return {
    temperature: Math.round(v.cabinTemperature * 10) / 10,
    engine_status: sim.engineOn ? 'ON' : 'OFF',
    doors_locked: v.locked, radar_presence: sim.radar, driver_present: sim.driverPresent,
    gear: v.gear, vehicle_speed_kph: Math.max(0, Math.round(v.speedKph * 10) / 10),
    hvac_status: sim.hvacFault ? 'FAULT' : v.climateEnabled ? 'ACTIVE' : 'INACTIVE',
    window_status: states.includes('open') ? 'OPEN' : states.includes('vent') ? 'VENTED' : 'CLOSED',
    powertrain_type: 'EV', operation_mode: sim.mode, battery_soc_pct: Math.round(v.batteryLevel),
    ...(sim.tripEnded !== undefined ? { trip_ended: sim.tripEnded } : {}),
  }
}

const REASONS: [RegExp, string][] = [
  [/presence is still detected/i, 'Vẫn phát hiện dấu hiệu hiện diện. Kiểm tra và đưa người/thú ra khỏi xe, cập nhật hình rồi thử lại.'],
  [/current sensor and camera/i, 'Cảm biến hoặc camera chưa xác minh được. Cập nhật dữ liệu mới trước khi đóng sự cố.'],
  [/sensor evidence conflicts/i, 'Các nguồn dữ liệu chưa thống nhất. Làm mới dữ liệu và kiểm tra cabin.'],
  [/explicit cabin check/i, 'Bạn cần xác nhận đã trực tiếp kiểm tra cabin.'],
  [/system time changed/i, 'Thời gian hệ thống đã thay đổi. Làm mới sự cố rồi kiểm tra lại.'],
  [/empty-cabin evidence/i, 'Chưa xác nhận được xe trống: cần quan sát mới, còn hiệu lực và không còn người/thú.'],
  [/state changed/i, 'Trạng thái đã thay đổi. Mở lại chi tiết sự cố rồi thử lại.'],
  [/not current/i, 'Sự cố này không còn là sự cố hiện tại.'],
  [/not current and open/i, 'Sự cố đã đóng hoặc không còn hiện tại.'],
]
export function friendlyError(detail: string): string {
  return REASONS.find(([re]) => re.test(detail))?.[1] ?? detail
}

export const PUSH_LABEL: Record<NotificationItem['channels']['push']['state'], string> = {
  PLANNED: 'Đã lên lịch gửi', NOT_PLANNED: 'Không có lệnh gửi push', SIMULATED: 'Bộ gửi mô phỏng đã trả kết quả', FAILED: 'Gửi thất bại', UNKNOWN: 'Chưa rõ kết quả',
}
export const FEED_LABEL: Record<NotificationItem['channels']['in_app_feed']['state'], string> = {
  PUBLISHED: 'Đã đăng lên máy chủ', IN_APP_DELIVERED: 'Điện thoại đã nhận',
}
