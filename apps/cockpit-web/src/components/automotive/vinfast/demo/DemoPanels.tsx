// Collapsible panels under the demo: simulated environment (all inputs, tidy) and evidence (what the pipeline really did).
// Same data and handlers as the old simulator and evidence strip, in Vietnamese labels and VinFast styling.
import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { linkState } from '../../../../e2e/api'
import { CLIPS, sendStill, setCameraFault, startClip, stopSource } from '../../../../e2e/capture'
import { AGE_TEXT, ageCapabilityOf } from '../../../../e2e/cabinCounts'
import { download, LOG_MAX, summarize, toCsv, toJsonl, useEvidenceLog } from '../../../../e2e/evidenceLog'
import { clock, liveAge, useTick } from '../../../../e2e/hooks'
import { rate, useE2e } from '../../../../e2e/store'
import type { SensorInput } from '../../../../e2e/types'
import { ageText, OCCUPANCY, RULE_VI } from '../../../../e2e/view'
import { fetchWeather, WEATHER_PLACE } from '../../../../e2e/weather'
import { useVehicle } from '../../../../store/vehicleStore'

export function Fold({ id, title, summary, children, defaultOpen = false }: { id: string; title: string; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`vd-fold ${open ? 'open' : ''}`} data-testid={id}>
      <button type="button" className="vd-fold-head vd-press" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="t">{title}</span><span className="s">{summary}</span><ChevronDown size={24} strokeWidth={1.8} aria-hidden />
      </button>
      {open && <div className="vd-fold-body">{children}</div>}
    </section>
  )
}
const Toggle = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => <button type="button" className={`vd-chipbtn vd-press ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{label}</button>
const Field = ({ label, children }: { label: string; children: ReactNode }) => <div className="vd-field"><span className="k">{label}</span><div className="v">{children}</div></div>
const MODE_VI: [SensorInput['operation_mode'], string][] = [['NONE', 'Không'], ['PET', 'Thú cưng'], ['CAMP', 'Cắm trại'], ['REMOTE_START', 'Khởi động từ xa']]

export function SimEnvPanel() {
  const v = useVehicle(), sim = useE2e((s) => s.sim), setSim = useE2e((s) => s.setSim), source = useE2e((s) => s.source), setFault = useE2e((s) => s.setMessagingFault)
  const file = useRef<HTMLInputElement>(null)
  const [wx, setWx] = useState<string | null>(null)
  const loadWeather = async () => {
    setWx('Đang lấy…')
    try { const w = await fetchWeather(); v.set({ outsideTemperature: Math.round(w.temperatureC * 10) / 10 }); setWx(`${WEATHER_PLACE.name} ${w.temperatureC.toFixed(1)} °C`) } catch { setWx('Không lấy được thời tiết, dùng thanh trượt') }
  }
  const summary = `Trong xe ${v.cabinTemperature.toFixed(0)} °C · ${v.isLocked ? 'khoá' : 'mở khoá'} · động cơ ${sim.engineOn ? 'bật' : 'tắt'} · ${source.cameraFault ? 'camera lỗi' : source.kind === 'none' ? 'chưa có nguồn hình' : source.label}`
  return (
    <Fold id="sim-env" title="Môi trường giả lập" summary={summary}>
      <div className="vd-grid3">
        <div className="vd-block">
          <h4>Nhiệt độ</h4>
          <Field label={`Trong xe ${v.cabinTemperature.toFixed(1)} °C`}><input type="range" min={10} max={55} step={0.5} value={v.cabinTemperature} aria-label="Nhiệt độ trong xe giả lập" onChange={(e) => v.set({ cabinTemperature: +e.target.value })} /></Field>
          <Field label={`Ngoài trời ${v.outsideTemperature.toFixed(1)} °C`}><input type="range" min={0} max={45} step={0.5} value={v.outsideTemperature} aria-label="Nhiệt độ ngoài trời giả lập" onChange={(e) => v.set({ outsideTemperature: +e.target.value })} /></Field>
          <Field label="Tua nhanh nóng lên">{[1, 10, 60].map((k) => <Toggle key={k} on={(v.heatScale || 1) === k} label={`×${k}`} onClick={() => v.set({ heatScale: k })} />)}</Field>
          <Field label="Thời tiết thật"><button type="button" className="vd-chipbtn vd-press" onClick={() => void loadWeather()}>Lấy ở {WEATHER_PLACE.name}</button>{wx && <span className="vd-note" role="status">{wx}</span>}</Field>
        </div>
        <div className="vd-block">
          <h4>Xe</h4>
          <Field label="Số">{(['P', 'R', 'N', 'D'] as const).map((g) => <Toggle key={g} on={v.gear === g} label={g} onClick={() => v.setGear(g)} />)}</Field>
          <Field label="Trạng thái">
            <Toggle on={sim.engineOn} label="Động cơ bật" onClick={() => setSim({ engineOn: !sim.engineOn })} />
            <Toggle on={v.isLocked} label="Cửa khoá" onClick={() => v.set({ isLocked: !v.isLocked })} />
            <Toggle on={sim.driverPresent} label="Có tài xế" onClick={() => setSim({ driverPresent: !sim.driverPresent })} />
            <Toggle on={sim.radar} label="Radar báo có người" onClick={() => setSim({ radar: !sim.radar })} />
            <Toggle on={v.climate.enabled} label="Điều hoà bật" onClick={() => v.setClimate({ enabled: !v.climate.enabled })} />
            <Toggle on={sim.hvacFault} label="Điều hoà lỗi" onClick={() => setSim({ hvacFault: !sim.hvacFault })} />
          </Field>
          <Field label="Chế độ xe">{MODE_VI.map(([m, l]) => <Toggle key={m} on={sim.mode === m} label={l} onClick={() => setSim({ mode: m })} />)}</Field>
        </div>
        <div className="vd-block">
          <h4>Nguồn hình và lỗi</h4>
          <Field label="Clip mẫu">{CLIPS.map((c) => <Toggle key={c.id} on={source.kind === 'clip' && source.label === c.label} label={c.label.replace(/ \(clip mô phỏng AI\)/, '')} onClick={() => void startClip(c)} />)}</Field>
          <Field label="Ảnh của bạn">
            <button type="button" className="vd-chipbtn vd-press" onClick={() => file.current?.click()}>Tải ảnh lên</button>
            <button type="button" className="vd-chipbtn vd-press" onClick={stopSource}>Dừng nguồn hình</button>
            <input ref={file} type="file" accept="image/jpeg,image/png" className="vd-hidden" data-testid="still-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendStill(f); e.target.value = '' }} />
          </Field>
          <Field label="Lỗi camera">
            <Toggle on={source.cameraFault === 'BLOCKED'} label="Bị che" onClick={() => setCameraFault(source.cameraFault === 'BLOCKED' ? null : 'BLOCKED')} />
            <Toggle on={source.cameraFault === 'DISCONNECTED'} label="Mất kết nối" onClick={() => setCameraFault(source.cameraFault === 'DISCONNECTED' ? null : 'DISCONNECTED')} />
          </Field>
          <Field label="Thông báo"><button type="button" className="vd-chipbtn vd-press" onClick={() => void setFault(true)}>Bộ gửi lỗi</button><button type="button" className="vd-chipbtn vd-press" onClick={() => void setFault(false)}>Bộ gửi hoạt động lại</button></Field>
          <Field label="Mạng"><button type="button" className="vd-chipbtn vd-press" onClick={() => { linkState.cutUntil = performance.now() + 15000 }}>Ngắt kết nối 15 giây</button></Field>
          {source.error && <p role="alert" className="vd-err">{source.error}</p>}
        </div>
      </div>
      <p className="vd-note">Mọi ô ở đây chỉ là đầu vào của bộ mô phỏng. Không có ô nào đặt mức rủi ro hay nhãn trẻ em: kết quả luôn do máy chủ trả về. Xe đỗ và khoá nóng dần về nhiệt độ ngoài trời + 8 °C theo mô hình mô phỏng.</p>
    </Fold>
  )
}

const DET_VI: Record<string, string> = { person: 'người', dog: 'chó', cat: 'mèo' }
const RISK_VI: Record<string, string> = { SAFE: 'Chưa thấy nguy cơ', NOTICE: 'Lưu ý', WARNING: 'Cảnh báo', CRITICAL: 'Nguy hiểm', ERROR: 'Không xác minh được' }
const ms = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(x < 10 ? 1 : 0)} ms`)
const Row = ({ k, v }: { k: string; v: ReactNode }) => <><dt>{k}</dt><dd>{v}</dd></>

