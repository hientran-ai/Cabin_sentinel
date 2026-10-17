// Trace charts: what the model reported frame by frame (counts, age label, confidence, latency, committed risk).
// Two sources, never mixed: this session's evidence log (backend demo model) and the offline run of the 14/10 bundle on the three sample clips.
// These are operating traces. They are not accuracy: there are no ground-truth labels behind either source.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEvidenceLog, type LogEntry } from '../../../../e2e/evidenceLog'
import { Fold } from './DemoPanels'

interface Frame { t: string; person: number | null; child: number | null; adult: number | null; unknown: number | null; pet: number | null; items: number | null; conf: number | null; lat: number | null; risk?: string; fault?: boolean; track?: number }
interface Series { key: string; label: string; color: string; pick: (f: Frame) => number | null }

const COLORS = { person: '#5db1ff', child: '#ffb24a', adult: '#58d16e', pet: '#4fcfae', unknown: '#8fa3bf', items: '#c79bff', lat: '#5db1ff', p95: '#ef5b63' }
const RISK_COLOR: Record<string, string> = { SAFE: '#58d16e', NOTICE: '#8fc7ff', WARNING: '#f4b33d', CRITICAL: '#ef5b63', ERROR: '#9aa7bd' }
const RISK_VI: Record<string, string> = { SAFE: 'Chưa thấy nguy cơ', NOTICE: 'Lưu ý', WARNING: 'Cảnh báo', CRITICAL: 'Nguy hiểm', ERROR: 'Không xác minh được' }
const COUNT_SERIES: Series[] = [
  { key: 'person', label: 'Người (chưa rõ tuổi)', color: COLORS.person, pick: (f) => f.person },
  { key: 'child', label: 'Nhãn trẻ em', color: COLORS.child, pick: (f) => f.child },
  { key: 'adult', label: 'Nhãn người lớn', color: COLORS.adult, pick: (f) => f.adult },
  { key: 'pet', label: 'Chó · mèo', color: COLORS.pet, pick: (f) => f.pet },
]

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null); const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.floor(el.clientWidth))))
    ro.observe(el); setW(Math.max(280, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const PAD = { l: 40, r: 12, t: 10, b: 20 }
function ChartFrame({ title, sub, w, h, n, hover, setHover, children }: { title: string; sub?: string; w: number; h: number; n: number; hover: number | null; setHover: (i: number | null) => void; children: React.ReactNode }) {
  const iw = w - PAD.l - PAD.r
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left - PAD.l
    setHover(n ? Math.max(0, Math.min(n - 1, Math.round((x / iw) * (n - 1)))) : null)
  }
  return (
    <figure className="vt-chart"><figcaption><b>{title}</b>{sub && <span>{sub}</span>}</figcaption>
      <svg width={w} height={h} role="img" aria-label={title} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {children}
        {hover != null && n > 0 && <line x1={PAD.l + (n > 1 ? (hover / (n - 1)) * iw : 0)} x2={PAD.l + (n > 1 ? (hover / (n - 1)) * iw : 0)} y1={PAD.t} y2={h - PAD.b} stroke="rgba(255,255,255,.45)" strokeDasharray="3 3" />}
      </svg></figure>
  )
}

function Axis({ w, h, max, ticks, unit = '' }: { w: number; h: number; max: number; ticks: number[]; unit?: string }) {
  const ih = h - PAD.t - PAD.b
  return <>{ticks.map((t) => { const y = PAD.t + ih - (t / max) * ih; return <g key={t}><line x1={PAD.l} x2={w - PAD.r} y1={y} y2={y} stroke="rgba(180,210,255,.14)" /><text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize="12" fill="#819ABD">{t}{unit}</text></g> })}</>
}

function Lines({ frames, series, w, h, max, step }: { frames: Frame[]; series: Series[]; w: number; h: number; max: number; step?: boolean }) {
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b, n = frames.length
  const X = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * iw : 0), Y = (v: number) => PAD.t + ih - (Math.min(v, max) / max) * ih
  return <>{series.map((s) => {
    let d = '', pen = false
    frames.forEach((f, i) => { const v = s.pick(f); if (v == null) { pen = false; return } d += `${pen ? (step ? `H${X(i)}V${Y(v)}` : `L${X(i)} ${Y(v)}`) : `M${X(i)} ${Y(v)}`}`; pen = true })
    return d ? <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" /> : null
  })}</>
}

