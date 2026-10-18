// Demo page for the judges: one screen that shows what to press, which stage the pipeline has reached, the car screen and the owner's
// phone reading the SAME committed revision, and (folded, for developers) the simulated environment, traces and the evidence log.
import { useEffect, useLayoutEffect, useState } from 'react'
import { Camera, Info, Maximize2, ScanEye, Square } from 'lucide-react'
import { PHONE_H, PHONE_W, PhoneFrame } from '../../../../e2e/PhoneFrame'
import { startDevice, stopSource } from '../../../../e2e/capture'
import { openCabinMonitor } from '../../../../e2e/cabinUi'
import { useCareEffects } from '../../../../e2e/careEffects'
import { DEVICE_UPLOAD_ENABLED } from '../../../../e2e/config'
import { startEvidenceLog } from '../../../../e2e/evidenceLog'
import { connectionNow, useConnection } from '../../../../e2e/hooks'
import { cabinStatus, CABIN_STATUS_TEXT, FEED_TEXT, feedStatus } from '../../../../e2e/sourceModel'
import { startPolling, startTelemetry, stopPolling, stopTelemetry, useE2e } from '../../../../e2e/store'
import { useSourceSummary } from '../../../../e2e/useSource'
import { useVehicleLink, useView } from '../../../../e2e/hooks'
import { navigateView, usePageView } from '../../../../lib/route'
import { useUi } from '../../../../store/uiStore'
import { CabinMonitorDialog } from '../CabinMonitor'
import { closeTopLayer, installLayerHistory } from '../../../../lib/layers'
import { useVehicle } from '../../../../store/vehicleStore'
import { ExitBar } from '../../../common/ExitBar'
import { VinfastExperience } from '../VinfastExperience'
import { VF_H, VF_W } from '../layout'
import { EvidencePanelVf, Fold, SimEnvPanel } from './DemoPanels'
import { TracePanel } from './TracePanel'
import { flowSteps } from './flow'
import { dropVehicleLink, resetDemo, restoreVehicleLink, runScenario, stopScenario, runVideoScenario, SCENARIOS, type ScenarioId } from './scenarios'
import { ScenarioSelector } from './ScenarioSelector'
import { VehicleLinkBanner } from './VehicleLinkBanner'
import { ScenarioRunPanel, SmartInteractionCard } from './ScenarioRunPanel'
import './demo.css'

const GAP = 24, MID = 80
const ONBOARD_KEY = 'cabin-onboarding-v1'

function useViewport() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => { const f = () => set({ w: window.innerWidth, h: window.innerHeight }); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  return s
}
let booted: Promise<void> | null = null

/** Below 1000 px the car screen is not rendered, and the cabin dialog normally lives inside it. This hosts the same dialog (and Back/Esc) on its own. */
function MobileCabinHost() {
  const overlay = useUi((s) => s.overlay)
  useEffect(() => installLayerHistory(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && closeTopLayer()) e.preventDefault() }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [])
  return overlay === 'cabin' ? <CabinMonitorDialog /> : null
}

const seenOnboarding = () => { try { return localStorage.getItem(ONBOARD_KEY) === '1' } catch { return false } }
const markOnboarding = () => { try { localStorage.setItem(ONBOARD_KEY, '1') } catch { /* private mode: it simply shows again next visit */ } }

/** Camera of THIS device. Hosted build: the picture stays on the device (no upload), so no consent screen is needed.
 *  Local build: frames go to the local backend after an explicit consent (same dialog as before). */
