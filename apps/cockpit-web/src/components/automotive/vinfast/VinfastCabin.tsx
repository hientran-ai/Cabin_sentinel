// CabinSentinel inside the VinFast HMI: a tile in the notification slot and a detail panel. A concept extension, not an OEM CPD screen.
// Read-only on the cockpit: acknowledging and closing an incident stay on the owner's phone. Wording follows the backend read model.
import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ScanEye, Smartphone } from 'lucide-react'
import { api } from '../../../e2e/api'
import { AGE_TEXT, type FrameCounts } from '../../../e2e/cabinCounts'
import { onThumb } from '../../../e2e/capture'
import { unlock } from '../../../e2e/comfortAudio'
import { liveAge, useTick, useView } from '../../../e2e/hooks'
import { useE2e } from '../../../e2e/store'
import { ageText, OCCUPANCY } from '../../../e2e/view'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { IC, Panel, SimChip } from './parts'
import { useFrameCounts, useVinfast } from './useVinfast'

/** Concept video of the manufacturer's child-presence detection (frames of Aurora's 3D animation). Illustration only: no result is read from it. */
function CpdVideo() {
  const B = import.meta.env.BASE_URL
  return <video src={`${B}vinfast/clips/cpd.mp4`} poster={`${B}vinfast/clips/cpd-poster.jpg`} autoPlay muted loop playsInline preload="metadata" aria-label="Video minh hoạ phát hiện trẻ trong xe" />
}

const CAMERA_VI: Record<string, string> = { OK: 'Hoạt động', BLOCKED: 'Bị che', DISCONNECTED: 'Mất kết nối', NO_FEED: 'Không có hình', ERROR: 'Lỗi' }
const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n))

/** Why a count is not a number. Never "0": 0 only exists when a current frame was inspected. */
function missing(c: FrameCounts, kind: 'person' | 'age' | 'pet' | 'items'): string {
  if (kind === 'items') return 'Chưa hỗ trợ'
  if (c.status === 'NO_DATA') return 'Chưa có dữ liệu'
  if (c.status === 'WRONG_SESSION') return 'Chưa xác minh'
  if (c.status === 'STALE') return 'Khung cũ'
  if (c.status === 'UNAVAILABLE') return 'Không có khung'
  if (kind === 'age') return c.age === 'ERROR' ? 'Lỗi ở khung này' : c.age === 'LOAD_FAILED' ? 'Model tuổi không nạp' : c.age === 'DISABLED' ? 'Chưa hỗ trợ' : 'Chưa xác minh'
  return 'Chưa xác minh'
}

function Num({ value, note }: { value: number | null; note: string }) {
  return <motion.b key={String(value)} className={value == null ? 'na' : ''} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .12 }}>{fmt(value)}<span style={{ fontWeight: 500 }}>{value == null ? ` ${note}` : ''}</span></motion.b>
}

function whyText(view: ReturnType<typeof useView>) {
  if (view.kind === 'stale') return 'Ảnh gần nhất đã hết hiệu lực'
  if (view.kind === 'last-known') return 'Mất kết nối máy chủ, dữ liệu cũ'
  if (view.kind === 'waiting') return 'Chưa nhận quan sát nào'
  return view.caution ?? view.reason
}