function Strip({ frames, w, h, color, label }: { frames: Frame[]; w: number; h: number; color: (f: Frame) => string; label: string }) {
  const iw = w - PAD.l - PAD.r, n = Math.max(1, frames.length), cw = iw / n
  return <><text x={PAD.l - 6} y={h / 2 + 4} textAnchor="end" fontSize="12" fill="#819ABD">{label}</text>
    {frames.map((f, i) => <rect key={i} x={PAD.l + i * cw} y={PAD.t} width={Math.max(1, cw + .4)} height={h - PAD.t - PAD.b} fill={color(f)} />)}</>
}

const ageColor = (f: Frame) => f.fault ? '#3a4660' : f.child == null ? '#26334d' : f.child > 0 ? COLORS.child : f.adult ? COLORS.adult : f.person ? COLORS.unknown : '#142446'
const flips = (frames: Frame[]) => { let n = 0, last = ''; for (const f of frames) { const k = f.child ? 'c' : f.adult ? 'a' : f.person ? 'u' : ''; if (k && last && k !== last) n++; if (k) last = k } return n }
const p95 = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(.95 * s.length) - 1)] ?? null }

function fromLog(entries: LogEntry[]): Frame[] {
  return entries.filter((e) => e.kind === 'frame').map((e) => {
    const fault = !!e.camera_status && /BLOCKED|DISCONNECTED/.test(e.camera_status)
    const ok = e.accepted !== false && !fault, ageOk = e.age_classifier === 'ok'
    const c = (k: string) => e.dets.filter((d) => d.c === k).length
    const age = (g: string) => e.dets.filter((d) => d.c === 'person' && d.age === g).length
    const people = c('person')
    return { t: e.at.slice(11, 19), fault, risk: e.risk, person: ok ? people : null, child: ok && ageOk ? age('child') : null, adult: ok && ageOk ? age('adult') : null,
      unknown: ok ? (ageOk ? people - age('child') - age('adult') : people) : null, pet: ok ? c('dog') + c('cat') : null, items: null, conf: ok && e.dets.length ? Math.max(...e.dets.map((d) => d.p)) : null, lat: ok ? e.infer_ms : null }
  })
}

interface Offline { meta: { note: string; bundle: string; runtime: string; detector: string }; clips: { id: string; label: string; fps: number; frames: number[][] }[] }
function fromClip(c: Offline['clips'][number]): Frame[] {
  return c.frames.map(([t, child, adult, person, pet, items, conf, lat, track]) => ({ t: `${(t ?? 0).toFixed(1)} s`, child: child ?? 0, adult: adult ?? 0, unknown: person ?? 0, person: (child ?? 0) + (adult ?? 0) + (person ?? 0), pet: pet ?? 0, items: items ?? 0, conf: conf ? conf : null, lat: lat ?? null, track: track ?? 0 }))
}

