// Demo page for the judges: one screen that shows what to press, which stage the pipeline has reached, the car screen and the owner's
// phone reading the SAME committed revision, and (folded) the simulated environment and the evidence.
import { useEffect, useLayoutEffect, useState } from 'react'
import { Camera, Maximize2, Square } from 'lucide-react'
import { PHONE_H, PHONE_W, PhoneFrame } from '../../../../e2e/PhoneFrame'
import { DEVICE_CAMERA_ENABLED } from '../../../../e2e/SimPanel'
import { onThumb, startDevice, stopSource } from '../../../../e2e/capture'
import { useCareEffects } from '../../../../e2e/careEffects'
import { startEvidenceLog } from '../../../../e2e/evidenceLog'
import { connectionNow } from '../../../../e2e/hooks'
import { startPolling, startTelemetry, stopPolling, stopTelemetry, useE2e } from '../../../../e2e/store'
import { useUi } from '../../../../store/uiStore'
import { useVehicle } from '../../../../store/vehicleStore'
import { VinfastExperience } from '../VinfastExperience'
import { VF_H, VF_W } from '../layout'
import { EvidencePanelVf, SimEnvPanel } from './DemoPanels'
import { TracePanel } from './TracePanel'
import { flowSteps } from './flow'
import { resetDemo, runScenario, SCENARIOS, type ScenarioId } from './scenarios'
import './demo.css'

const GAP = 24, MID = 80

function useViewport() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => { const f = () => set({ w: window.innerWidth, h: window.innerHeight }); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  return s
}
let booted: Promise<void> | null = null

