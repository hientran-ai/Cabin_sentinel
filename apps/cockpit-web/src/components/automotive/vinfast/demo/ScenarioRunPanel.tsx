import { api } from '../../../../e2e/api'
import { openCabinMonitor } from '../../../../e2e/cabinUi'
import { DEMO_SCENARIOS } from '../../../../e2e/demoCatalog'
import { useView } from '../../../../e2e/hooks'
import { useSourceSummary } from '../../../../e2e/useSource'
import { useE2e } from '../../../../e2e/store'
import { useVehicle } from '../../../../store/vehicleStore'
import { useUi } from '../../../../store/uiStore'
import { CLIPS, startClip } from '../../../../e2e/capture'

/** One highest-priority interaction; all suggestions reuse the existing Care implementation. */
export function SmartInteractionCard() {
  const state = useE2e((s) => s.state), session = useE2e((s) => s.session), careAction = useE2e((s) => s.care)
  const view = useView(), moving = useVehicle((s) => s.speed > 0)
  if (state?.incident?.status === 'OPEN') return <section className={`vd-interaction ${state.risk_level === 'CRITICAL' ? 'critical' : 'warning'}`} role={state.risk_level === 'CRITICAL' ? 'alert' : 'status'} aria-atomic="true" data-testid="smart-interaction" data-kind="SAFETY">
    <div><b>{state.risk_level === 'CRITICAL' ? 'Cảnh báo nghiêm trọng' : 'Sự cố vẫn mở'} · {view.current ? view.headline : 'Dữ liệu chưa xác minh'}</b><p>{view.current ? view.reason : 'Giữ cảnh báo của sự cố trước. Cập nhật nguồn và trực tiếp kiểm tra cabin.'} · Hành động xe MÔ PHỎNG.</p></div>
    <button type="button" className="vd-btn" onClick={() => openCabinMonitor()}>Xem sự cố</button>
  </section>
  if (moving) return null
  const reminder = state?.items?.reminders.find((r) => r.status === 'OPEN')
  if (reminder && session) return <section className="vd-interaction" data-testid="smart-interaction" data-kind="ITEM">
    <div><b>Có thể còn {reminder.class === 'backpack' ? 'ba lô' : 'điện thoại'}</b><p>Hai khung mới có cùng nhãn; chưa xác minh danh tính đồ vật. Nhắc sau chuyến đi MÔ PHỎNG, không phải khẩn cấp.</p></div>
    <button type="button" className="vd-btn" onClick={() => openCabinMonitor('evidence')}>Xem bằng chứng</button>
    <button type="button" className="vd-btn" onClick={() => void careAction((s) => api.itemResponse(s, reminder.id, 'TAKEN'), 'Đã ghi nhận đã lấy đồ vật. Không thay đổi sự cố an toàn.')}>Đã lấy</button>
    <button type="button" className="vd-btn" onClick={() => void careAction((s) => api.itemResponse(s, reminder.id, 'SNOOZE', 5), 'Đã nhắc lại sau 5 phút nếu còn bằng chứng mới.')}>Nhắc lại sau 5 phút</button>
  </section>
  if (state?.care?.suggestion) return <section className="vd-interaction" data-testid="smart-interaction" data-kind="CARE"><div><b>Gợi ý chăm sóc cabin</b><p>{state.care.suggestion.text}</p></div><button type="button" className="vd-btn" onClick={() => useUi.getState().setOverlay('carmode')}>Chọn chăm sóc</button></section>
  return null
}

export function ScenarioRunPanel() {
  const source = useE2e((s) => s.source), state = useE2e((s) => s.state), sim = useE2e((s) => s.sim)
  const current = useSourceSummary(), scenario = DEMO_SCENARIOS.find((s) => s.id === source.scenarioId)
  if (!scenario) return null
  const obs = current.analysis === 'running' ? state?.last_observation : null
  return <section className="vd-pipeline" aria-label="Nguồn dữ liệu tình huống" data-testid="scenario-pipeline">
    <div><b>DEMO VIDEO</b><span>{scenario.id} · {scenario.title}</span><small>{source.playerPhase ?? 'IDLE'}{source.error ? ` · ${source.error}` : ''}</small></div>
    <div><b>SIMULATED SENSOR DATA</b><span>{sim.telemetryEnabled === false ? 'Radar chưa cấu hình — không phát gói cảm biến thiếu dữ liệu' : `${state?.sensor_snapshot?.temperature ?? '—'}°C · radar ${sim.radar ? 'dương tính' : 'âm tính'} · ${sim.driverPresent ? 'có tài xế' : 'tài xế vắng'}`}</span><small>Giá trị bổ sung khi manifest thiếu: 25°C, pin 80%; chỉnh trong môi trường giả lập.</small></div>
    <div><b>AI DETECTION RESULT</b><span>{obs?.vision ? [...obs.vision.detections, ...(obs.vision.items ?? [])].map((d) => `${d.class} ${(d.confidence * 100).toFixed(0)}%`).join(', ') || 'Không có detection; không xác minh cabin trống' : 'Đang chờ frame đúng nguồn'}</span><small>person không phải nhãn trẻ em; vị trí trong/ngoài cabin chưa được xác minh.</small></div>
    <div><b>RISK EVALUATION</b><span>{state ? `${state.risk_level} · ${state.rule_id}` : 'UNKNOWN'}</span><small>Luật backend; dữ liệu cũ/thiếu luôn được ghi rõ.</small></div>
    <div><b>ACTION RESULT</b><span>{state?.action_results.length ? state.action_results.map((a) => `${a.tool}: ${a.status}`).join(', ') : 'Chưa có action mới'}</span><small>Lệnh xe MÔ PHỎNG; không gọi cứu hộ.</small></div>
    <button type="button" className="vd-btn" onClick={() => openCabinMonitor('evidence')}>Xem video và bằng chứng</button>
    {!source.running && ['READY', 'ENDED'].includes(source.playerPhase ?? '') && <button type="button" className="vd-btn primary" onClick={() => { const clip = CLIPS.find((c) => c.id === scenario.id); if (clip) void startClip(clip) }}>Phát lại video để tiếp tục phân tích</button>}
  </section>
}
