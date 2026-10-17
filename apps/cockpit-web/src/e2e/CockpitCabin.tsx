// Cockpit side of the same session: a status chip on the home screen and a detail sheet. Read-only on purpose:
// acknowledging and resolving are owner actions on the phone.
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import { onThumb } from './capture'
import { useE2e } from './store'
import { ageText, OCCUPANCY } from './view'
import { liveAge, useTick, useView } from './hooks'
import { TONE_ICON, TONE_TEXT } from './ui'
import { useUi } from '../store/uiStore'
import { PanelHeader, Row, Sheet, SimTag } from '../components/automotive/ui'
import { api } from './api'
import { unlock } from './comfortAudio'

/** Cabin strip under the car: label, one main message, one short cause, and a way into the details. Wording follows the backend
 *  (missing / stale / lost link / risk). The tint is neutral unless the backend reports a warning or critical state. */
export function CabinChip() {
  const view = useView()
  const Icon = TONE_ICON[view.tone] ?? ShieldAlert
  const setOverlay = useUi((s) => s.setOverlay)
  const cause = view.kind === 'stale' ? 'Ảnh gần nhất đã hết hiệu lực' : view.kind === 'last-known' ? 'Mất kết nối máy chủ, dữ liệu cũ' : view.kind === 'waiting' ? 'Chưa nhận quan sát nào' : (view.caution ?? view.reason)
  const main = view.kind === 'stale' ? 'Chưa thể xác minh cabin' : view.headline
  return (
    <button type="button" data-testid="cockpit-chip" onClick={() => setOverlay('cabin')} aria-label={`Giám sát cabin: ${main}. ${cause}. Mở chi tiết`}
      className={`flex w-full items-center gap-[1rem] rounded-[var(--r-pop)] px-[1rem] py-[.75rem] text-left ${view.tone === 'critical' ? 'su-alert-critical' : view.tone === 'warning' ? 'su-alert-warning' : 'su-glass-card'}`}>
      <Icon size="1.75rem" className={`shrink-0 ${view.tone === 'ok' ? 'text-[var(--cx-text-2)]' : TONE_TEXT[view.tone]}`} />
      <span className="min-w-0 grow">
        <span className="block t-label text-[var(--cx-text-2)]">Giám sát cabin</span>
        <span className={`block t-body ${view.tone === 'ok' ? 'text-[var(--cx-text)]' : TONE_TEXT[view.tone]}`}>{main}</span>
        <span className="block t-label text-[var(--cx-text-2)]">{cause}</span>
      </span>
      <CaretRight size="1.75rem" weight="bold" className="shrink-0 text-[var(--cx-text-2)]" />
    </button>
  )
}

