import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEMO_SCENARIOS } from '../../../../e2e/demoCatalog'
import { openCabinMonitor } from '../../../../e2e/cabinUi'
import { useE2e } from '../../../../e2e/store'
import { navigateView } from '../../../../lib/route'
import { SIM_SCENARIOS } from '../../../../e2e/simScenarios'
import { runSimScenario, runVideoScenario } from './scenarios'
import './scenarioSelector.css'

const OBJECTIVE: Record<string, string> = {
  'DEMO-01': 'Phân biệt người trong khung và người trong cabin; vị trí chưa được model xác minh.',
  'DEMO-02': 'Quan sát âm tính không đủ để kết luận cabin trống.',
  'DEMO-03': 'Camera che một phần, radar mô phỏng dương tính; xem fallback.',
  'DEMO-04': 'Ảnh thiếu sáng: xem detection thật hoặc sự chưa chắc chắn.',
  'DEMO-05': 'Người trong xe nóng 39,8°C mô phỏng; tuổi không suy từ nhãn person.',
  'DEMO-06': 'Người, thú và đồ vật: xem đúng khả năng hiện tại của model.',
  'DEMO-07': 'Xe đang chạy, tài xế hiện diện và điều hoà mô phỏng.',
  'DEMO-08': 'Sau chuyến đi: thử bằng chứng đồ vật qua nhiều frame, không tạo khẩn cấp từ đồ vật.',
}

export function ScenarioSelector() {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const source = useE2e((s) => s.source), incident = useE2e((s) => s.state?.incident)
  useEffect(() => {
    if (open) dialog.current?.showModal(); else dialog.current?.close()
  }, [open])
  // After "Bắt đầu demo": land on the main Giám sát cabin screen. The clip keeps running and its frame shows in "Xem nhanh".
  const start = async (id: string) => {
    if (busy) return
    setBusy(id)
    try { if (id.startsWith('SIM-')) await runSimScenario(id as 'SIM-01' | 'SIM-02'); else await runVideoScenario(id); setOpen(false); openCabinMonitor('overview') } finally { setBusy(null) }
  }
  return <>
    <button type="button" className="vd-btn primary vd-press" aria-expanded={open} onClick={() => setOpen(true)} data-testid="scenario-selector">Trải nghiệm tình huống</button>
    {source.scenarioId && <span className="vd-sess">{source.scenarioId} · {source.playerPhase ?? 'IDLE'}</span>}
    {createPortal(<dialog ref={dialog} className="vs-dialog" aria-label="Trải nghiệm tình huống" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header><div><h2>Trải nghiệm tình huống</h2><p>DEMO VIDEO · Cảm biến và trạng thái xe MÔ PHỎNG. Kết quả AI do model thật trả về.</p></div>
        <button type="button" className="vd-btn" aria-label="Đóng bộ chọn tình huống" onClick={() => setOpen(false)}>Đóng</button></header>
      {incident?.status === 'OPEN' && <p className="vs-warning">Sự cố phiên hiện tại vẫn mở. Bắt đầu tình huống mới tạo một phiên demo riêng; không tự giải quyết sự cố trước.</p>}
      <div className="vs-grid">{DEMO_SCENARIOS.map((s) => <article key={s.id} data-scenario-id={s.id}>
        <img src={`${import.meta.env.BASE_URL}samples/${s.poster}`} alt={`${s.id}: ${s.title}`} loading="lazy" />
        <div><small>{s.id} · DEMO VIDEO</small><h3>{s.title}</h3><p>{OBJECTIVE[s.id]}</p>
          <button type="button" className="vd-btn primary" disabled={busy !== null} data-testid={`start-${s.id}`} onClick={() => void start(s.id)}>{busy === s.id ? 'Đang chuẩn bị…' : 'Bắt đầu demo'}</button>
        </div></article>)}
        {SIM_SCENARIOS.map((s) => <article key={s.scenario_id} data-scenario-id={s.scenario_id} className="vs-sim">
          <div><small>{s.scenario_id} · MÔ PHỎNG · không có video thật</small><h3>{s.title}</h3><p>{s.objective}</p><p className="vs-src">Nguồn hình: {s.actual_media_source}</p>
            <button type="button" className="vd-btn primary" disabled={busy !== null} data-testid={`start-${s.scenario_id}`} onClick={() => void start(s.scenario_id)}>{busy === s.scenario_id ? 'Đang chuẩn bị…' : 'Bắt đầu mô phỏng'}</button></div></article>)}</div>
      <footer><button type="button" className="vd-btn" onClick={() => { setOpen(false); navigateView('cockpit') }}>Thoát về Cockpit</button>
        <span>Poster chỉ để chọn tình huống. AI phân tích frame video, không phân tích poster.</span></footer>
    </dialog>, document.body)}
  </>
}
