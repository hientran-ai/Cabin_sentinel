// Count-per-frame read model for the cockpit. Pure presentation of what the backend already committed:
// nothing here feeds back into risk, rules, TTL or actions. One frame, no accumulation over time, no unique tracking.
import type { ServerState } from './types'

export type CountStatus = 'NO_DATA' | 'CURRENT' | 'STALE' | 'UNAVAILABLE' | 'WRONG_SESSION'
/** disabled / load_failed / error mean "no age evidence", never "adult" and never "no child". */
export type AgeCapability = 'AVAILABLE' | 'DISABLED' | 'LOAD_FAILED' | 'ERROR' | 'UNKNOWN'

export interface FrameCounts {
  status: CountStatus
  frameId: string | null
  observedAt: string | null
  /** why the counts are not current (shown to the user as-is) */
  reason: string | null
  age: AgeCapability
  /** null = no usable evidence for this group; 0 only when a current accepted frame was inspected and nothing matched */
  person: number | null
  child: number | null
  adult: number | null
  /** people whose age group is unknown; equals person when the age channel is not available */
  ageUnknown: number | null
  pet: number | null
  dog: number | null
  cat: number | null
  /** other objects: no analytics channel exists yet, so this is always null */
  items: null
  /** last counts of an old frame, kept only so a stale screen can say what it last saw; never a current number */
  lastKnown: { person: number; pet: number; frameId: string } | null
}

const EMPTY = { person: null, child: null, adult: null, ageUnknown: null, pet: null, dog: null, cat: null, items: null, lastKnown: null } as const

export function ageCapability(status: string | null | undefined): AgeCapability {
  switch (status) {
    case 'ok': return 'AVAILABLE'
    case 'disabled': return 'DISABLED'
    case 'load_failed': return 'LOAD_FAILED'
    case 'error': return 'ERROR'
    default: return 'UNKNOWN'
  }
}

export const AGE_TEXT: Record<AgeCapability, string> = {
  AVAILABLE: 'Bộ phân loại tuổi đang chạy (chỉ là bằng chứng phụ, không đổi mức rủi ro)',
  DISABLED: 'Chưa bật bộ phân loại tuổi. Không có nhãn trẻ em/người lớn từ camera',
  LOAD_FAILED: 'Bộ phân loại tuổi không nạp được. Không có nhãn trẻ em/người lớn từ camera',
  ERROR: 'Bộ phân loại tuổi lỗi ở khung này. Tuổi chưa xác minh',
  UNKNOWN: 'Chưa rõ trạng thái bộ phân loại tuổi',
}

/** Age capability as the evidence panel should state it: per-frame status first, server status as the fallback. */
export function ageCapabilityOf(state: ServerState | null | undefined, serverStatus?: string | null): AgeCapability {
  const frame = state?.last_observation?.vision?.age_classifier?.status
  return ageCapability(frame ?? state?.model?.age_classifier ?? serverStatus)
}