function CameraControl() {
  const source = useE2e((s) => s.source), setSource = useE2e((s) => s.setSource)
  const [ask, setAsk] = useState(false), [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => onThumb(setThumb), [])
  const live = source.kind === 'device' && source.running
  if (!DEVICE_CAMERA_ENABLED) return <span className="vd-cam off" title="Bản trực tuyến không gửi hình khuôn mặt thật lên máy chủ demo. Chạy bản local để dùng camera.">Camera máy: tắt ở bản trực tuyến</span>
  return (
    <div className="vd-cam">
      <button type="button" className={`vd-btn vd-press ${live ? 'live' : 'primary'}`} aria-pressed={live} data-testid="camera-btn"
        onClick={() => { if (live) { stopSource(); setAsk(false) } else setAsk((a) => !a) }}>
        {live ? <><Square size={20} strokeWidth={1.8} />Dừng camera</> : <><Camera size={20} strokeWidth={1.8} />Dùng camera của tôi</>}
      </button>
      {live && thumb && <img className="vd-prev" src={thumb} alt="Khung hình camera gần nhất vừa gửi đi phân tích" />}
      {ask && !live && (
        <div className="vd-consent" role="dialog" aria-label="Đồng ý dùng camera">
          <p>Mỗi giây một khung hình từ camera của máy này được gửi tới máy chủ demo để chạy model. Hình không được lưu sau khi phân tích. Bạn có thể dừng bất cứ lúc nào.</p>
          <label><input type="checkbox" checked={source.consent} onChange={(e) => setSource({ consent: e.target.checked })} />Tôi đồng ý</label>
          <div className="row"><button type="button" className="vd-btn primary vd-press" disabled={!source.consent} onClick={() => { void startDevice(); setAsk(false) }}>Bật camera</button>
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

export function VinfastDemoPage() {
  const { w, h } = useViewport()
  const cockpitOnly = new URLSearchParams(location.search).get('view') === 'cockpit'
  const service = useE2e((s) => s.service), serviceError = useE2e((s) => s.serviceError), booting = useE2e((s) => s.booting), session = useE2e((s) => s.session), note = useE2e((s) => s.sessionNote)
  const revision = useE2e((s) => s.state?.revision), source = useE2e((s) => s.source)
  const [active, setActive] = useState<ScenarioId | null>(null)
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

  if (cockpitOnly) return <div className="h-screen w-screen overflow-hidden bg-black"><div className="relative h-full w-full overflow-hidden" data-testid="cockpit"><VinfastExperience /></div></div>

  const wide = w >= 1200
  const HEADER = 72, STRIP = 96, FLOW = 72, CAPTION = 40, BARS = 72, GAPS = 5 * 12
  const rowH = wide ? Math.max(460, h - HEADER - STRIP - FLOW - CAPTION - BARS - GAPS) : 0
  const phoneScale = wide ? Math.min(1, rowH / (PHONE_H + 8)) : Math.min(1, (w - 32) / PHONE_W)
  const phoneW = Math.round(PHONE_W * phoneScale), phoneH = Math.round(PHONE_H * phoneScale)
  const cockpitScale = wide ? Math.min((w - GAP * 2 - phoneW - MID) / VF_W, rowH / VF_H) : (w - 32) / VF_W
  const cw = Math.floor(VF_W * cockpitScale), ch = Math.floor(VF_H * cockpitScale)
  const go = (id: ScenarioId) => { setActive(id); void runScenario(id) }
  const rev = revision ?? '—'
  const cockpit = <div className="vd-frame" style={{ width: cw, height: ch }} data-testid="cockpit"><VinfastExperience /></div>
  const phone = <div style={{ width: phoneW, height: phoneH }}><div style={{ transform: `scale(${phoneScale})`, transformOrigin: 'top left', width: PHONE_W, height: PHONE_H }}><PhoneFrame /></div></div>

  return (
    <div className="vd">
      <header className="vd-head" style={{ minHeight: HEADER }}>
        <img className="vd-logo" src={`${import.meta.env.BASE_URL}vinfast/brand/cabin-noir-logo.png`} alt="Cabin Noir" height={44} width={44} />
        <div className="ttl"><h1>CabinSentinel · thử luồng cảnh báo trên xe và điện thoại</h1>
          <p>Hình ảnh được model thật phân tích. Dữ liệu xe và lệnh xe là giả lập, không điều khiển xe thật.</p></div>
        <span className="grow" />
        <span className="vd-sess" role="status">{source.running ? `Đang phân tích: ${source.cameraFault ? 'camera lỗi giả lập' : source.label} · ` : ''}{session ? `Phiên ${session.id.slice(0, 8)}` : 'Chưa có phiên'}</span>
        <a className="vd-btn vd-press" href="?view=cockpit"><Maximize2 size={20} strokeWidth={1.8} />Toàn màn hình xe</a>
      </header>

      {serviceError && <div role="alert" className="vd-banner crit">{serviceError}. Không có dữ liệu thay thế: các màn sẽ báo chưa có dữ liệu.</div>}
      {service && !service.model.ready && <div role="alert" className="vd-banner crit">Model suy luận chưa sẵn sàng trên máy chủ. Không thể phân tích ảnh và không dùng dữ liệu mẫu thay thế.</div>}
      {note && <div className="vd-banner">{note}</div>}
      {booting && <div className="vd-banner">Đang tạo phiên…</div>}

      <section className="vd-strip" aria-label="Kịch bản thử" data-testid="scenarios">
        <span className="vd-cap-l">Bấm một kịch bản</span>
        {SCENARIOS.map((s) => (
          <button key={s.id} type="button" className={`vd-sc vd-press ${active === s.id ? 'on' : ''}`} aria-pressed={active === s.id} onClick={() => go(s.id)} data-testid={`sc-${s.id}`}>
            <b>{s.label}</b><small>{s.expect}</small></button>))}
        <CameraControl />
        <button type="button" className="vd-btn vd-press" data-testid="reset" onClick={() => { setActive(null); void resetDemo() }}>Đặt lại</button>
      </section>

      <FlowBar />

      <main className={`vd-main ${wide ? 'wide' : ''}`}>
        <figure className="vd-col"><figcaption>Màn xe</figcaption>{cockpit}</figure>
        {wide && <div className="vd-rev" style={{ width: MID, height: ch }} data-testid="rev-link" aria-label={`Cùng một phiên, revision ${rev}`}>
          <span className="line" aria-hidden /><span className="chip"><small>Revision</small><b>{rev}</b></span><span className="line" aria-hidden /><small className="same">Cùng một phiên</small></div>}
        <figure className="vd-col"><figcaption>Điện thoại chủ xe{!wide && <span className="inl"> · revision {rev}</span>}</figcaption>{phone}</figure>
      </main>

      <div className="vd-folds"><SimEnvPanel /><TracePanel /><EvidencePanelVf /></div>
    </div>
  )
}
