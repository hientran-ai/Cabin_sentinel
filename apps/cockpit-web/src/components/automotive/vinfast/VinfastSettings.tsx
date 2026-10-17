// Settings, cloned screen by screen from the Aurora "Settings" clip (vimeo 820383806: Light, Display/Wallpaper, TPMS)
// and the in-car Status page (user photo). The right-hand pictures are the source frames; every control on top of them is live
// and wired to a real store, or says plainly that it is not integrated. Nothing here reports a vehicle success.
import { useState, type PointerEvent as RPE, type ReactNode } from 'react'
import { SteeringWheel } from '../icons'
import { Backpack, Car, Info, ScanEye, UserRound, Volume2, Zap } from 'lucide-react'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useMedia } from '../../../store/mediaStore'
import { useE2e } from '../../../e2e/store'
import { notify } from '../../../store/notificationStore'
import { buildTelemetry, fieldText, PROV_LABEL, VF8_PROFILE } from './vehicleProfile'
import { GAdas, GBaby, GBattery, GCarTop, GDefrostFront, GMuteWarn, GPaw, GSun, GTrunk, GWindow, GWiperInfo } from './glyphs'
import { IC, Panel, Row, Seg, SimChip, Switch, Todo } from './parts'
import { api } from '../../../e2e/api'
import { trackingCaps, type TrackKey, type TrackStatus } from '../../../e2e/cabinCounts'
import { useFrameCounts, useMode, useVinfast, WALLPAPERS } from './useVinfast'

const B = import.meta.env.BASE_URL
const CATS = [
  { id: 'status', label: 'Trạng thái', icon: <GBattery size={40} pct={70} /> },
  { id: 'cabin', label: 'Giám sát cabin', icon: <ScanEye {...IC} /> },
  { id: 'display', label: 'Màn hình', icon: <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M9 20h6M12 16.5V20" /></svg> },
  { id: 'light', label: 'Ánh sáng', icon: <GSun size={38} /> },
  { id: 'drive', label: 'Hỗ trợ lái', icon: <SteeringWheel width={36} height={36} /> },
  { id: 'tpms', label: 'Áp suất lốp', icon: <GCarTop size={38} /> },
  { id: 'vehicle', label: 'Xe', icon: <Car {...IC} /> },
  { id: 'sound', label: 'Âm thanh', icon: <Volume2 {...IC} /> },
  { id: 'charge', label: 'Sạc', icon: <Zap {...IC} /> },
  { id: 'about', label: 'Hệ thống', icon: <Info {...IC} /> },
] as const
type Cat = typeof CATS[number]['id']

function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div className="vf-tabs" role="tablist">{tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{l}</button>)}</div>
}

/** Hue from a point on the colour wheel, measured clockwise from the left edge (red), like the source wheel. */
export function hueAt(dx: number, dy: number): number {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI           // 0 = right, clockwise in screen space
  return Math.round(((deg + 180) % 360 + 360) % 360)
}

