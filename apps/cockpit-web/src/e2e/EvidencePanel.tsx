// What the judges need to see under the screens: where every number came from, how fresh it is, which revision both
// screens show, and the timings that were really measured. Nothing here is computed risk.
import { useEffect, useRef, useState } from 'react'
import { rate, useE2e } from './store'
import { ageText, OCCUPANCY } from './view'
import { clock, liveAge, useTick } from './hooks'
import { Chip, SimBadge } from './ui'
import { AGE_TEXT, ageCapabilityOf } from './cabinCounts'

const ms = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(v < 10 ? 1 : 0)} ms`)

function useUiFps(): number {
  const [fps, setFps] = useState(0)
  const frames = useRef(0)
  useEffect(() => {
    let raf = 0, last = performance.now()
    const loop = (t: number) => { frames.current += 1; if (t - last >= 1000) { setFps(Math.round((frames.current * 1000) / (t - last))); frames.current = 0; last = t }; raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="px-card p-3"><div className="px-k mb-2">{title}</div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">{children}</dl></section>
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <><dt className="text-text-2">{k}</dt><dd className="min-w-0 break-words">{v}</dd></>

export function EvidencePanel() {
  useTick(1000)
  const fps = useUiFps()
  const state = useE2e((s) => s.state), received = useE2e((s) => s.receivedPerf), session = useE2e((s) => s.session)
  const metrics = useE2e((s) => s.metrics), service = useE2e((s) => s.service), notes = useE2e((s) => s.notifications), history = useE2e((s) => s.history)
  const source = useE2e((s) => s.source), connection = useE2e((s) => s.connection)
  const [commitMs, setCommitMs] = useState<number | null>(null)
  // time from receiving the committed state to React painting it (measured, not estimated)
  useEffect(() => { if (received > 0) { const id = requestAnimationFrame(() => setCommitMs(performance.now() - received)); return () => cancelAnimationFrame(id) } }, [received])
  const obs = state?.last_observation
  const model = state?.model ?? service?.model
  const reply = metrics.lastReply
  const delivered = notes.find((n) => n.channels.in_app_feed.delivered_at)
  const deliveryLatency = delivered ? (new Date(delivered.channels.in_app_feed.delivered_at!).getTime() - new Date(delivered.sent_at).getTime()) / 1000 : null
  const snap = state?.sensor_snapshot as Record<string, unknown> | null | undefined
  return (
    <div className="px-ui" data-testid="evidence">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Bằng chứng pipeline</h2>
        <Chip title="Toàn bộ chạy trên máy chủ demo và trình duyệt này">HOSTED_SIMULATION</Chip><Chip>OEM_NOT_VERIFIED</Chip><Chip>PUSH_OS_NOT_VERIFIED</Chip>
        <Chip tone={model?.ready ? 'ok' : 'critical'}>{model?.ready ? 'Model sẵn sàng' : 'Model chưa sẵn sàng'}</Chip>
        <Chip tone={connection === 'ok' ? 'ok' : 'critical'}>{connection === 'ok' ? 'Kết nối máy chủ' : 'Mất kết nối'}</Chip>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Block title="Đầu vào hình ảnh & model">
          <Row k="Nguồn" v={source.kind === 'none' ? 'chưa chọn' : `${source.kind} · ${source.label}`} />
          <Row k="Khung gần nhất" v={obs ? <span className="px-mono">{obs.frame_id}</span> : '—'} />
          <Row k="observed_at" v={clock(obs?.observed_at)} /><Row k="received_at" v={clock(obs?.received_at)} />
          <Row k="Phát hiện" v={obs?.vision?.detections?.length ? obs.vision.detections.map((d) => `${d.class} ${(d.confidence * 100).toFixed(0)}%`).join(', ') : obs?.camera_status ? `camera ${obs.camera_status} (${obs.origin})` : 'không có'} />
          <Row k="Nhãn trẻ em" v={`${AGE_TEXT[ageCapabilityOf(state, service?.model?.age_classifier)]}. Detector chỉ trả person/cat/dog; tuổi không vào luật`} />
          <Row k="Model" v={model?.file ? <span className="px-mono">{model.file} · {model.sha256?.slice(0, 12)}…</span> : 'chưa nạp'} />
          <Row k="Phiên bản" v={`${model?.framework ?? '—'} ${model?.ultralytics_version ?? ''} · ${model?.runtime ?? '—'} (máy chủ)`} />
        </Block>
        <Block title="Telemetry xe (MÔ PHỎNG)">
          <Row k="Nguồn" v={<SimBadge />} />
          <Row k="Nhiệt độ" v={snap ? `${String(snap.temperature)} °C` : '—'} /><Row k="Động cơ / khoá" v={snap ? `${String(snap.engine_status)} / ${snap.doors_locked ? 'khoá' : 'mở'}` : '—'} />
          <Row k="Radar / điều hoà" v={snap ? `${snap.radar_presence ? 'có' : 'không'} / ${String(snap.hvac_status)}` : '—'} />
          <Row k="Timestamp sensor" v={clock(state?.freshness.sensor.observed_at)} />
          <Row k="Tuổi sensor" v={<>{ageText(liveAge(state?.freshness.sensor, received))} · {state?.freshness.sensor.status ?? '—'} <span className="text-text-3">(hạn {state?.ttl_s.sensor ?? 5}s)</span></>} />
          <Row k="Tuổi vision" v={<>{ageText(liveAge(state?.freshness.vision, received))} · {state?.freshness.vision.status ?? '—'} <span className="text-text-3">(hạn {state?.ttl_s.vision ?? 3}s)</span></>} />
          <Row k="Chất lượng dữ liệu" v={state?.data_quality ? `${state.data_quality.status}${state.data_quality.issues.length ? ` · ${state.data_quality.issues.join(', ')}` : ''}` : '—'} />
        </Block>
        <Block title="Quyết định đã commit">
          <Row k="Xe / phiên" v={<span className="px-mono">{state?.vehicle_id ?? '—'} / {session?.id.slice(0, 8) ?? '—'}</span>} />
          <Row k="Sự cố" v={<span className="px-mono">{state?.incident_id?.slice(0, 8) ?? '—'}</span>} /><Row k="Revision" v={state?.revision ?? '—'} />
          <Row k="Rủi ro" v={state ? `${state.risk_level} (trước đó ${state.previous_risk_level ?? '—'})` : '—'} />
          <Row k="Luật" v={state ? `${state.rule_id} · ${state.reason}` : '—'} />
          <Row k="Có người/thú" v={state ? `${OCCUPANCY[state.occupancy_state]} · ${state.occupancy_reason_code}` : '—'} />
          <Row k="Mâu thuẫn" v={state?.evidence_conflicts.length ? state.evidence_conflicts.map((c) => c.type).join(', ') : 'không'} />
          <Row k="Hiện tại?" v={state ? (state.decision_current ? 'có' : 'không (có nguồn đã cũ hoặc camera lỗi)') : '—'} />
        </Block>
        <Block title="Hành động & thông báo">
          <Row k="Chế độ" v={<Chip>SIMULATED</Chip>} />
          <Row k="Lệnh gần nhất" v={state?.action_ledger.length ? state.action_ledger.slice(0, 4).map((a) => `${a.tool}: ${a.status} (rev ${a.revision})`).join(' · ') : 'không có lệnh'} />
          <Row k="Sổ lệnh" v={state?.action_ledger.length ? `${state.action_ledger.length} lệnh, mỗi lệnh một khoá (không lặp)` : '—'} />
          <Row k="Mở khoá" v={state?.unlock_request ? `${state.unlock_request.status}, chờ người xác nhận` : 'không có'} />
          <Row k="Thông báo" v={`${notes.length} · push: ${notes[0]?.channels.push.state ?? '—'} · in-app: ${notes[0]?.channels.in_app_feed.state ?? '—'}`} />
          <Row k="Gửi → điện thoại nhận" v={deliveryLatency == null ? '—' : `${deliveryLatency.toFixed(2)} s (phụ thuộc chu kỳ poll 1 s, không phải độ trễ suy luận)`} />
        </Block>
        <Block title="Đo thực tế">
          <Row k="Capture FPS" v={rate(metrics.capTimes).toFixed(2)} /><Row k="Suy luận FPS" v={rate(metrics.accTimes).toFixed(2)} /><Row k="UI FPS" v={fps} />
          <Row k="Mã hoá JPEG (trình duyệt)" v={ms(metrics.lastEncodeMs)} /><Row k="Tuổi khung lúc gửi" v={ms(metrics.lastCaptureAgeMs)} />
          <Row k="Kiểm tra ảnh (server)" v={ms(reply?.timings_ms.validate)} /><Row k="YOLO detector" v={ms(reply?.timings_ms.infer_detector)} />
          <Row k="Suy luận tổng (YOLO+tuổi)" v={ms(reply?.timings_ms.infer_total)} /><Row k="Commit CabinService" v={ms(reply?.timings_ms.commit)} />
          <Row k="Server tổng" v={ms(reply?.timings_ms.server_total)} /><Row k="Vòng HTTP (RTT)" v={ms(metrics.lastRttMs)} />
          <Row k="Từ nhận state đến vẽ UI" v={ms(commitMs)} />
          <Row k="Cỡ mẫu" v={`${metrics.accepted} khung nhận · ${metrics.dropped} bỏ · ${metrics.errors} lỗi · ${metrics.replayed} lặp`} />
          <Row k="Giới hạn" v={<span className="text-text-2">Đo trên trình duyệt này và máy chủ demo. Không phải số đo Pi hay SoC của hãng.</span>} />
        </Block>
        <Block title="Nhật ký gần nhất">
          {history.slice(-6).reverse().map((h) => <Row key={h.event_id} k={clock(h.at)} v={`${h.type}${h.rule_id ? ` · ${String(h.rule_id)}` : ''}${h.risk_level ? ` · ${String(h.risk_level)}` : ''}${h.action ? ` · ${String(h.action)} ${String(h.result)}` : ''}`} />)}
          {history.length === 0 && <Row k="—" v="chưa có sự kiện" />}
        </Block>
      </div>
    </div>
  )
}