export function EvidencePanelVf() {
  useTick(1000)
  const state = useE2e((s) => s.state), received = useE2e((s) => s.receivedPerf), session = useE2e((s) => s.session), service = useE2e((s) => s.service)
  const metrics = useE2e((s) => s.metrics), notes = useE2e((s) => s.notifications), source = useE2e((s) => s.source), connection = useE2e((s) => s.connection)
  const obs = state?.last_observation, model = state?.model ?? service?.model, snap = state?.sensor_snapshot as Record<string, unknown> | null | undefined, reply = metrics.lastReply
  const visionAge = liveAge(state?.freshness.vision, received)
  const summary = state
    ? `Revision ${state.revision} · ${RISK_VI[state.risk_level]} · ${state.decision_current ? 'dữ liệu hiện tại' : 'dữ liệu đã cũ'} · ${connection === 'ok' ? 'đang kết nối' : 'mất kết nối'}`
    : 'Chưa có quyết định nào được lưu'
  return (
    <Fold id="evidence" title="Bằng chứng" summary={summary}>
      <div className="vd-grid3">
        <div className="vd-block"><h4>Hình ảnh và model</h4><dl>
          <Row k="Nguồn" v={source.kind === 'none' ? 'chưa chọn' : source.label} />
          <Row k="Khung gần nhất" v={obs ? <code>{obs.frame_id}</code> : '—'} />
          <Row k="Quan sát lúc" v={clock(obs?.observed_at)} />
          <Row k="Phát hiện" v={obs?.vision?.detections?.length ? obs.vision.detections.map((d) => `${DET_VI[d.class] ?? d.class} ${(d.confidence * 100).toFixed(0)}%`).join(', ') : obs?.camera_status ? `camera ${obs.camera_status}` : 'không có'} />
          <Row k="Nhận diện tuổi" v={AGE_TEXT[ageCapabilityOf(state, service?.model?.age_classifier)]} />
          <Row k="Model" v={model?.file ? <code>{model.file} · {model.sha256?.slice(0, 10)}</code> : 'chưa nạp'} />
        </dl></div>
        <div className="vd-block"><h4>Quyết định đã lưu</h4><dl>
          <Row k="Phiên · sự cố" v={<code>{session?.id.slice(0, 8) ?? '—'} · {state?.incident_id?.slice(0, 8) ?? 'không có'}</code>} />
          <Row k="Revision" v={state?.revision ?? '—'} />
          <Row k="Mức rủi ro" v={state ? `${RISK_VI[state.risk_level]} (trước đó ${state.previous_risk_level ? RISK_VI[state.previous_risk_level] : '—'})` : '—'} />
          <Row k="Lý do" v={state ? (RULE_VI[state.rule_id] ?? state.reason) : '—'} />
          <Row k="Trong xe" v={state ? OCCUPANCY[state.occupancy_state] : '—'} />
          <Row k="Còn hiện tại" v={state ? (state.decision_current ? 'Có' : 'Không: có nguồn đã cũ hoặc camera lỗi') : '—'} />
        </dl></div>
        <div className="vd-block"><h4>Xe giả lập và thông báo</h4><dl>
          <Row k="Nhiệt độ cabin" v={snap ? `${String(snap.temperature)} °C` : '—'} />
          <Row k="Động cơ · cửa" v={snap ? `${snap.engine_status === 'ON' ? 'bật' : 'tắt'} · ${snap.doors_locked ? 'khoá' : 'mở'}` : '—'} />
          <Row k="Tuổi dữ liệu" v={`cảm biến ${ageText(liveAge(state?.freshness.sensor, received))} · hình ${ageText(visionAge)}`} />
          <Row k="Lệnh gần nhất" v={state?.action_ledger.length ? state.action_ledger.slice(0, 3).map((a) => `${a.tool} ${a.status}`).join(' · ') : 'không có'} />
          <Row k="Thông báo" v={`${notes.length} · điện thoại ${notes[0]?.channels.in_app_feed.state === 'IN_APP_DELIVERED' ? 'đã nhận' : notes.length ? 'chưa nhận' : '—'}`} />
          <Row k="Mở khoá" v={state?.unlock_request ? 'đang chờ người xác nhận' : 'không có yêu cầu'} />
        </dl></div>
      </div>
      <div className="vd-grid3">
        <div className="vd-block"><h4>Đo thực tế (trình duyệt này và máy chủ demo)</h4><dl>
          <Row k="Suy luận mỗi giây" v={rate(metrics.accTimes).toFixed(2)} /><Row k="Model" v={ms(reply?.timings_ms.infer_detector)} /><Row k="Máy chủ tổng" v={ms(reply?.timings_ms.server_total)} /><Row k="Vòng mạng" v={ms(metrics.lastRttMs)} />
          <Row k="Khung" v={`${metrics.accepted} nhận · ${metrics.dropped} bỏ · ${metrics.errors} lỗi`} />
        </dl></div>
        <div className="vd-block" style={{ gridColumn: 'span 2' }}><h4>Nhật ký bằng chứng (ghi lại trong trình duyệt này)</h4>
          <LogBlock model={model} />
        </div>
      </div>
    </Fold>
  )
}

