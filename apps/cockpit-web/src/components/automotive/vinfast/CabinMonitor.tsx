// "Giám sát cabin" as a real dialog (portal, viewport units), so it is readable on a phone and not a 1920 px artboard shrunk to 0.2.
// Three tabs: Tổng quan (is the cabin watched, is anything there, is it dangerous), Cách hoạt động, Bằng chứng (the big picture).
// Read-only on the verdict: nothing here computes risk. A source that has no analysis says so; it never shows a made-up number.
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BellRing, Camera, Expand, ImageUp, Minimize, RefreshCw, ScanEye, ShieldAlert, Smartphone, SwitchCamera, Video, VideoOff, X } from 'lucide-react'
import { api } from '../../../e2e/api'
import { AGE_TEXT, ageCapabilityOf, type FrameCounts } from '../../../e2e/cabinCounts'
import { CLIPS, getVideo, parkVideo, resumeManagedClip, sendStill, startClip, startDevice, stopSource, switchDeviceCamera } from '../../../e2e/capture'
import { runVideoScenario } from './demo/scenarios'
import { unlock } from '../../../e2e/comfortAudio'
import { DEVICE_UPLOAD_ENABLED } from '../../../e2e/config'
import { attachStream, flipDeviceCamera, getDeviceStream, useDeviceCamera } from '../../../e2e/deviceCamera'
import { useCabinTab, type CabinTab } from '../../../e2e/cabinUi'
import { clock, liveAge, useConnection, useTick, useVehicleLink, useView } from '../../../e2e/hooks'
import {
  BADGE_TEXT, CABIN_STATUS_TEXT, CABIN_STATUS_TONE, cabinStatus, countsForSource, FEED_TEXT, feedStatus, noResultReason, normalizeBox,
  resultBelongsToSource,
} from '../../../e2e/sourceModel'
import { useE2e } from '../../../e2e/store'
import { useAnalysedFrame, useObservationBadge, useSourceSummary } from '../../../e2e/useSource'
import { ageText, OCCUPANCY } from '../../../e2e/view'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useFrameCounts, useMode } from './useVinfast'
import './cabinMonitor.css'