/** Tile in the Notification slot of the home screen. It reflects the committed state immediately, with no intro or transition gating it. */
export function VinfastCabinTile() {
  useTick(1000)
  const view = useView(), counts = useFrameCounts(), received = useE2e((s) => s.receivedPerf), state = useE2e((s) => s.state), show = useVinfast((s) => s.show)
  const setOverlay = useUi((s) => s.setOverlay)
  const main = view.kind === 'stale' ? 'Chưa thể xác minh cabin' : view.headline
  const age = liveAge(state?.freshness.vision, received)
  const tone = view.kind === 'stale' ? 'unknown' : view.tone
  return (
    <button type="button" className="vf-cabin vf-glass vf-press" data-tone={tone} data-testid="vf-cabin-tile" onClick={() => setOverlay('cabin')}
      aria-label={`Giám sát cabin: ${main}. ${whyText(view)}. Mở chi tiết`}>
      <span className="head"><ScanEye {...IC} className={`vf-tone-${tone}`} />CabinSentinel · concept tích hợp<span style={{ flex: 1 }} />{age != null && <span className="vf-cap">ảnh {ageText(age)}</span>}</span>
      <span className={`main vf-tone-${tone === 'ok' ? 'ok' : tone}`} style={tone === 'ok' ? { color: 'var(--vf-text)' } : undefined}>{main}</span>
      <span className="why">{whyText(view)}</span>
      <span className="counts" aria-label="Đếm theo khung gần nhất">
        {([['child', 'Trẻ em', counts.child], ['person', 'Người', counts.person], ['pet', 'Thú cưng', counts.pet], ['items', 'Đồ vật', counts.items]] as const).filter(([k]) => show[k]).map(([k, l, n]) => (
          <span key={k} className="vf-count"><Num value={n} note="" /><span>{l}</span></span>))}
      </span>
    </button>
  )
}

function Group({ label, value, note, sub }: { label: string; value: number | null; note: string; sub?: ReactNode }) {
  return <div className="vf-group" data-testid={`vf-group-${label}`}><span>{label}</span><Num value={value} note="" />{value == null ? <small>{note}</small> : <small>{sub ?? 'theo khung gần nhất'}</small>}</div>
}