function Status() {
  const v = useVehicle(), state = useE2e((s) => s.state)
  const cabin = state?.sensor_snapshot?.temperature
  const t = buildTelemetry(v, typeof cabin === 'number' ? cabin : null), P = VF8_PROFILE
  const Prov = ({ k }: { k: keyof typeof P.provenance }) => <span className="vf-prov">{PROV_LABEL[P.provenance[k]!]}</span>
  return (
    <div data-testid="vf-status-ill">
      <div className="vf-hero">
        <figure><img src={`${B}vinfast/vehicle/vf8-front-3q.webp`} alt="VinFast VF 8 (ảnh tham chiếu, tách nền)" draggable={false} /></figure>
        <div className="vf-metrics">
          <div className="vf-metric"><b>{t.batterySocPercent}<small>%</small></b><span>Pin</span></div>
          <div className="vf-metric"><b>{t.estimatedRangeKm}<small> km</small></b><span>Quãng đường dự kiến</span></div>
          <div className="vf-metric"><b>{t.outsideTemperatureC?.toFixed(0)}<small>°C</small></b><span>Ngoài trời</span></div>
          <div className="vf-metric"><b>{t.cabinTemperatureC?.toFixed(1)}<small>°C</small></b><span>Trong xe</span></div>
        </div>
      </div>
      <dl className="vf-profile" data-testid="vf-profile">
        <div><dt>Hãng</dt><dd>{P.manufacturer}<Prov k="manufacturer" /></dd></div>
        <div><dt>Mẫu xe</dt><dd>{P.model}<Prov k="model" /></dd></div>
        <div><dt>Phiên bản · năm</dt><dd>{P.trim == null && P.modelYear == null ? 'Chưa xác minh' : `${fieldText(P.trim)} · ${fieldText(P.modelYear)}`}<Prov k="trim" /></dd></div>
        <div><dt>Dung lượng pin</dt><dd>{fieldText(P.batteryCapacityKWh, 'kWh')}<Prov k="batteryCapacityKWh" /></dd></div>
        <div><dt>Quãng đường định mức</dt><dd>{fieldText(P.ratedRangeKm, 'km')}<Prov k="ratedRangeKm" /></dd></div>
        <div><dt>Công suất · mô-men</dt><dd>{P.maxPowerKW == null && P.torqueNm == null ? 'Chưa xác minh' : `${fieldText(P.maxPowerKW, 'kW')} · ${fieldText(P.torqueNm, 'Nm')}`}<Prov k="maxPowerKW" /></dd></div>
      </dl>
      <p className="vf-note">Số liệu động đến từ xe giả lập. Thông số chính hãng chưa được đối chiếu nên để trống, không điền số ước đoán.</p>
    </div>
  )
}