function CameraControl() {
  const source = useE2e((s) => s.source), setSource = useE2e((s) => s.setSource)
  const [ask, setAsk] = useState(false)
  const live = source.kind === 'device' && source.running
  const toggle = () => {
    if (live) { stopSource(); setAsk(false); return }
    if (DEVICE_UPLOAD_ENABLED) { setAsk((a) => !a); return }
    void startDevice(); openCabinMonitor('evidence')   // getUserMedia runs inside this tap, as browsers require
  }
  return (
    <div className="vd-cam">
      <button type="button" className={`vd-btn vd-press ${live ? 'live' : ''}`} aria-pressed={live} data-testid="camera-btn" onClick={toggle}>
        {live ? <><Square size={20} strokeWidth={1.8} />Dừng camera</> : <><Camera size={20} strokeWidth={1.8} />Camera của tôi</>}
      </button>
      {!live && !DEVICE_UPLOAD_ENABLED && <span className="vd-cam-note">Chỉ xem trên máy bạn, không gửi đi</span>}
      {ask && !live && (
        <div className="vd-consent" role="dialog" aria-label="Đồng ý dùng camera">
          <p>Mỗi giây một khung hình từ camera của máy này được gửi tới máy chủ demo (chạy trên máy này) để chạy model. Hình không được lưu sau khi phân tích. Bạn có thể dừng bất cứ lúc nào.</p>
          <label><input type="checkbox" checked={source.consent} onChange={(e) => setSource({ consent: e.target.checked })} />Tôi đồng ý</label>
          <div className="row"><button type="button" className="vd-btn primary vd-press" disabled={!source.consent} onClick={() => { void startDevice(); setAsk(false); openCabinMonitor('evidence') }}>Bật camera</button>
            <button type="button" className="vd-btn vd-press" onClick={() => setAsk(false)}>Huỷ</button></div>
        </div>)}
    </div>
  )
}

function FlowBar() {
  const session = useE2e((s) => s.session), state = useE2e((s) => s.state), notes = useE2e((s) => s.notifications), source = useE2e((s) => s.source)
  useE2e((s) => s.failures); useE2e((s) => s.connection)
  const steps = flowSteps({ hasSession: !!session, sourceRunning: source.running, sourceKind: source.kind, state, notifications: notes, connection: connectionNow() })
  return (
    <ol className="vd-flow" aria-label="Các bước của luồng" data-testid="flow">
      {steps.map((s, i) => (
        <li key={s.id} className={s.status} title={s.hint} aria-current={s.status === 'active' ? 'step' : undefined}>
          <span className="dot" aria-hidden>{s.status === 'done' ? '✓' : s.status === 'warn' ? '!' : i + 1}</span>
          <span className="lb"><b>{s.label}</b><small>{s.status === 'warn' ? (s.id === 'model' ? 'Camera lỗi: không có hình để phân tích' : 'Chưa xác minh được') : s.status === 'active' ? s.hint : s.status === 'done' ? 'Xong' : ''}</small></span>
        </li>))}
    </ol>
  )
}