export function VinfastCabinDetail() {
  useTick(1000)
  const view = useView(), counts = useFrameCounts()
  const state = useE2e((s) => s.state), received = useE2e((s) => s.receivedPerf), run = useE2e((s) => s.care), service = useE2e((s) => s.service)
  const sim = useVehicle((s) => s.cabinTemperature), setOverlay = useUi((s) => s.setOverlay)
  const [tab, setTab] = useState<'overview' | 'intro' | 'evidence'>('overview')
  const [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => onThumb(setThumb), [])
  const obs = state?.last_observation, care = state?.care, incident = state?.incident
  const measured = state?.sensor_snapshot?.temperature
  const incidentText = !incident ? 'Không có' : incident.status !== 'OPEN' ? 'Đã đóng' : incident.acknowledged_at ? 'Đang mở · chủ xe đã xem' : 'Đang mở · chưa ai xem'
  const note = view.kind === 'stale' ? 'Không còn quan sát mới trong hạn. Đây là kết quả gần nhất, không phải hiện tại.' : view.kind === 'last-known' ? 'Mất kết nối máy chủ. Đang hiển thị dữ liệu cũ.'
    : view.kind === 'waiting' ? 'Chưa có quan sát nào. Chọn nguồn camera ở bảng mô phỏng bên ngoài màn xe.' : view.caution
  const age = liveAge(state?.freshness.vision, received)
  const model = state?.model ?? service?.model
  return (
    <Panel title="Giám sát cabin" label="Giám sát cabin" tag={<><SimChip /><span className="vf-chip">Concept tích hợp</span></>}>
      <div className="vf-tabs" role="tablist" style={{ margin: '0 32px 14px' }}>
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Tổng quan</button>
        <button type="button" role="tab" aria-selected={tab === 'intro'} onClick={() => setTab('intro')} data-testid="vf-tab-intro">Cách hoạt động</button>
        <button type="button" role="tab" aria-selected={tab === 'evidence'} onClick={() => setTab('evidence')} data-testid="vf-tab-evidence">Bằng chứng</button>
      </div>
      {tab === 'overview' ? (
        <div className="vf-cabin-detail vf-tabpane" data-testid="vf-cabin-detail">
          <figure className="vf-cabin-visual" style={{ margin: 0 }}>
            {thumb ? <img src={thumb} alt="Khung hình gần nhất đã gửi, đã làm mờ" /> : <CpdVideo />}
            <figcaption>{thumb ? 'Khung gần nhất đã gửi · làm mờ khi hiển thị' : 'Video minh hoạ khái niệm phát hiện trẻ trong xe. Chưa có khung hình thật; chưa xác minh vị trí ghế.'}</figcaption>
          </figure>
          <div className="vf-scroll">
            <div className={`vf-title vf-tone-${view.kind === 'stale' ? 'unknown' : view.tone}`}>{view.kind === 'stale' ? 'Chưa thể xác minh cabin' : view.headline}</div>
            <p className="vf-body" style={{ marginTop: 4 }}>{view.reason}</p>
            {note && <p className="vf-note" style={{ marginTop: 6, color: view.kind === 'current' ? undefined : 'var(--vf-warning)' }}>{note}</p>}
            <div className="vf-groups" style={{ marginTop: 16 }} role="group" aria-label="Đếm theo khung">
              <Group label="Người" value={counts.person} note={missing(counts, 'person')} />
              <Group label="Trẻ em" value={counts.child} note={missing(counts, 'age')} sub="bằng chứng tuổi phụ" />
              <Group label="Người lớn" value={counts.adult} note={missing(counts, 'age')} sub="bằng chứng tuổi phụ" />
              <Group label="Chưa rõ tuổi" value={counts.ageUnknown} note={missing(counts, 'person')} />
              <Group label="Thú cưng" value={counts.pet} note={missing(counts, 'pet')} sub={`chó ${fmt(counts.dog)} · mèo ${fmt(counts.cat)}`} />
              <Group label="Đồ vật" value={null} note="Chưa hỗ trợ" />
            </div>
            <p className="vf-note" style={{ marginTop: 10 }}>Đếm trong một khung hình đã được chấp nhận, không cộng qua nhiều khung. Chưa xác minh vị trí ghế. “Người” không có nghĩa là trẻ em. {counts.status === 'STALE' && counts.lastKnown ? `Khung cũ gần nhất: ${counts.lastKnown.person} người, ${counts.lastKnown.pet} thú (không phải hiện tại).` : ''}</p>
            <dl className="vf-evid" style={{ marginTop: 14 }}><dl style={{ margin: 0 }}>
              <dt>Trong xe</dt><dd>{state ? OCCUPANCY[state.occupancy_state] : '—'}</dd>
              <dt>Camera</dt><dd>{obs?.source_label ?? 'Chưa có nguồn'} · {state?.camera_status ? CAMERA_VI[state.camera_status] ?? state.camera_status : '—'}</dd>
              <dt>Ảnh cập nhật</dt><dd>{age != null ? `${ageText(age)} trước` : '—'}</dd>
              <dt>Nhiệt độ cabin</dt><dd>{typeof measured === 'number' ? `${measured.toFixed(1)}°C · cảm biến mô phỏng` : `${sim.toFixed(1)}°C · mô phỏng của xe (chưa có số backend)`}</dd>
              <dt>Sự cố</dt><dd>{incidentText}</dd></dl></dl>
            {care?.can_start && care.status !== 'ACTIVE' && (
              <div className="vf-zone" style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 0, marginTop: 8 }}>
                <div style={{ flex: 1 }}><div className="vf-body">Người lớn đang nghỉ trong xe?</div><div className="vf-cap">Bật chế độ cắm trại giữ điều hoà. Chủ xe vẫn nhận cảnh báo.</div></div>
                <button type="button" className="vf-btn is-on vf-press" onClick={() => { unlock(); void run((s) => api.careStart(s, { profile: 'ADULT', music: 'ambient' }, 'COCKPIT'), 'Đã bật chế độ cắm trại.') }}>Bật cắm trại</button>
              </div>)}
            <p className="vf-note" style={{ marginTop: 10 }}>Xác nhận đã xem và đóng sự cố thực hiện trên điện thoại chủ xe.</p>
            <button type="button" className="vf-btn vf-press" style={{ marginTop: 8 }} onClick={() => setOverlay('phone')}><Smartphone {...IC} />Trạng thái điện thoại chủ xe</button>
          </div>
        </div>
      ) : tab === 'intro' ? (
        <div className="vf-cpd-wrap vf-tabpane" data-testid="vf-cabin-intro">
          <div className="vf-cpd">
            <figure className="vf-cabin-visual big" style={{ margin: 0 }}><CpdVideo /><figcaption>Video minh hoạ khái niệm “Phát hiện trẻ trong xe” của hãng. Kết quả thật của CabinSentinel nằm ở tab Tổng quan, không lấy từ video này.</figcaption></figure>
            <ol className="vf-steps">
              <li><b>Quan sát</b><span>Camera trong xe gửi một khung hình mỗi giây. Ảnh gốc không rời thiết bị.</span></li>
              <li><b>Nhận diện</b><span>Model phát hiện người và thú cưng trong khung. Nhận diện tuổi chỉ là bằng chứng phụ và chỉ có khi được bật.</span></li>
              <li><b>Đánh giá</b><span>Luật an toàn xét cả nhiệt độ, khoá cửa và tài xế. Không phát hiện không có nghĩa là xe trống.</span></li>
              <li><b>Cảnh báo</b><span>Màn xe và điện thoại chủ xe nhận cùng một revision. Chỉ chủ xe mới xác nhận “Đã xem” và “Đã kiểm tra cabin”.</span></li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="vf-content vf-tabpane vf-evid" data-testid="vf-evidence">
          <p className="vf-note" style={{ marginBottom: 14, color: 'var(--vf-warning)' }}>Không phát hiện người/thú không chứng minh cabin trống: detector gốc có thể bỏ sót (SR-01 còn mở). Tuổi chỉ là bằng chứng phụ, không đổi mức rủi ro.</p>
          <dl>
            <dt>Revision · luật</dt><dd>{state ? `${state.revision} · ${state.rule_id}` : '—'}</dd>
            <dt>Quyết định backend</dt><dd>{state ? `${state.risk_level} (trước đó ${state.previous_risk_level ?? '—'}) · ${state.reason}` : '—'}</dd>
            <dt>Có người/thú</dt><dd>{state ? `${OCCUPANCY[state.occupancy_state]} · ${state.occupancy_reason_code}` : '—'}</dd>
            <dt>Hiện tại?</dt><dd>{state ? (state.decision_current ? 'có' : 'không (có nguồn đã cũ hoặc camera lỗi)') : '—'}</dd>
            <dt>Khung</dt><dd>{counts.frameId ?? '—'} · {counts.observedAt ? new Date(counts.observedAt).toLocaleTimeString('vi-VN') : '—'} · {counts.status}</dd>
            <dt>Phát hiện</dt><dd>{obs?.vision?.detections?.length ? obs.vision.detections.map((d) => `${d.class} ${(d.confidence * 100).toFixed(0)}%${d.age_group ? ` (${d.age_group})` : ''}`).join(', ') : obs?.camera_status ? `camera ${obs.camera_status}` : 'không có'}</dd>
            <dt>Bộ phân loại tuổi</dt><dd>{AGE_TEXT[counts.age]}</dd>
            <dt>Model</dt><dd>{model?.file ? `${model.file} · ${model.sha256?.slice(0, 12)}…` : 'chưa nạp'}</dd>
            <dt>Suy luận</dt><dd>{obs?.timings_ms?.infer_detector != null ? `${obs.timings_ms.infer_detector} ms (máy chủ demo)` : '—'}</dd>
            <dt>Nguồn dữ liệu</dt><dd>{state?.simulation ? `xe ${state.simulation.vehicle_source} · lệnh ${state.simulation.action_mode} · ảnh ${state.simulation.vision_source} · ${state.simulation.runtime}` : '—'}</dd>
          </dl>
        </div>
      )}
    </Panel>
  )
}