export function E2eCabinMonitoring() {
  useTick(1000)
  const view = useView()
  const state = useE2e((s) => s.state), received = useE2e((s) => s.receivedPerf)
  const run = useE2e((s) => s.care)
  const close = () => useUi.getState().setOverlay(null)
  const [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => onThumb(setThumb), [])
  const Icon = TONE_ICON[view.tone]
  const obs = state?.last_observation
  const care = state?.care
  const temp = state?.sensor_snapshot?.temperature
  const incident = state?.incident
  const incidentText = !incident ? 'Không có' : incident.status !== 'OPEN' ? 'Đã đóng' : incident.acknowledged_at ? 'Đang mở · chủ xe đã xem' : 'Đang mở · chưa ai xem'
  const note = view.kind === 'stale' ? 'Không còn quan sát mới trong hạn. Đây là kết quả gần nhất, không phải hiện tại.'
    : view.kind === 'last-known' ? 'Mất kết nối máy chủ. Đang hiển thị dữ liệu cũ.'
      : view.kind === 'waiting' ? 'Chưa có quan sát nào. Chọn nguồn camera ở bảng mô phỏng bên ngoài màn xe.' : view.caution
  return (
    <Sheet label="Giám sát cabin" onClose={close}>
      <PanelHeader title="Giám sát cabin"><SimTag text="MÔ PHỎNG" /></PanelHeader>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-[3rem] px-[4rem] pb-[2.5rem]">
        <div className="flex min-h-0 flex-col cx-scroll">
          <div className={`flex items-center gap-4 ${TONE_TEXT[view.tone]}`}><Icon size="3.4rem" className="shrink-0" />
            <div className="text-xl font-medium leading-tight">{view.headline}</div></div>
          <p className="mt-3 text-base">{view.reason}</p>
          {note && <p className={`mt-2 text-sm ${view.kind === 'current' ? 'text-text-2' : 'text-warning'}`}>{note}</p>}

          <div className="mt-6">
            <Row title="Trong xe" sub={'Model chỉ nhận người/chó/mèo; "người" không có nghĩa là trẻ em'}><span className="text-base">{state ? OCCUPANCY[state.occupancy_state] : '—'}</span></Row>
            <Row title="Nhiệt độ cabin" sub="Cảm biến mô phỏng"><span className="text-base tabular-nums">{typeof temp === 'number' ? `${temp.toFixed(1)} °C` : '—'}</span></Row>
            <Row title="Camera" sub={obs?.source_label ?? 'Chưa có nguồn'}><span className={`text-base ${state?.camera_status && state.camera_status !== 'OK' ? 'text-warning' : ''}`}>{state?.camera_status ? CAMERA_VI[state.camera_status] ?? state.camera_status : '—'}</span></Row>
            <Row title="Cập nhật hình ảnh"><span className="text-base tabular-nums">{state && liveAge(state.freshness.vision, received) != null ? `${ageText(liveAge(state.freshness.vision, received))} trước` : '—'}</span></Row>
            <Row title="Sự cố"><span className="text-base">{incidentText}</span></Row>
          </div>

          {care?.can_start && care.status !== 'ACTIVE' && (
            <div className="mt-6 flex items-center gap-4 rounded-xl bg-surface-2 p-4">
              <div className="min-w-0 grow"><div className="text-base">Người lớn đang nghỉ trong xe?</div>
                <div className="text-xs text-text-2">Bật chế độ cắm trại giữ điều hoà. Chủ xe vẫn nhận cảnh báo.</div></div>
              <button type="button" className="cx-btn h-14 shrink-0 bg-accent px-6 text-sm text-white"
                onClick={() => { unlock(); void run((s) => api.careStart(s, { profile: 'ADULT', music: 'ambient' }, 'COCKPIT'), 'Đã bật chế độ cắm trại.') }}>Bật cắm trại</button>
            </div>)}
          <p className="mt-4 text-xs text-text-2">Xác nhận đã xem và đóng sự cố thực hiện trên điện thoại chủ xe.</p>

          <details className="mt-4 text-sm text-text-2">
            <summary className="flex min-h-14 cursor-pointer items-center">Chi tiết kỹ thuật</summary>
            {state && <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 pb-2 text-xs">
              <dt>Revision</dt><dd>{state.revision}</dd>
              <dt>Luật</dt><dd>{state.rule_id}</dd>
              <dt>Phát hiện</dt><dd>{obs?.vision?.detections?.length ? obs.vision.detections.map((d) => `${d.class} ${(d.confidence * 100).toFixed(0)}%`).join(', ') : 'không có'}</dd>
              <dt>Cảm biến</dt><dd>{ageText(liveAge(state.freshness.sensor, received))} trước</dd>
              <dt>Model</dt><dd>{state.model?.file ?? '—'}</dd>
              <dt>Thời gian suy luận</dt><dd>{obs?.timings_ms?.infer_detector != null ? `${obs.timings_ms.infer_detector} ms` : '—'}</dd>
            </dl>}
          </details>
        </div>

        <figure className="relative m-0 min-h-0 overflow-hidden rounded-xl bg-surface-2">
          {thumb ? <img src={thumb} alt="Khung hình gần nhất đã gửi, đã làm mờ" className="h-full w-full object-cover" style={{ filter: 'blur(14px)' }} />
            : <CabinOutline />}
          <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-3 text-xs text-white/85">
            {thumb ? 'Khung gần nhất đã gửi · làm mờ khi hiển thị' : 'Chưa có khung hình. Chưa định vị được ghế.'}</figcaption>
        </figure>
      </div>
    </Sheet>
  )
}

const CAMERA_VI: Record<string, string> = { OK: 'Hoạt động', BLOCKED: 'Bị che', DISCONNECTED: 'Mất kết nối', NO_FEED: 'Không có hình', ERROR: 'Lỗi' }

/** Neutral top-down cabin outline. No seat is highlighted: the detector does not localise seats. */
function CabinOutline() {
  return (
    <svg viewBox="0 0 200 320" className="h-full w-full p-10 text-text-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="30" y="20" width="140" height="280" rx="60" />
      {([[55, 100, 30], [115, 100, 30], [45, 190, 26], [87, 190, 26], [129, 190, 26]] as const).map(([x, y, w]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height="46" rx="10" />)}
    </svg>
  )
}