export function frameCounts(i: { state: ServerState | null; sessionId: string | null; visionFresh: boolean; connection: 'ok' | 'lost' }): FrameCounts {
  const base = { ...EMPTY, frameId: null, observedAt: null, reason: null, age: 'UNKNOWN' as AgeCapability }
  const { state } = i
  if (!state) return { ...base, status: 'NO_DATA', reason: 'Chưa có dữ liệu từ máy chủ' }
  if (!i.sessionId || state.session_id !== i.sessionId) return { ...base, status: 'WRONG_SESSION', reason: 'Dữ liệu không thuộc phiên đang mở' }
  const obs = state.last_observation
  if (!obs) return { ...base, status: 'NO_DATA', reason: 'Chưa có khung hình nào được phân tích' }
  const common = { frameId: obs.frame_id, observedAt: obs.observed_at }
  if (obs.event_type === 'camera_status') {
    return { ...base, ...common, status: 'UNAVAILABLE', reason: `Camera ${obs.camera_status ?? 'lỗi'}: không có khung để đếm` }
  }
  if (!obs.accepted) return { ...base, ...common, status: 'UNAVAILABLE', reason: 'Khung gần nhất không được chấp nhận' }
  const dets = obs.vision?.detections
  if (!Array.isArray(dets)) return { ...base, ...common, status: 'UNAVAILABLE', reason: 'Khung không kèm kết quả nhận diện' }

  const age = ageCapability(obs.vision?.age_classifier?.status)
  const people = dets.filter((d) => d.class === 'person')
  const dog = dets.filter((d) => d.class === 'dog').length, cat = dets.filter((d) => d.class === 'cat').length
  const ageOk = age === 'AVAILABLE'
  const child = ageOk ? people.filter((d) => d.age_group === 'child').length : null
  const adult = ageOk ? people.filter((d) => d.age_group === 'adult').length : null
  const counts = {
    person: people.length, child, adult, ageUnknown: ageOk ? people.length - (child ?? 0) - (adult ?? 0) : people.length,
    pet: dog + cat, dog, cat, items: null,
  }
  const current = i.visionFresh && i.connection === 'ok'
  if (!current) {
    return { ...base, ...common, age, status: 'STALE', reason: i.connection === 'lost' ? 'Mất kết nối máy chủ: đây là khung cũ' : 'Khung đã hết hiệu lực: đây không phải hiện tại',
      lastKnown: { person: counts.person, pet: counts.pet, frameId: obs.frame_id } }
  }
  return { ...base, ...common, age, ...counts, status: 'CURRENT', reason: null }
}

export type TrackKey = 'child' | 'person' | 'pet' | 'items'
export type TrackStatus = 'READY' | 'OFF' | 'ERROR' | 'NOT_SUPPORTED' | 'UNKNOWN'
export interface TrackCap { key: TrackKey; status: TrackStatus; reason: string }

/** What the server can really track, read from the model status. Nothing is assumed: a class the status does not list is NOT_SUPPORTED,
 *  and forgotten-item tracking stays NOT_SUPPORTED until the server reports `items_tracking`. */
export function trackingCaps(model: { ready?: boolean; classes_used?: string[]; age_classifier?: string; items_tracking?: boolean } | null | undefined): TrackCap[] {
  if (!model) return (['child', 'person', 'pet', 'items'] as const).map((key) => ({ key, status: 'UNKNOWN' as const, reason: 'Chưa có thông tin từ máy chủ' }))
  const classes = model.classes_used ?? [], ready = !!model.ready
  const det = (c: string) => ready && classes.includes(c)
  const age = ageCapability(model.age_classifier)
  return [
    { key: 'child', status: age === 'AVAILABLE' ? 'READY' : age === 'ERROR' || age === 'LOAD_FAILED' ? 'ERROR' : age === 'DISABLED' ? 'OFF' : 'UNKNOWN', reason: age === 'AVAILABLE' ? 'Bộ phân loại tuổi đang chạy' : AGE_TEXT[age] },
    { key: 'person', status: det('person') ? 'READY' : ready ? 'NOT_SUPPORTED' : 'ERROR', reason: det('person') ? 'Model phát hiện người' : ready ? 'Model không báo lớp người' : 'Model chưa sẵn sàng' },
    { key: 'pet', status: det('dog') || det('cat') ? 'READY' : ready ? 'NOT_SUPPORTED' : 'ERROR', reason: det('dog') || det('cat') ? `Chỉ nhận ${[det('dog') ? 'chó' : '', det('cat') ? 'mèo' : ''].filter(Boolean).join(' và ')}` : 'Model không báo lớp thú cưng' },
    { key: 'items', status: model.items_tracking === true ? 'READY' : 'NOT_SUPPORTED', reason: model.items_tracking === true ? 'Máy chủ có kênh theo dõi đồ vật' : 'Máy chủ chưa có kênh theo dõi đồ vật bỏ quên (cần theo dõi theo thời gian, không chỉ một khung)' },
  ]
}