const fx = (x: number | null, d = 0) => (x == null ? '—' : x.toFixed(d))
function LogBlock({ model }: { model: unknown }) {
  const entries = useEvidenceLog((s) => s.entries), clear = useEvidenceLog((s) => s.clear)
  const sum = summarize(entries)
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const empty = entries.length === 0
  return (
    <div className="vd-log2" data-testid="evidence-log">
      <dl className="vd-statgrid">
        <Row k="Khung đã ghi" v={<b data-testid="log-frames">{sum.frames}</b>} />
        <Row k="Có người" v={sum.withPerson} />
        <Row k="Có chó/mèo" v={sum.withPet} />
        <Row k="Nhãn trẻ em" v={sum.ageLabelFrames ? `${sum.withChildLabel}/${sum.ageLabelFrames}` : 'chưa bật'} />
        <Row k="Camera lỗi" v={sum.cameraFaults} />
        <Row k="Suy luận TB / P95" v={`${fx(sum.inferMeanMs)} / ${fx(sum.inferP95Ms)} ms`} />
      </dl>
      <p className="vd-note">{sum.models.length ? `Model: ${sum.models.join(' · ')}` : 'Chưa ghi nhận model'}{sum.spanS != null ? ` · ${Math.round(sum.spanS)} giây` : ''}</p>
      <ul className="vd-log">{entries.slice(-5).reverse().map((e) => <li key={e.n}><time>{clock(e.at)}</time><span>{e.kind === 'frame' ? `khung ${e.frame_id?.slice(-6) ?? ''}` : 'quyết định'} · {e.dets.length ? e.dets.map((d) => `${DET_VI[d.c] ?? d.c} ${Math.round(d.p * 100)}%`).join(', ') : e.camera_status && e.camera_status !== 'OK' ? `camera ${e.camera_status}` : 'không phát hiện'} · rev {e.revision} · {RISK_VI[e.risk] ?? e.risk}</span></li>)}{empty && <li>Chưa có khung nào. Chạy một kịch bản hoặc bật camera.</li>}</ul>
      <div className="vd-row">
        <button type="button" className="vd-chipbtn vd-press" disabled={empty} onClick={() => download(`cabin-evidence-${stamp()}.jsonl`, toJsonl(entries, { model }), 'application/x-ndjson')}>Tải nhật ký (.jsonl)</button>
        <button type="button" className="vd-chipbtn vd-press" disabled={empty} onClick={() => download(`cabin-evidence-${stamp()}.csv`, toCsv(entries), 'text/csv')}>Tải bảng (.csv)</button>
        <button type="button" className="vd-chipbtn vd-press" disabled={empty} onClick={clear}>Xoá nhật ký</button>
      </div>
      <p className="vd-note">Nhật ký chỉ lưu tên lớp, độ tin cậy, thời gian xử lý và quyết định đã lưu: không có ảnh, không có tọa độ. Lưu tối đa {LOG_MAX} dòng, chỉ trên máy này, xoá được bất cứ lúc nào. Đây là bằng chứng pipeline đã chạy, không phải độ chính xác của model. Không phát hiện người hoặc thú không chứng minh xe trống.</p>
    </div>
  )
}