/** First visit only, inline (not a popup): what to press, in three steps. "Hướng dẫn" in the header brings it back. */
function Onboarding({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  return (
    <section className="vd-onboard" aria-label="Hướng dẫn nhanh" data-testid="onboarding">
      <div className="head"><h2>Dùng thử trong 30 giây</h2><span className="grow" />
        <button type="button" className="vd-btn primary vd-press" onClick={onStart} data-testid="onboarding-start"><ScanEye size={20} strokeWidth={1.8} />Bắt đầu giám sát</button>
        <button type="button" className="vd-btn vd-press" onClick={onClose} data-testid="onboarding-close">Để sau</button></div>
      <ol>
        <li><b>1 · Chọn một kịch bản</b><span>Ví dụ “Trẻ trong xe, xe nóng”. Model thật phân tích một clip mẫu.</span></li>
        <li><b>2 · Xem cảnh báo</b><span>Màn xe và điện thoại chủ xe nhận cùng một cảnh báo.</span></li>
        <li><b>3 · Mở “Giám sát cabin”</b><span>Chạm ô Giám sát cabin trên màn xe, rồi tab Bằng chứng để xem hình và kết quả AI.</span></li>
      </ol>
    </section>
  )
}

/** Phone-sized shortcut: the car screen is a 1920 px artboard, so on a narrow screen its Giám sát cabin tile is tiny. This opens the same dialog. */
function CabinShortcut() {
  useConnection()
  const view = useView(), src = useSourceSummary(), connection = useConnection()
  const status = cabinStatus(view, src), feed = feedStatus(src, connection, useVehicleLink()?.state ?? 'CONNECTED')
  return (
    <button type="button" className="vd-shortcut vd-press" onClick={() => openCabinMonitor()} data-testid="open-cabin" data-tone={status}>
      <span className="l"><ScanEye size={26} strokeWidth={1.8} aria-hidden /><b>Giám sát cabin</b></span>
      <span className="r"><i className={`pill s-${status}`}>{CABIN_STATUS_TEXT[status]}</i><i className="pill f">{FEED_TEXT[feed]}</i></span>
      <small>Chạm để xem trạng thái, cách hoạt động và bằng chứng</small>
    </button>
  )
}

export function VinfastDemoPage() {
  const { w, h } = useViewport()
  const pageView = usePageView()
  const cockpitOnly = pageView === 'cockpit'
  const service = useE2e((s) => s.service), serviceError = useE2e((s) => s.serviceError), sessionError = useE2e((s) => s.sessionError), booting = useE2e((s) => s.booting), session = useE2e((s) => s.session), note = useE2e((s) => s.sessionNote)
  const revision = useE2e((s) => s.state?.revision), source = useE2e((s) => s.source)
  const [active, setActive] = useState<ScenarioId | null>(null)
  const [guide, setGuide] = useState(() => !seenOnboarding())
  useCareEffects()
  useEffect(() => {
    useUi.getState().set({ e2e: true })
    useVehicle.getState().setBrand('vinfast')
    booted ??= useE2e.getState().bootstrap()
    const stopLog = startEvidenceLog()
    void booted.then(() => { startPolling(); startTelemetry() })
    return () => { stopLog(); stopPolling(); stopTelemetry(); stopSource(); useUi.getState().set({ e2e: false }); booted = null }
  }, [])
  useLayoutEffect(() => {
    const el = document.documentElement
    el.classList.add('e2e-page', 'vd-page'); el.style.fontSize = '16px'
    return () => { el.classList.remove('e2e-page', 'vd-page'); el.style.fontSize = '' }
  }, [])
  // Esc leaves the full-window car screen once nothing inside it is open (the cockpit handler marks Esc as used when it closed a layer)
  useEffect(() => {
    if (!cockpitOnly) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) navigateView('demo') }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [cockpitOnly])

  if (cockpitOnly) return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <div className="relative h-full w-full overflow-hidden" data-testid="cockpit"><VinfastExperience /></div>
      <ExitBar label="Thoát toàn màn hình" onExit={() => navigateView('demo')} />
      <div className="vd-full-alert"><SmartInteractionCard /></div>
    </div>)

  const wide = w >= 1200
  const HEADER = 72, STRIP = 96, FLOW = 72, CAPTION = 40, BARS = 72, GAPS = 5 * 12
  const rowH = wide ? Math.max(460, h - HEADER - STRIP - FLOW - CAPTION - BARS - GAPS) : 0
  const phoneScale = wide ? Math.min(1, rowH / (PHONE_H + 8)) : Math.min(1, (w - 32) / PHONE_W)
  const phoneW = Math.round(PHONE_W * phoneScale), phoneH = Math.round(PHONE_H * phoneScale)
  const cockpitScale = wide ? Math.min((w - GAP * 2 - phoneW - MID) / VF_W, rowH / VF_H) : (w - 32) / VF_W
  const cw = Math.floor(VF_W * cockpitScale), ch = Math.floor(VF_H * cockpitScale)
  const go = (id: ScenarioId) => { setActive(id); void runScenario(id) }
  const closeGuide = () => { markOnboarding(); setGuide(false) }
  const rev = revision ?? '—'
  const cockpit = <div className="vd-frame" style={{ width: cw, height: ch }} data-testid="cockpit"><VinfastExperience /></div>
  const phone = <div style={{ width: phoneW, height: phoneH }}><div style={{ transform: `scale(${phoneScale})`, transformOrigin: 'top left', width: PHONE_W, height: PHONE_H }}><PhoneFrame /></div></div>

  return (
    <div className="vd" data-testid="demo-page">
      <header className="vd-head" style={{ minHeight: HEADER }}>
        <img className="vd-logo" src={`${import.meta.env.BASE_URL}vinfast/brand/cabin-noir-logo.png`} alt="Cabin Noir" height={44} width={44} />
        <div className="ttl"><h1>CabinSentinel · cảnh báo bỏ quên trẻ và thú cưng trong xe</h1>
          <p>Clip mẫu được model thật phân tích. Dữ liệu xe và lệnh xe là giả lập, không điều khiển xe thật.</p></div>
        <span className="grow" />
        <span className="vd-sess" role="status">{source.running ? `Đang phân tích: ${source.cameraFault ? 'camera lỗi giả lập' : source.label} · ` : ''}{session ? `Phiên ${session.id.slice(0, 8)}` : 'Chưa có phiên'}</span>
        <button type="button" className="vd-btn vd-press" onClick={() => setGuide((g) => !g)} aria-expanded={guide} data-testid="guide-toggle"><Info size={20} strokeWidth={1.8} />Hướng dẫn</button>
        <button type="button" className="vd-btn vd-press" onClick={() => navigateView('cockpit')} data-testid="fullscreen-cockpit"><Maximize2 size={20} strokeWidth={1.8} />Toàn màn hình xe</button>
      </header>

      {serviceError && <div role="alert" className="vd-banner crit">{serviceError}. Không có dữ liệu thay thế: các màn sẽ báo chưa có dữ liệu.</div>}
      {(serviceError || sessionError) && <div className="vd-banner crit">{sessionError}<button type="button" className="vd-btn" onClick={() => void useE2e.getState().bootstrap()}>Thử kết nối lại</button></div>}
      {service && !service.model.ready && <div role="alert" className="vd-banner crit">Model suy luận chưa sẵn sàng trên máy chủ. Không thể phân tích ảnh và không dùng dữ liệu mẫu thay thế.</div>}
      {note && <div className="vd-banner">{note}</div>}
      {booting && <div className="vd-banner">Đang tạo phiên…</div>}

      {guide && <Onboarding onClose={closeGuide} onStart={() => { closeGuide(); void runVideoScenario('DEMO-05').then(() => openCabinMonitor('evidence')) }} />}

      <section className="vd-strip" aria-label="Kịch bản thử" data-testid="scenarios">
        <ScenarioSelector />
        <CameraControl />
        <button type="button" className="vd-btn vd-press" data-testid="reset" onClick={() => { if (useE2e.getState().state?.incident?.status === 'OPEN' && !window.confirm('Đặt lại sẽ xoá phiên DEMO hiện tại. Đây không phải thao tác giải quyết sự cố. Tiếp tục?')) return; setActive(null); void resetDemo() }}>Đặt lại demo</button>
      </section>

      <VehicleLinkBanner />
      <SmartInteractionCard />
      <CabinShortcut />
      <ScenarioRunPanel />
      <FlowBar />

      <main className={`vd-main ${wide ? 'wide' : ''}`}>
        {w >= 1000 && <figure className="vd-col"><figcaption>Màn xe</figcaption>{cockpit}</figure>}
        {w < 1000 && <MobileCabinHost />}
        {w < 1000 && <p className="vd-mobile-note">Màn xe dành cho màn hình lớn. Dùng Giám sát cabin và điện thoại bên dưới để trải nghiệm đầy đủ trên thiết bị này.</p>}
        {wide && <div className="vd-rev" style={{ width: MID, height: ch }} data-testid="rev-link" aria-label={`Cùng một phiên, revision ${rev}`}>
          <span className="line" aria-hidden /><span className="chip"><small>Revision</small><b>{rev}</b></span><span className="line" aria-hidden /><small className="same">Cùng một phiên</small></div>}
        <figure className="vd-col"><figcaption>Điện thoại chủ xe{!wide && <span className="inl"> · revision {rev}</span>}</figcaption>{phone}</figure>
      </main>

      <Fold id="dev" title="Dành cho người phát triển" summary="Môi trường giả lập · biểu đồ theo dõi · nhật ký bằng chứng kỹ thuật">
        <section className="vd-strip" aria-label="Điều khiển tình huống" data-testid="scenario-controls">
          <button type="button" className="vd-btn" data-testid="ctl-stop" onClick={() => { setActive(null); void stopScenario() }}>Dừng tình huống</button>
          <button type="button" className="vd-btn" data-testid="ctl-drop" onClick={() => void dropVehicleLink()}>Mô phỏng mất kết nối xe</button>
          <button type="button" className="vd-btn" data-testid="ctl-restore" onClick={() => void restoreVehicleLink()}>Mô phỏng nối lại xe</button>
          <button type="button" className="vd-btn" data-testid="ctl-cockpit" onClick={() => navigateView('cockpit')}>Quay lại Cockpit</button>
        </section>
        <section className="vd-strip" aria-label="Fixture chẩn đoán">{SCENARIOS.map((s) => <button key={s.id} type="button" className={`vd-sc ${active === s.id ? 'on' : ''}`} onClick={() => go(s.id)} data-testid={`sc-${s.id}`}><b>{s.label}</b><small>{s.expect}</small></button>)}</section>
        <div className="vd-folds"><SimEnvPanel /><TracePanel /><EvidencePanelVf /></div>
      </Fold>
    </div>
  )
}