type Tab = CabinTab
const TABS: { id: Tab; label: string; test: string }[] = [
  { id: 'overview', label: 'Tổng quan', test: 'vf-tab-overview' },
  { id: 'how', label: 'Cách hoạt động', test: 'vf-tab-intro' },
  { id: 'evidence', label: 'Bằng chứng', test: 'vf-tab-evidence' },
]
const DET_VI: Record<string, string> = { person: 'người', dog: 'chó', cat: 'mèo', backpack: 'ba lô', 'cell phone': 'điện thoại' }
const CAMERA_VI: Record<string, string> = { OK: 'Hoạt động', BLOCKED: 'Bị che', DISCONNECTED: 'Mất kết nối', NO_FEED: 'Không có hình', ERROR: 'Lỗi' }
const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n))
const stamp = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : `${d.toLocaleTimeString('vi-VN', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** Focus, scroll lock and Tab trap for a modal. Closing is the caller's job (X button, backdrop, Esc handled by the shell). */
function useDialogBehavior(ref: React.RefObject<HTMLElement | null>, lockPage = true) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const previous = document.activeElement as HTMLElement | null
    root.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    if (lockPage) document.documentElement.classList.add('cm-lock')
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0)
      const first = items[0], last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    root.addEventListener('keydown', onKey)
    return () => { root.removeEventListener('keydown', onKey); document.documentElement.classList.remove('cm-lock'); previous?.focus?.() }
  }, [ref])
}

/** Live <video> bound to the device camera stream. Cleanup only detaches: tracks are stopped by stopSource / stopDeviceCamera. */
function LiveVideo({ className, videoRef }: { className?: string; videoRef?: React.RefObject<HTMLVideoElement | null> }) {
  const own = useRef<HTMLVideoElement>(null)
  const ref = videoRef ?? own
  const streamId = useDeviceCamera((s) => s.streamId), phase = useDeviceCamera((s) => s.phase)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    attachStream(v, phase === 'live' ? getDeviceStream() : null)
    return () => { v.srcObject = null }
  }, [streamId, phase, ref])
  return <video ref={ref} className={className} muted playsInline autoPlay aria-label="Hình trực tiếp từ camera của thiết bị này" data-testid="cm-live-video" />
}

function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`cm-badge cm-badge-${kind.toLowerCase().replace('_', '-')}`} data-testid={`cm-badge-${kind.toLowerCase().replace('_', '-')}`}>{children}</span>
}

/** inCar: drawn inside the car screen (main frame of the VinFast artboard) so the judge sees it on the car, next to the owner phone. Otherwise a page-level dialog. */
export function CabinMonitorDialog({ inCar = false }: { inCar?: boolean }) {
  const mode = useMode()
  const titleId = useId()
  const tab = useCabinTab((s) => s.tab)
  const setTab = (t: Tab) => useCabinTab.setState({ tab: t })
  // the next open starts on the overview; only when the dialog is really gone (a dev-mode remount must not drop a requested tab)
  useEffect(() => () => { queueMicrotask(() => { if (useUi.getState().overlay !== 'cabin') useCabinTab.setState({ tab: 'overview' }) }) }, [])
  const dialog = useRef<HTMLDivElement>(null)
  const close = () => useUi.getState().setOverlay(null)
  useDialogBehavior(dialog, !inCar)
  useTick(1000)
  const view = useView(), src = useSourceSummary(), connection = useConnection()
  const vlink = useVehicleLink()?.state ?? 'CONNECTED'
  const status = cabinStatus(view, src), feed = feedStatus(src, connection, vlink)

  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    const to = TABS[next]
    if (!to) return
    setTab(to.id)
    requestAnimationFrame(() => document.getElementById(`cm-tab-${to.id}`)?.focus())
  }

  const layer = (
    <div className={`vf-shell cm-layer ${inCar ? 'cm-incar' : ''}`} data-vf-skin="blue" data-vf-mode={mode} data-testid="cabin-monitor-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="cm-dialog" data-testid="cabin-monitor">
        <header className="cm-head">
          <h2 id={titleId}>Giám sát cabin</h2>
          <div className="cm-head-badges" aria-label="Trạng thái hiện tại">
            <Badge kind={`status-${CABIN_STATUS_TONE[status]}`}>{CABIN_STATUS_TEXT[status]}</Badge>
            <Badge kind={`feed-${feed}`}>{FEED_TEXT[feed]}</Badge>
          </div>
          <button type="button" className="cm-close" data-autofocus aria-label="Đóng giám sát cabin" data-testid="cm-close" onClick={close}><X size={24} strokeWidth={2} /></button>
        </header>
        <div className="cm-tabs" role="tablist" aria-label="Nội dung giám sát cabin">
          {TABS.map((t) => (
            <button key={t.id} id={`cm-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`cm-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
              data-testid={t.test} onClick={() => setTab(t.id)} onKeyDown={onTabKey}>{t.label}</button>))}
        </div>
        <div className="cm-body" role="tabpanel" id={`cm-panel-${tab}`} aria-labelledby={`cm-tab-${tab}`} tabIndex={0}>
          {tab === 'overview' && <Overview onEvidence={() => setTab('evidence')} />}
          {tab === 'how' && <HowItWorks />}
          {tab === 'evidence' && <Evidence />}
        </div>
      </div>
    </div>
  )
  return inCar ? layer : createPortal(layer, document.body)
}

/* ------------------------------------------------------------------ Tổng quan */

function Overview({ onEvidence }: { onEvidence: () => void }) {
  const view = useView(), counts = useFrameCounts(), src = useSourceSummary(), obsBadge = useObservationBadge(), connection = useConnection()
  const state = useE2e((s) => s.state), received = useE2e((s) => s.receivedPerf), run = useE2e((s) => s.care), frame = useAnalysedFrame()
  const simTemp = useVehicle((s) => s.cabinTemperature), setOverlay = useUi((s) => s.setOverlay)
  const vlink = useVehicleLink()?.state ?? 'CONNECTED'
  const status = cabinStatus(view, src), feed = feedStatus(src, connection, vlink)
  const obs = state?.last_observation, care = state?.care, incident = state?.incident
  const measured = state?.sensor_snapshot?.temperature
  const visionAge = liveAge(state?.freshness.vision, received), sensorAge = liveAge(state?.freshness.sensor, received)
  const incidentText = !incident ? 'Không có sự cố' : incident.status !== 'OPEN' ? 'Sự cố đã đóng' : incident.acknowledged_at ? 'Đang mở · chủ xe đã xem' : 'Đang mở · chưa ai xem'
  const headline = status === 'UNKNOWN' ? 'Chưa thể xác minh cabin' : view.headline
  const why = status === 'UNKNOWN'
    ? src.analysis === 'preview-only' ? 'Camera đang bật nhưng hình chưa được AI phân tích, nên chưa kết luận gì về cabin.'
      : state?.camera_status && state.camera_status !== 'OK' ? `Camera: ${CAMERA_VI[state.camera_status] ?? 'chưa xác minh'}. ${state.occupancy_state === 'SUSPECTED' ? 'Radar mô phỏng vẫn báo dấu hiệu hiện diện.' : 'Chưa thể xác minh cabin trống.'}`
      : view.kind === 'last-known' ? 'Mất kết nối máy chủ. Đang hiển thị dữ liệu cũ.'
        : view.kind === 'stale' ? 'Không còn quan sát mới trong hạn. Kết quả gần nhất không phải hiện tại.'
          : view.kind === 'waiting' ? 'Chưa có quan sát nào. Hãy chọn một nguồn ở tab Bằng chứng hoặc chạy một kịch bản.' : view.reason
    : view.reason
  const gated = countsForSource(counts, src, obsBadge)
  const showThumb = (src.badge === 'LIVE' && useDeviceCamera.getState().phase === 'live') || ((src.badge === 'DEMO' || src.badge === 'UPLOAD') && frame)
  const updated = state ? clock(state.server_time ?? state.evaluated_at) : '—'

  return (
    <div className="cm-pane" data-testid="vf-cabin-detail">
      <section className={`cm-hero tone-${CABIN_STATUS_TONE[status]}`} aria-live="polite">
        <div className="cm-hero-main">
          <p className="cm-eyebrow">Trạng thái cabin</p>
          <p className="cm-hero-status" data-testid="cm-status">{CABIN_STATUS_TEXT[status]}</p>
          <h3>{headline}</h3>
          <p className="cm-why">{why}</p>
          {status === 'SAFE' && <p className="cm-caution">SAFE nghĩa là chưa thấy nguy cơ trong dữ liệu còn hiệu lực. Không phát hiện người hoặc thú không có nghĩa là xe trống: model có thể bỏ sót.</p>}
        </div>
        <div className="cm-hero-side">
          <p className="cm-eyebrow">Nguồn quan sát</p>
          <div className="cm-feedrow"><Badge kind={`feed-${feed}`}>{FEED_TEXT[feed]}</Badge><span>{connection === 'lost' ? 'Mất kết nối máy chủ' : src.line}</span></div>
          <p className="cm-muted">Cập nhật lúc <b data-testid="cm-updated">{updated}</b>{visionAge != null ? ` · hình ${ageText(visionAge)} trước` : ''}</p>
        </div>
      </section>

      <div className="cm-grid">
        <section className="cm-card" aria-labelledby="cm-h-det">
          <h4 id="cm-h-det">Phát hiện trong khung gần nhất</h4>
          {gated ? <DetectionTiles counts={gated} /> : <EmptyResult text={noResultReason(counts, src, obsBadge)} />}
          <p className="cm-note">“Người” không có nghĩa là trẻ em. Chưa xác minh ghế ngồi.</p>
        </section>

        <section className="cm-card" aria-labelledby="cm-h-env">
          <h4 id="cm-h-env">Cabin và dữ liệu</h4>
          <dl className="cm-facts">
            <dt>Nhiệt độ</dt><dd data-testid="cm-temp">{typeof measured === 'number' ? `${measured.toFixed(1)}°C` : `${simTemp.toFixed(1)}°C`} <small>{typeof measured === 'number' ? 'cảm biến mô phỏng' : 'mô phỏng, chưa đồng bộ'}</small></dd>
            <dt>Độ mới</dt><dd>cảm biến {ageText(sensorAge)} · hình {ageText(visionAge)}</dd>
            <dt>Trong xe</dt><dd>{state && status !== 'UNKNOWN' ? OCCUPANCY[state.occupancy_state] : 'Chưa xác minh'}</dd>
            <dt>Camera</dt><dd>{obs?.source_label ?? (src.badge === 'NONE' ? 'Chưa có nguồn' : '—')}{state?.camera_status ? ` · ${CAMERA_VI[state.camera_status] ?? state.camera_status}` : ''}</dd>
          </dl>
        </section>

        <section className="cm-card" aria-labelledby="cm-h-alert">
          <h4 id="cm-h-alert">Cảnh báo</h4>
          <p className={`cm-alert tone-${incident?.status === 'OPEN' ? CABIN_STATUS_TONE[status] : 'ok'}`}>{incidentText}</p>
          <p className="cm-muted">Xác nhận “Đã xem” và đóng sự cố được làm trên điện thoại chủ xe.</p>
          <button type="button" className="cm-btn" onClick={() => setOverlay('phone')}><Smartphone size={20} aria-hidden />Xem trạng thái điện thoại</button>
          {care?.can_start && care.status !== 'ACTIVE' && (
            <div className="cm-care">
              <p>Người lớn đang nghỉ trong xe? Bật chế độ cắm trại để giữ điều hoà. Chủ xe vẫn nhận cảnh báo.</p>
              <button type="button" className="cm-btn" onClick={() => { unlock(); void run((s) => api.careStart(s, { profile: 'ADULT' }, 'COCKPIT'), 'Đã bật chế độ cắm trại, chưa bật nhạc.') }}>Bật cắm trại (mô phỏng)</button>
            </div>)}
        </section>

        <section className="cm-card cm-thumbcard" aria-labelledby="cm-h-thumb">
          <h4 id="cm-h-thumb">Xem nhanh</h4>
          <div className="cm-thumb" data-testid="cm-thumb">
            {showThumb
              ? src.badge === 'LIVE' ? <LiveVideo className="cm-thumb-media" /> : frame ? <img className="cm-thumb-media" src={frame.url} alt="Khung hình gần nhất đã phân tích" /> : null
              : <span>{src.badge === 'NONE' ? 'Chưa có nguồn hình' : 'Đang chờ khung đầu tiên…'}</span>}
            {src.badge !== 'NONE' && <Badge kind={`feed-${feed}`}>{FEED_TEXT[feed]}</Badge>}
          </div>
          <button type="button" className="cm-btn primary" data-testid="cm-open-evidence" onClick={onEvidence}><ScanEye size={20} aria-hidden />Xem bằng chứng</button>
        </section>
      </div>
    </div>
  )
}

function EmptyResult({ text }: { text: string }) {
  return <div className="cm-empty-inline" data-testid="cm-no-result"><b>Chưa có kết quả phân tích</b><span>{text}</span></div>
}

function DetectionTiles({ counts }: { counts: FrameCounts }) {
  const ageOk = counts.age === 'AVAILABLE'
  return (
    <div className="cm-tiles" role="group" aria-label="Đếm theo khung">
      <div className="cm-tile"><b data-testid="cm-count-person">{fmt(counts.person)}</b><span>Người</span><small>trong khung này</small></div>
      <div className="cm-tile"><b data-testid="cm-count-pet">{fmt(counts.pet)}</b><span>Thú cưng</span><small>chó {fmt(counts.dog)} · mèo {fmt(counts.cat)}</small></div>
      <div className={`cm-tile ${ageOk ? '' : 'na'}`}><b>{ageOk ? fmt(counts.child) : '—'}</b><span>Trẻ em</span><small>{ageOk ? 'bằng chứng tuổi phụ' : 'chưa bật phân loại tuổi'}</small></div>
      <div className={`cm-tile ${counts.items == null ? 'na' : ''}`}><b data-testid="cm-count-items">{fmt(counts.items)}</b><span>Đồ vật</span><small>ba lô / điện thoại; nhãn theo khung</small></div>
    </div>
  )
}

/* ------------------------------------------------------------------ Cách hoạt động */

const STEPS: { icon: ReactNode; title: string; line: string; real: string; tag: 'real' | 'sim' | 'mix' }[] = [
  { icon: <Camera size={22} aria-hidden />, title: 'Camera + cảm biến', line: 'Camera cabin chụp khung hình. Cảm biến báo nhiệt độ, khoá cửa, radar.', real: 'Camera: thật (máy bạn) hoặc clip mẫu · Cảm biến: mô phỏng', tag: 'mix' },
  { icon: <ScanEye size={22} aria-hidden />, title: 'AI nhận diện', line: 'Model tìm người, chó, mèo trong từng khung hình.', real: 'Thật cho clip mẫu và ảnh tải lên · Camera máy bạn: chỉ xem, chưa phân tích trên bản trực tuyến', tag: 'mix' },
  { icon: <ShieldAlert size={22} aria-hidden />, title: 'Đánh giá rủi ro', line: 'Luật an toàn xét có người/thú, nhiệt độ, khoá cửa, tài xế. Không phát hiện ≠ xe trống.', real: 'Thật: chạy ở máy chủ', tag: 'real' },
  { icon: <BellRing size={22} aria-hidden />, title: 'Cảnh báo', line: 'Màn xe và điện thoại chủ xe nhận cùng một bản ghi (revision).', real: 'Bản ghi thật · đẩy thông báo mô phỏng', tag: 'mix' },
  { icon: <Smartphone size={22} aria-hidden />, title: 'Hành động', line: 'Chủ xe xác nhận trên điện thoại. Xe chỉ gợi ý bật điều hoà.', real: 'Mô phỏng: không điều khiển xe thật', tag: 'sim' },
]
const TAG_TEXT = { real: 'THẬT', sim: 'MÔ PHỎNG', mix: 'THẬT + MÔ PHỎNG' } as const

function HowItWorks() {
  return (
    <div className="cm-pane" data-testid="vf-cabin-intro">
      <ol className="cm-steps" aria-label="Luồng xử lý">
        {STEPS.map((s, i) => (
          <li key={s.title} className="cm-step">
            <span className="cm-step-n" aria-hidden>{i + 1}</span>
            <span className="cm-step-ic" aria-hidden>{s.icon}</span>
            <div className="cm-step-t"><b>{s.title}</b><span>{s.line}</span><em className={`tag-${s.tag}`}><i>{TAG_TEXT[s.tag]}</i> {s.real}</em></div>
          </li>))}
      </ol>
      <p className="cm-note">Thật = chạy thật trong bản demo này. Mô phỏng = dữ liệu hoặc lệnh giả lập, không điều khiển xe thật. Ảnh gốc từ camera máy bạn không rời khỏi thiết bị.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ Bằng chứng */

function useFullscreen(target: React.RefObject<HTMLElement | null>, video: React.RefObject<HTMLVideoElement | null>) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const f = () => setOn(document.fullscreenElement === target.current)
    document.addEventListener('fullscreenchange', f)
    return () => { document.removeEventListener('fullscreenchange', f); if (document.fullscreenElement === target.current) void document.exitFullscreen().catch(() => undefined) }
  }, [target])
  const iosVideo = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
  const supported = !!document.fullscreenEnabled || !!iosVideo?.webkitEnterFullscreen
  const toggle = () => {
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => undefined); return }
    if (target.current?.requestFullscreen) void target.current.requestFullscreen().catch(() => undefined)
    else iosVideo?.webkitEnterFullscreen?.()
  }
  return { on, supported, toggle }
}

/** The source clip keeps playing off-screen (parked) so the analysis continues; judges only see the detect frame below. */
function ClipControls() {
  const source = useE2e((s) => s.source)
  useEffect(() => { const v = getVideo(); if (v) { parkVideo(v); void resumeManagedClip() } }, [source.runId])
  const selected = CLIPS.find((c) => c.id === source.scenarioId || c.label === source.label)
  return <div className="cm-source-bar" data-testid="actual-demo-video">
    <p role="status" data-testid="player-phase" className="cm-note">{source.playerPhase ?? 'IDLE'} · Clip mẫu chạy nền, chỉ hiện khung đã phân tích. Âm thanh tắt, tối đa 1 khung/giây.</p>
    {selected && <button type="button" className="cm-btn" onClick={() => void startClip(selected)}>Phát lại clip</button>}
    <button type="button" className="cm-btn" onClick={() => stopSource()}>Dừng nguồn demo</button>
  </div>
}

function Evidence() {
  const dev = useDeviceCamera(), src = useSourceSummary(), obsBadge = useObservationBadge(), frame = useAnalysedFrame()
  const source = useE2e((s) => s.source), setSource = useE2e((s) => s.setSource), state = useE2e((s) => s.state), service = useE2e((s) => s.service)
  const counts = useFrameCounts(), connection = useConnection()
  const obs = state?.last_observation, model = state?.model ?? service?.model
  const stage = useRef<HTMLDivElement>(null), liveRef = useRef<HTMLVideoElement>(null), file = useRef<HTMLInputElement>(null)
  const fs = useFullscreen(stage, liveRef)
  useTick(1000)
  const liveOn = dev.phase === 'live'
  const failed = ['denied', 'unavailable', 'busy', 'insecure', 'unsupported', 'error'].includes(dev.phase)
  const belongs = resultBelongsToSource(src.badge, obsBadge, source.runId, obs?.frame_id)
  const dets = obs?.event_type === 'observation' && obs.accepted ? [...(obs.vision?.detections ?? []), ...(obs.vision?.items ?? [])] : []
  const boxFrame = (src.badge === 'DEMO' || src.badge === 'UPLOAD') && frame && obs && obs.frame_id === frame.frameId ? frame : null
  const boxes = boxFrame ? dets.map((d) => ({ d, box: normalizeBox(d.bbox, boxFrame.width, boxFrame.height) })).filter((x) => x.box) : []

  let analysisText = '—'
  if (src.analysis === 'preview-only') analysisText = 'AI chưa khả dụng cho camera trực tiếp trên bản này: hình chỉ hiển thị trên máy bạn, không gửi đi. Không có kết quả giả.'
  else if (src.analysis === 'running') analysisText = obs?.timings_ms?.infer_detector != null ? `Đã chạy model · ${obs.timings_ms.infer_detector} ms (máy chủ demo)` : 'Đã chạy model'
  else if (src.analysis === 'waiting') analysisText = 'Đang chờ kết quả đầu tiên của nguồn này…'
  else if (obs) analysisText = 'Nguồn đã dừng. Kết quả cũ không còn hiệu lực.'

  return (
    <div className="cm-pane" data-testid="vf-evidence">
      <div className="cm-source-bar" role="group" aria-label="Chọn nguồn quan sát">
        <div className="cm-source-group">
          <span className="cm-source-label">Camera của tôi</span>
          {liveOn || dev.phase === 'requesting'
            ? <button type="button" className="cm-btn live" aria-pressed="true" data-testid="cm-camera-stop" onClick={() => stopSource()}><VideoOff size={20} aria-hidden />Tắt camera</button>
            : <button type="button" className="cm-btn primary" data-testid="cm-camera-start" onClick={() => void startDevice()}><Video size={20} aria-hidden />Bật camera</button>}
          {liveOn && dev.canFlip && <button type="button" className="cm-btn" data-testid="cm-camera-flip" onClick={() => void switchDeviceCamera(flipDeviceCamera)}><SwitchCamera size={20} aria-hidden />Đổi camera</button>}
        </div>
        <div className="cm-source-group">
          <span className="cm-source-label">Clip mẫu (DEMO)</span>
          <select aria-label="Chọn một trong tám video demo" className="cm-btn" value={source.scenarioId ?? ''} onChange={(e) => { if (e.target.value) void runVideoScenario(e.target.value) }}>
            <option value="">Tám tình huống demo…</option>{CLIPS.filter((c) => c.id.startsWith('DEMO-')).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {CLIPS.filter((c) => !c.id.startsWith('DEMO-')).map((c) => {
            const on = source.kind === 'clip' && source.label === c.label
            return <button key={c.id} type="button" className={`cm-btn ${on ? 'on' : ''}`} aria-pressed={on} data-testid={`cm-clip-${c.id}`} onClick={() => void startClip(c)}>{c.label.replace(/ \(clip mô phỏng AI\)/, '')}</button>
          })}
        </div>
        <div className="cm-source-group">
          <span className="cm-source-label">Ảnh của bạn</span>
          <button type="button" className="cm-btn" onClick={() => file.current?.click()}><ImageUp size={20} aria-hidden />Tải ảnh lên</button>
          <input ref={file} type="file" accept="image/jpeg,image/png" hidden data-testid="still-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendStill(f); e.target.value = '' }} />
        </div>
      </div>
      {DEVICE_UPLOAD_ENABLED
        ? <label className="cm-consent"><input type="checkbox" checked={source.consent} onChange={(e) => setSource({ consent: e.target.checked })} />Tôi đồng ý gửi mỗi giây một khung hình từ camera này tới máy chủ demo (máy này) để chạy model. Không lưu sau khi phân tích.</label>
        : <p className="cm-note">Camera của bạn chỉ hiển thị trên máy này và không được gửi đi. Ảnh tải lên và clip mẫu được gửi tới máy chủ demo để chạy model: đừng dùng ảnh có mặt người thật.</p>}
      {source.error && !failed && <p role="alert" className="cm-error">{source.error}</p>}
      {source.kind === 'clip' && <ClipControls />}

      <figure className="cm-viewer" ref={stage} data-testid="cm-viewer" data-source={src.badge}>
        <div className="cm-stage">
          {dev.phase === 'requesting' && <StageMessage busy title="Đang chờ bạn cho phép camera…" hint="Chọn Cho phép trong hộp thoại của trình duyệt." />}
          {failed && src.badge !== 'DEMO' && src.badge !== 'UPLOAD' && (
            <StageMessage tone="error" title={dev.title ?? 'Không mở được camera'} hint={dev.hint ?? ''}>
              {dev.retry && <button type="button" className="cm-btn primary" data-testid="cm-camera-retry" onClick={() => void startDevice()}><RefreshCw size={20} aria-hidden />Thử lại</button>}
              <button type="button" className="cm-btn" onClick={() => void startClip(CLIPS[0]!)}>Dùng clip mẫu</button>
            </StageMessage>)}
          {liveOn && src.badge === 'LIVE' && <LiveVideo className="cm-media" videoRef={liveRef} />}
          {(src.badge === 'DEMO' || src.badge === 'UPLOAD') && (frame && frame.kind === (src.badge === 'DEMO' ? 'CLIP_FRAME' : 'UPLOAD')
            ? (
              <div className="cm-fit" style={{ ['--ar' as string]: frame.width / frame.height }}>
                <img className="cm-media-img" src={frame.url} alt={`Khung hình đã phân tích từ ${src.badge === 'DEMO' ? 'clip mẫu' : 'ảnh tải lên'}`} data-testid="cm-frame" />
                {boxes.map(({ d, box }, i) => box && (
                  <span key={i} className="cm-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} data-testid="cm-box"><i>{DET_VI[d.class] ?? d.class} {(d.confidence * 100).toFixed(0)}%</i></span>))}
              </div>)
            : <StageMessage busy title="Đang chờ khung hình đầu tiên…" hint="Mỗi giây một khung được trích và chạy model." />)}
          {src.badge === 'SIM' && <SimBlockedPreview />}
          {src.badge === 'NONE' && !failed && dev.phase !== 'requesting' && (
            <StageMessage title="Chưa có nguồn quan sát" hint="Bật camera của bạn, chọn một clip mẫu hoặc tải ảnh lên. CabinSentinel không giả định cabin an toàn khi chưa có hình." testid="cm-empty" />)}
          {src.badge !== 'NONE' && (
            <div className="cm-overlay-top"><Badge kind={`feed-${src.badge}`}>{BADGE_TEXT[src.badge]}</Badge>
              {src.analysis === 'preview-only' && <span className="cm-chip">AI chưa khả dụng · hình không rời thiết bị</span>}
              {src.analysis === 'running' && belongs && <span className="cm-chip ok">Đã phân tích</span>}
              {(src.badge === 'DEMO' || src.badge === 'UPLOAD') && frame && <span className="cm-chip ok" data-testid="cm-privacy" data-method={frame.maskMethod ?? 'FULL'}>
                {frame.maskMethod === 'YUNET' ? `Đã che mặt bằng YuNet (${frame.maskedRegions ?? 0} vùng)` : frame.maskMethod === 'HEAD' ? 'Đã che vùng đầu theo khung phát hiện' : 'Làm mờ toàn khung (không có vùng để che)'} · chưa đảm bảo che hết
              </span>}
            </div>)}
          {src.badge !== 'NONE' && (
            <div className="cm-overlay-bottom">
              <span>{src.badge === 'LIVE' ? `Giờ máy ${new Date().toLocaleTimeString('vi-VN', { hour12: false })}` : boxFrame || frame ? `Khung ${stamp(obs && frame && obs.frame_id === frame.frameId ? obs.observed_at : new Date(frame?.at ?? Date.now()).toISOString())}` : 'Chờ khung'}</span>
              {fs.supported && (liveOn || frame) && <button type="button" className="cm-iconbtn" aria-label={fs.on ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'} data-testid="cm-fullscreen" onClick={fs.toggle}>{fs.on ? <Minimize size={20} /> : <Expand size={20} />}</button>}
            </div>)}
        </div>
        <figcaption>
          {src.badge === 'LIVE' ? 'Camera trực tiếp của thiết bị này. ' : src.badge === 'DEMO' ? 'Clip mẫu mô phỏng, không phải camera trong xe. ' : src.badge === 'UPLOAD' ? 'Ảnh do bạn tải lên. ' : ''}
          Đây là bằng chứng của nguồn đang chọn, không phải video minh hoạ của hãng.
        </figcaption>
      </figure>

      <section className="cm-card" aria-labelledby="cm-h-meta">
        <h4 id="cm-h-meta">Kết quả và nguồn gốc</h4>
        <dl className="cm-facts wide">
          <dt>Nguồn</dt><dd><Badge kind={`feed-${src.badge}`}>{BADGE_TEXT[src.badge]}</Badge> {src.badge !== 'NONE' && source.label ? source.label : ''}</dd>
          <dt>Suy luận</dt><dd data-testid="cm-analysis">{analysisText}</dd>
          <dt>Khung</dt><dd>{belongs && obs ? <><code>{obs.frame_id}</code> · {stamp(obs.observed_at)}</> : '—'}</dd>
          <dt>Thời điểm trong video</dt><dd>{belongs && obs?.media_time_s != null ? `${obs.media_time_s.toFixed(3)}s` : '—'}</dd>
          <dt>Phát hiện</dt>
          <dd data-testid="cm-detections">{belongs && connection === 'ok' && counts.status === 'CURRENT'
            ? dets.length ? dets.map((d) => `${DET_VI[d.class] ?? d.class} ${(d.confidence * 100).toFixed(0)}%${d.age_group ? ` (${d.age_group})` : ''}`).join(', ') : 'Không phát hiện người/thú trong khung này (chưa chứng minh xe trống)'
            : 'Chưa có kết quả phân tích cho nguồn này'}</dd>
          <dt>Ngoài cabin</dt><dd data-testid="cm-exterior">{belongs && obs?.vision?.exterior_count ? `${obs.vision.exterior_count} người ở ngoài cabin theo hiệu chuẩn demo: không tính là người trong xe` : '—'}</dd>
          <dt>Vùng phát hiện</dt><dd>{boxes.length ? `Đã vẽ ${boxes.length} khung từ tọa độ backend` : belongs && dets.length ? 'Backend chưa trả tọa độ vùng nên chưa vẽ khung' : '—'}</dd>
          <dt>Nhận diện tuổi</dt><dd>{AGE_TEXT[ageCapabilityOf(state, service?.model?.age_classifier)]}</dd>
          {!belongs && obs && src.badge !== 'NONE' && <><dt>Kết quả cũ</dt><dd className="cm-muted">Kết quả gần nhất thuộc nguồn {BADGE_TEXT[obsBadge ?? 'NONE']}, không phải {BADGE_TEXT[src.badge]}. Không dùng cho nguồn này.</dd></>}
        </dl>
        <p className="cm-caution">Không phát hiện người/thú không chứng minh cabin trống: detector gốc có thể bỏ sót (SR-01 còn mở). Tuổi chỉ là bằng chứng phụ, không đổi mức rủi ro.</p>
        <details className="cm-details">
          <summary>Chi tiết kỹ thuật</summary>
          <dl className="cm-facts wide">
            <dt>Revision · luật</dt><dd>{state ? `${state.revision} · ${state.rule_id}` : '—'}</dd>
            <dt>Quyết định backend</dt><dd>{state ? `${state.risk_level} (trước đó ${state.previous_risk_level ?? '—'}) · ${state.reason}` : '—'}</dd>
            <dt>Hiện tại?</dt><dd>{state ? (state.decision_current ? 'có' : 'không (có nguồn đã cũ hoặc camera lỗi)') : '—'}</dd>
            <dt>Model</dt><dd>{model?.file ? `${model.file} · ${model.sha256?.slice(0, 12)}…` : 'chưa nạp'}</dd>
            <dt>Nguồn dữ liệu</dt><dd>{state?.simulation ? `xe ${state.simulation.vehicle_source} · lệnh ${state.simulation.action_mode} · ảnh ${state.simulation.vision_source} · ${state.simulation.runtime}` : '—'}</dd>
          </dl>
        </details>
      </section>
    </div>
  )
}

/** No recorded footage of a blocked camera exists, so none is played. This is an explicit simulation; nothing here is an AI detection. */
function SimBlockedPreview() {
  const state = useE2e((s) => s.state), view = useView(), simTemp = useVehicle((s) => s.cabinTemperature)
  const snap = state?.sensor_snapshot as Record<string, unknown> | null | undefined
  const radar = typeof snap?.radar_presence === 'boolean' ? snap.radar_presence : null
  const temp = typeof snap?.temperature === 'number' ? snap.temperature : simTemp
  return (
    <div className="cm-simblock" data-testid="cm-sim-blocked" role="status">
      <b className="cm-sim-title">MÔ PHỎNG CAMERA BỊ CHE</b>
      <span>Không có video thật của camera bị che. AI Vision không thể xác minh cabin qua camera này.</span>
      <ul>
        <li><em>Radar</em> {radar === null ? 'Chưa có dữ liệu' : radar ? 'Phát hiện hiện diện' : 'Không phát hiện hiện diện (chưa chứng minh cabin trống)'} — Cảm biến mô phỏng <i className="cm-simtag">SIMULATED</i></li>
        <li><em>Nhiệt độ</em> {temp.toFixed(1)}°C <i className="cm-simtag">SIMULATED</i></li>
        <li><em>Quyết định (luật backend)</em> {state ? `${state.risk_level} · ${view.reason}` : 'Chưa có'}</li>
      </ul>
      <span>Không thể quan sát cabin qua camera. {radar ? 'Radar mô phỏng vẫn phát hiện hiện diện. Cần kiểm tra xe.' : 'Chưa thể xác minh. Cần kiểm tra xe.'}</span>
    </div>
  )
}

function StageMessage({ title, hint, tone, busy, children, testid }: { title: string; hint: string; tone?: 'error'; busy?: boolean; children?: ReactNode; testid?: string }) {
  return (
    <div className={`cm-stagemsg ${tone === 'error' ? 'error' : ''}`} role={tone === 'error' ? 'alert' : 'status'} data-testid={testid ?? (tone === 'error' ? 'cm-camera-error' : 'cm-stage-msg')}>
      {busy && <span className="cm-spin" aria-hidden />}
      <b>{title}</b><span>{hint}</span>
      {children && <div className="cm-stagemsg-actions">{children}</div>}
    </div>
  )
}