function Charts({ frames, note, live }: { frames: Frame[]; note: string; live: boolean }) {
  const [ref, w] = useWidth(); const [hover, setHover] = useState<number | null>(null)
  const n = frames.length
  const lat = frames.map((f) => f.lat).filter((x): x is number => x != null), latMax = Math.max(100, Math.ceil(Math.max(0, ...lat) / 100) * 100)
  const peak = Math.max(2, ...frames.map((f) => Math.max(f.person ?? 0, f.pet ?? 0, f.child ?? 0, f.adult ?? 0)))
  const hv = hover != null ? frames[hover] : null
  const ageAny = frames.some((f) => f.child != null)
  const mean = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null, p = p95(lat)
  if (!n) return <p className="vd-note">Chưa có khung nào. Chạy một kịch bản hoặc bật camera, biểu đồ sẽ vẽ ngay.</p>
  return (
    <div ref={ref} className="vt-charts" data-testid="trace-charts">
      <p className="vt-hover" aria-live="off">{hv ? `${hv.t} · người ${hv.person ?? '—'} · trẻ em ${hv.child ?? 'chưa bật'} · người lớn ${hv.adult ?? 'chưa bật'} · chó/mèo ${hv.pet ?? '—'} · tin cậy ${hv.conf != null ? hv.conf.toFixed(2) : '—'} · ${hv.lat != null ? `${hv.lat.toFixed(0)} ms` : '—'}${hv.risk ? ` · ${RISK_VI[hv.risk] ?? hv.risk}` : ''}` : `${n} khung. Rê chuột lên biểu đồ để xem từng khung.`}</p>
      <ChartFrame title="Số đối tượng trong mỗi khung" sub="đường bậc thang; đường bị ngắt = không có dữ liệu" w={w} h={150} n={n} hover={hover} setHover={setHover}>
        <Axis w={w} h={150} max={peak} ticks={Array.from({ length: peak + 1 }, (_, i) => i).filter((i) => peak <= 4 || i % 2 === 0)} />
        <Lines frames={frames} series={COUNT_SERIES} w={w} h={150} max={peak} step />
      </ChartFrame>
      <ul className="vt-legend">{COUNT_SERIES.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.label}{(s.key === 'child' || s.key === 'adult') && !ageAny ? ' (chưa bật)' : ''}</li>)}</ul>
      <ChartFrame title="Nhãn tuổi theo từng khung" sub={ageAny ? `nhãn đổi ${flips(frames)} lần` : 'bộ phân loại tuổi chưa bật: không có nhãn'} w={w} h={44} n={n} hover={hover} setHover={setHover}>
        <Strip frames={frames} w={w} h={44} color={ageColor} label="tuổi" />
      </ChartFrame>
      <ul className="vt-legend"><li><i style={{ background: COLORS.child }} />trẻ em</li><li><i style={{ background: COLORS.adult }} />người lớn</li><li><i style={{ background: COLORS.unknown }} />có người, tuổi chưa rõ</li><li><i style={{ background: '#142446' }} />không có ai</li><li><i style={{ background: '#26334d' }} />không có nhãn tuổi</li>{live && <li><i style={{ background: '#3a4660' }} />camera lỗi</li>}</ul>
      <ChartFrame title="Độ tin cậy cao nhất mỗi khung" sub="đường nét đứt: ngưỡng 0,25 · không phải xác suất đúng" w={w} h={110} n={n} hover={hover} setHover={setHover}>
        <Axis w={w} h={110} max={1} ticks={[0, .5, 1]} />
        <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + (110 - PAD.t - PAD.b) * .75} y2={PAD.t + (110 - PAD.t - PAD.b) * .75} stroke="#f4b33d" strokeDasharray="4 4" />
        <Lines frames={frames} series={[{ key: 'conf', label: 'tin cậy', color: COLORS.person, pick: (f) => f.conf }]} w={w} h={110} max={1} />
      </ChartFrame>
      <ChartFrame title="Thời gian suy luận mỗi khung" sub={`trung bình ${mean != null ? mean.toFixed(0) : '—'} ms · P95 ${p != null ? p.toFixed(0) : '—'} ms · ${live ? 'máy chủ demo' : 'CPU, ngoài web'}`} w={w} h={130} n={n} hover={hover} setHover={setHover}>
        <Axis w={w} h={130} max={latMax} ticks={[0, latMax / 2, latMax].map(Math.round)} unit="" />
        {p != null && <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + (130 - PAD.t - PAD.b) * (1 - p / latMax)} y2={PAD.t + (130 - PAD.t - PAD.b) * (1 - p / latMax)} stroke={COLORS.p95} strokeDasharray="4 4" />}
        <Lines frames={frames} series={[{ key: 'lat', label: 'ms', color: COLORS.lat, pick: (f) => f.lat }]} w={w} h={130} max={latMax} />
      </ChartFrame>
      {live && <>
        <ChartFrame title="Mức rủi ro đã lưu tại mỗi khung" sub="do máy chủ quyết định, không do giao diện" w={w} h={44} n={n} hover={hover} setHover={setHover}>
          <Strip frames={frames} w={w} h={44} color={(f) => RISK_COLOR[f.risk ?? 'ERROR'] ?? '#9aa7bd'} label="rủi ro" />
        </ChartFrame>
        <ul className="vt-legend">{Object.entries(RISK_COLOR).map(([k, c]) => <li key={k}><i style={{ background: c }} />{RISK_VI[k]}</li>)}</ul></>}
      <p className="vd-note">{note}</p>
    </div>
  )
}