function LightWheel() {
  const vf = useVinfast()
  const pick = (e: RPE<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    if (Math.hypot(dx, dy) < r.width * .12) return
    vf.setAmbientHue(hueAt(dx, dy))
  }
  const a = ((vf.ambientHue - 180) * Math.PI) / 180, col = `hsl(${vf.ambientHue} 95% 60%)`
  return (
    <div className="vf-amb">
      <div className="vf-amb-view">
        <img src={`${B}vinfast/vehicle/cockpit-front-960.webp`} srcSet={`${B}vinfast/vehicle/cockpit-front-960.webp 960w, ${B}vinfast/vehicle/cockpit-front.webp 2000w`} sizes="640px" alt="Khoang lái minh hoạ đèn viền (ảnh tham chiếu, chưa xác minh model)" draggable={false} />
        <span className="vf-amb-glow" style={{ background: `radial-gradient(ellipse 60% 25% at 50% 60%, ${col}, transparent 70%)` }} aria-hidden />
        <span className="vf-amb-strip" style={{ background: `linear-gradient(90deg, transparent, ${col}, transparent)` }} aria-hidden />
      </div>
      <div className="vf-wheel" role="slider" aria-label="Màu đèn viền nội thất" aria-valuemin={0} aria-valuemax={360} aria-valuenow={vf.ambientHue} tabIndex={0}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e) }} onPointerMove={(e) => { if (e.buttons) pick(e) }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') vf.setAmbientHue((vf.ambientHue + 10) % 360); if (e.key === 'ArrowLeft') vf.setAmbientHue((vf.ambientHue + 350) % 360) }}>
        <span className="knob" style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%`, background: col }} />
      </div>
    </div>
  )
}

const TRACK_META: Record<TrackKey, { title: string; icon: ReactNode }> = {
  child: { title: 'Trẻ em', icon: <GBaby size={34} /> }, person: { title: 'Người', icon: <UserRound {...IC} /> },
  pet: { title: 'Thú cưng', icon: <GPaw size={34} /> }, items: { title: 'Đồ vật bỏ quên', icon: <Backpack {...IC} /> },
}
const TRACK_TEXT: Record<TrackStatus, string> = { READY: 'Sẵn sàng', OFF: 'Chưa bật', ERROR: 'Lỗi', NOT_SUPPORTED: 'Chưa hỗ trợ', UNKNOWN: 'Chưa rõ' }

/** CabinSentinel settings. Four tracked classes with what the server REALLY reports, live count from the latest accepted frame and a display switch.
 *  Thresholds, freshness limits and alert rules stay locked: they belong to the safety requirements, not to the car screen. */
function CabinBody() {
  const care = useE2e((s) => s.state?.care), run = useE2e((s) => s.care), service = useE2e((s) => s.service), model = useE2e((s) => s.state?.model ?? s.service?.model), ttl = useE2e((s) => s.state?.ttl_s ?? s.service?.ttl_s)
  const setOverlay = useUi((s) => s.setOverlay), show = useVinfast((s) => s.show), setShow = useVinfast((s) => s.setShow), counts = useFrameCounts()
  const caps = trackingCaps(model)
  const value: Record<TrackKey, number | null> = { child: counts.child, person: counts.person, pet: counts.pet, items: counts.items }
  const auto = care?.auto_consent ?? false
  return (
    <div data-testid="vf-cabinset">
      <h3 className="vf-sec">Đối tượng theo dõi</h3>
      <div className="vf-track" role="list">
        {caps.map((c) => {
          const m = TRACK_META[c.key], ok = c.status === 'READY'
          return (
            <div key={c.key} role="listitem" className={`vf-tcard s-${c.status.toLowerCase()}`} data-testid={`track-${c.key}`}>
              <div className="top"><span className="ic" aria-hidden>{m.icon}</span><div className="nm"><b>{m.title}</b><span className="st"><i aria-hidden />{TRACK_TEXT[c.status]}</span></div>
                <span className="num vf-tnum" aria-label={`${m.title} trong khung gần nhất`}>{ok && value[c.key] != null ? value[c.key] : '—'}</span></div>
              <p className="why">{c.reason}</p>
              <div className="sw"><span>Hiện trên thẻ chính</span><Switch checked={show[c.key]} disabled={!ok} label={`Hiện ${m.title} trên thẻ chính`} onChange={(on) => setShow(c.key, on)} /></div>
            </div>)
        })}
      </div>
      <p className="vf-note" style={{ marginTop: 8 }}>Số đếm là số trong một khung hình gần nhất đã được chấp nhận, không cộng qua nhiều khung. Dữ liệu cũ hoặc mất kết nối hiện “—”, không hiện 0. Người không có nghĩa là trẻ em.</p>

      <h3 className="vf-sec">Chăm sóc cabin</h3>
      <Row title="Tự bật chế độ chăm sóc khi có cảnh báo" sub={care ? 'Sự đồng ý của chủ xe. Chế độ chăm sóc chỉ là tiện nghi giả lập, không đóng sự cố và không đổi mức rủi ro.' : 'Chưa có phiên với máy chủ'}>
        <Switch checked={auto} disabled={!care} label="Tự bật chế độ chăm sóc khi có cảnh báo" onChange={(on) => { void run((s) => api.careConsent(s, on, 'COCKPIT'), on ? 'Đã cho phép tự bật chế độ chăm sóc.' : 'Đã tắt tự bật chế độ chăm sóc.') }} /></Row>
      <Row title="Xem chi tiết và bằng chứng"><button type="button" className="vf-btn vf-press" onClick={() => setOverlay('cabin')}>Mở giám sát cabin</button></Row>

      <h3 className="vf-sec">Quy tắc an toàn</h3>
      <Row title="Ngưỡng nhận diện, luật cảnh báo, leo thang" sub={`Do yêu cầu an toàn quy định, không chỉnh ở màn hình xe.${model?.confidence_threshold != null ? ` Ngưỡng hiện tại ${(model.confidence_threshold * 100).toFixed(0)}%.` : ''}`}><Todo>Đã khoá</Todo></Row>
      <Row title="Thời hạn dữ liệu" sub={ttl ? `Cảm biến ${ttl.sensor} giây · hình ảnh ${ttl.vision} giây` : 'Chưa có thông tin'}><Todo>Chỉ đọc</Todo></Row>
      <Row title="Làm mờ ảnh cabin" sub="Luôn bật: ảnh gốc không rời thiết bị, ảnh hiển thị trên xe luôn được làm mờ."><Todo>Cố định</Todo></Row>
      <Row title="Mở khoá cửa từ cảnh báo" sub="Chỉ qua yêu cầu có người xác nhận trên điện thoại chủ xe."><Todo>Không có trên xe</Todo></Row>
      <Row title="Model" sub={service?.model?.file ? service.model.file : 'Chưa nạp'}><Todo>Chỉ đọc</Todo></Row>
    </div>
  )
}

const CLIPS = [
  { id: 'summon', title: 'Triệu hồi xe', note: 'Video minh hoạ chức năng. Demo không điều khiển xe.' },
  { id: 'autopark', title: 'Tự đỗ xe', note: 'Video minh hoạ chức năng. Demo không điều khiển xe.' },
] as const

function Clip({ id, title, note, big }: { id: string; title: string; note: string; big?: boolean }) {
  return (
    <figure className={`vf-clip ${big ? 'big' : ''}`}>
      <video src={`${B}vinfast/clips/${id}.mp4`} poster={`${B}vinfast/clips/${id}-poster.jpg`} autoPlay muted loop playsInline preload="metadata" aria-label={`${title}, video minh hoạ`} />
      <figcaption><b>{title}</b><span>{note}</span></figcaption>
    </figure>
  )
}

/** Settings. Rows backed by a real store are wired to it; rows that need a real vehicle say so and never report success. */
export function VinfastSettings({ initial = 'status' }: { initial?: Cat } = {}) {
  const [cat, setCat] = useState<Cat>(initial)
  const [sub, setSub] = useState('')
  const [clip, setClip] = useState(0)
  const ui = useUi(), v = useVehicle(), media = useMedia(), vf = useVinfast(), mode = useMode()
  const title = CATS.find((c) => c.id === cat)!.label
  const todo = (name: string) => notify({ key: 'vf-todo', level: 'info', title: `${name} · chưa tích hợp`, body: 'Không có lệnh nào được gửi tới xe.' })
  let body: ReactNode = null
  if (cat === 'status') body = <Status />
  if (cat === 'display') {
    const tab = sub || 'wall'
    body = <><Tabs tabs={[['wall', 'Hình nền'], ['screen', 'Hiển thị']]} value={tab} onChange={setSub} />
      <div className="vf-tabpane" key={tab}>{tab === 'wall'
        ? <div className="vf-walls" role="radiogroup" aria-label="Hình nền">{WALLPAPERS.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={vf.wallpaper === w.id} className="vf-press" onClick={() => vf.setWallpaper(w.id)}>
              <img src={`${B}vinfast/${w.thumb}`} alt="" draggable={false} style={w.id === 'leaf' ? { background: 'linear-gradient(180deg,#0245D9,#0836B9)', objectFit: 'contain' } : undefined} /><span>{w.label}</span></button>))}
            <button type="button" className="vf-press vf-usb" onClick={() => todo('Ảnh từ USB')}><span>＋</span><span>Ảnh từ USB</span></button></div>
        : <>
          <Row title="Giao diện" sub={ui.appearance === 'auto' ? `Tự động theo giờ máy · đang ${mode === 'light' ? 'sáng' : 'tối'}` : undefined}>
            <Seg value={ui.appearance} options={[['light', 'Sáng'], ['dark', 'Tối'], ['auto', 'Tự động']]} onChange={(appearance) => ui.set({ appearance })} label="Giao diện" /></Row>
          <Row title="Độ sáng màn hình" sub={`${ui.brightness}% (làm tối giao diện, không điều khiển đèn nền thật)`}>
            <input type="range" className="vf-slider" min={40} max={100} step={5} value={ui.brightness} aria-label="Độ sáng màn hình" onChange={(e) => ui.set({ brightness: +e.target.value })} /></Row>
          <Row title="Đơn vị"><Seg value={ui.units} options={[['metric', 'km/h · °C'], ['imperial', 'mph · °F']]} onChange={(units) => ui.set({ units })} label="Đơn vị" /></Row>
          <Row title="Màn hình HUD" sub="Xe demo không có HUD"><Todo /></Row></>}</div></>
  }
  if (cat === 'light') {
    const tab = sub || 'int'
    body = <><Tabs tabs={[['int', 'Nội thất'], ['ext', 'Bên ngoài']]} value={tab} onChange={setSub} />
      <div className="vf-tabpane" key={tab}>{tab === 'int' ? <LightWheel />
        : <><Row title="Đèn pha"><Seg value={v.headlights} options={[['auto', 'Tự động'], ['on', 'Bật'], ['off', 'Tắt']]} onChange={v.setHeadlights} label="Đèn pha" /><SimChip /></Row>
          <Row title="Đèn sương mù trước / sau"><Todo /></Row></>}</div></>
  }
  if (cat === 'drive') body = (
    <div className="vf-clips">
      <Clip {...CLIPS[clip]!} big />
      <div className="vf-clip-list" role="tablist">{CLIPS.map((c, i) => (
        <button key={c.id} type="button" role="tab" aria-selected={clip === i} className="vf-press" onClick={() => setClip(i)}>
          <img src={`${B}vinfast/clips/${c.id}-poster.jpg`} alt="" draggable={false} /><span>{c.title}</span></button>))}</div>
    </div>)
  if (cat === 'tpms') body = (
    <div className="vf-tpms">
      <img src={`${B}vinfast/ill/tpms-car.jpg`} alt="Xe nhìn từ trên, minh hoạ vị trí lốp (ảnh tham chiếu)" draggable={false} />
      {(['Trước trái', 'Trước phải', 'Sau trái', 'Sau phải'] as const).map((l, i) => <div key={l} className={`tire t${i}`}><b>— psi</b><span>{l}</span></div>)}
      <p className="vf-note">Xe demo không có cảm biến áp suất lốp. Không hiển thị số liệu giả.</p>
      <button type="button" className="vf-btn vf-press" onClick={() => todo('Hiệu chuẩn áp suất lốp')}>Hiệu chuẩn</button>
    </div>)
  if (cat === 'vehicle') {
    const windowsOpen = Object.values(v.windows).some((w) => w !== 'closed')
    const Tile = ({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: ReactNode }) =>
      <button type="button" className={`vf-qtile vf-press ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{children}<span>{label}</span></button>
    body = <>
      <div className="vf-qgrid">
        <Tile label="ADAS" onClick={() => todo('ADAS')}><GAdas size={46} /></Tile>
        <Tile label="Tắt cảnh báo" onClick={() => todo('Tắt cảnh báo')}><GMuteWarn size={46} /></Tile>
        <Tile label="Cốp sau" on={v.rearTrunkOpen} onClick={v.toggleTrunk}><GTrunk size={46} /></Tile>
        <Tile label="Gạt mưa" onClick={() => todo('Gạt mưa')}><GWiperInfo size={46} /></Tile>
        <Tile label="Cửa sổ" on={windowsOpen} onClick={() => v.setAllWindows(windowsOpen ? 'closed' : 'vent')}><GWindow size={46} /></Tile>
        <Tile label="Sấy kính" on={v.climate.frontDefrost} onClick={() => v.setClimate({ frontDefrost: !v.climate.frontDefrost })}><GDefrostFront size={46} /></Tile>
      </div>
      <Row title="Khoá an toàn trẻ em" sub="Mô phỏng. Không điều khiển xe thật"><Switch checked={v.childLock} onChange={(childLock) => v.set({ childLock })} label="Khoá an toàn trẻ em" /></Row>
      <Row title="Chế độ lái"><Seg value={v.accelerationMode} options={[['chill', 'Tiết kiệm'], ['standard', 'Tiêu chuẩn'], ['sport', 'Thể thao']]} onChange={(accelerationMode) => v.set({ accelerationMode })} label="Chế độ lái" /><SimChip /></Row>
      <Row title="Mức tái tạo năng lượng"><Seg value={v.regenLevel} options={[['low', 'Thấp'], ['standard', 'Chuẩn'], ['high', 'Cao']]} onChange={(regenLevel) => v.set({ regenLevel })} label="Tái tạo năng lượng" /></Row>
      <Row title="Mở khoá / cửa từ xa" sub="Không có trong demo. Mở khoá chỉ qua luồng xác nhận của CabinSentinel"><Todo>Không hỗ trợ</Todo></Row></>
  }
  if (cat === 'sound') body = <>
    <Row title="Âm lượng" sub="Mô phỏng: không phát âm thanh ra loa"><input type="range" className="vf-slider" min={0} max={10} value={media.muted ? 0 : media.volume} aria-label="Âm lượng" onChange={(e) => media.setVolume(+e.target.value)} /><span className="vf-body" style={{ width: 40 }}>{media.muted ? 0 : media.volume}</span></Row>
    <Row title="Tắt tiếng"><Switch checked={media.muted} onChange={media.toggleMute} label="Tắt tiếng" /></Row>
    <Row title="Âm sắc, equalizer, vùng nghe"><Todo /></Row></>
  if (cat === 'charge') body = <>
    <Row title="Giới hạn sạc" sub={`${v.chargeLimit}% (mô phỏng)`}><input type="range" className="vf-slider" min={50} max={100} step={5} value={v.chargeLimit} aria-label="Giới hạn sạc" onChange={(e) => v.setChargeLimit(+e.target.value)} /></Row>
    <Row title="Cổng sạc" sub={v.chargingPortOpen ? 'Đang mở' : 'Đang đóng'}><Switch checked={v.chargingPortOpen} onChange={v.toggleChargePort} label="Cổng sạc" /><SimChip /></Row>
    <Row title="Trạm sạc trên bản đồ" sub="Địa điểm demo, không phải trạm sạc còn chỗ thực"><Todo>Chỉ minh hoạ</Todo></Row></>
  if (cat === 'about') body = <>
    <Row title="Giao diện" sub="VinFast HMI × CabinSentinel, bản demo tích hợp. Không phải màn hình hay phần mềm chính hãng." />
    <Row title="Chế độ chạy" sub="Giả lập: dữ liệu xe và lệnh xe là mô phỏng. Hình ảnh cabin được model thật ở máy chủ phân tích." />
    <Row title="Nguồn thiết kế" sub="Aurora Vietnam (VF 8/VF 9, 2023), ảnh màn hình thật do người dùng cung cấp, khung hình video của Aurora." />
    <Row title="Xe và hãng" sub="Chưa kết nối ECU, camera, radar hay ứng dụng VinFast thật. Hình ảnh xe là ảnh tham chiếu, chưa xác minh bản quyền." /></>
  if (cat === 'cabin') body = <CabinBody />
  return (
    <Panel title={title} label="Cài đặt">
      <div className="body" data-testid="vf-settings">
        <nav className="vf-side" aria-label="Nhóm cài đặt">{CATS.map(({ id, label, icon }) => <button key={id} type="button" className="vf-press" aria-label={label} title={label} aria-current={cat === id} onClick={() => { setCat(id); setSub('') }}>{icon}<span>{label}</span></button>)}</nav>
        <div className="vf-content" key={cat}><div className="vf-tabpane">{body}</div></div>
      </div>
    </Panel>
  )
}