export function TracePanel() {
  const entries = useEvidenceLog((s) => s.entries)
  const [tab, setTab] = useState<'live' | 'offline'>('live'); const [clip, setClip] = useState(0)
  const [off, setOff] = useState<Offline | null>(null); const [err, setErr] = useState(false)
  useEffect(() => { if (tab === 'offline' && !off && !err) fetch(`${import.meta.env.BASE_URL}vinfast/evidence/offline-bundle-20261014.json`).then((r) => r.json()).then(setOff).catch(() => setErr(true)) }, [tab, off, err])
  const live = useMemo(() => fromLog(entries), [entries])
  const cur = off?.clips[clip]
  const offFrames = useMemo(() => (cur ? fromClip(cur) : []), [cur])
  const model = [...new Set(entries.map((e) => e.model_file).filter(Boolean))].join(', ') || 'chưa có'
  return (
    <Fold id="trace" title="Biểu đồ theo dõi" summary={`${live.length} khung phiên này · model ${model} · thêm bản chạy offline của model mới`}>
      <div className="vt-tabs" role="tablist" aria-label="Nguồn dữ liệu biểu đồ">
        <button type="button" role="tab" aria-selected={tab === 'live'} className="vd-chipbtn vd-press" onClick={() => setTab('live')}>Phiên này (model backend demo)</button>
        <button type="button" role="tab" aria-selected={tab === 'offline'} className="vd-chipbtn vd-press" onClick={() => setTab('offline')}>Model mới 14/10 (chạy offline, 3 clip)</button>
        {tab === 'offline' && off && <span className="vt-clips" role="group" aria-label="Chọn clip">{off.clips.map((c, i) => <button key={c.id} type="button" aria-pressed={clip === i} className={`vd-chipbtn vd-press ${clip === i ? 'on' : ''}`} onClick={() => setClip(i)}>{c.label}</button>)}</span>}
      </div>
      {tab === 'live' && <Charts live frames={live} note="Mỗi điểm là một khung backend đã nhận từ phiên này (cùng dữ liệu với nhật ký bằng chứng). Không có ảnh. Biểu đồ cho thấy model đã báo gì, không chứng minh độ chính xác." />}
      {tab === 'offline' && (err ? <p className="vd-err">Không tải được dữ liệu chạy offline.</p> : !off ? <p className="vd-note">Đang tải…</p> :
        <Charts live={false} frames={offFrames} note={`${off.meta.note} Bundle ${off.meta.bundle} (${off.meta.detector}), ${off.meta.runtime}. Chưa nối vào backend demo. Clip "Trẻ ghế sau quay lưng": model không thấy người nào, đây là lỗi bỏ sót đã biết (SR-01).`} />)}
    </Fold>
  )
}
