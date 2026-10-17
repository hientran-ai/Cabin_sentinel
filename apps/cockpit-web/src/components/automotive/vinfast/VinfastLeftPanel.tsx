// Persistent left vehicle panel (skin blue). Three zones on a grid: telemetry, vehicle top view with component labels, quick controls.
// Every value comes from the simulated vehicle store; nothing here is a real ECU reading.
import { useEffect, useState, type ReactNode } from 'react'
import { useUi } from '../../../store/uiStore'
import { useView } from '../../../e2e/hooks'
import { useVehicle } from '../../../store/vehicleStore'
import { notify } from '../../../store/notificationStore'
import { formatSpeed } from '../../../lib/vehicleSimulation'
import type { DoorId } from '../../../types/vehicle'
import { buildTelemetry } from './vehicleProfile'
import { partState, PART_TEXT, useCarUi, type PartState } from './carUi'
import { GBattery, GBulb, GCabinEye, GCarMode, GFan, GHazard, GLock, GCarTop, GSeat } from './glyphs'

const DRIVE = { chill: 'TIẾT KIỆM', standard: 'TIÊU CHUẨN', sport: 'THỂ THAO' } as const
const NEXT = { chill: 'standard', standard: 'sport', sport: 'chill' } as const

/** Driving-mode indicator: one SVG path, symmetric about x = 260, so the dip is exact. */
export function DriveModeLine({ mode }: { mode: keyof typeof DRIVE }) {
  return (
    <svg className={`vf-dm-line ${mode}`} viewBox="0 0 520 44" aria-hidden>
      <path d="M8 12H214C232 12 243 17 251 27C255 32 257.5 34 260 34C262.5 34 265 32 269 27C277 17 288 12 306 12H512" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const LABELS: { key: 'fl' | 'rl' | 'fr' | 'rr' | 'frunk' | 'trunk' | 'port'; text: string; full: string; side: 'l' | 'r' | 't' | 'b'; y: number }[] = [
  { key: 'fl', text: 'Cửa trước trái', full: 'Cửa trước trái', side: 'l', y: 31 }, { key: 'rl', text: 'Cửa sau trái', full: 'Cửa sau trái', side: 'l', y: 52 },
  { key: 'port', text: 'Cổng sạc', full: 'Cổng sạc', side: 'l', y: 73 }, { key: 'fr', text: 'Cửa trước phải', full: 'Cửa trước phải', side: 'r', y: 31 },
  { key: 'rr', text: 'Cửa sau phải', full: 'Cửa sau phải', side: 'r', y: 52 }, { key: 'frunk', text: 'Cốp trước', full: 'Cốp trước', side: 't', y: 0 }, { key: 'trunk', text: 'Cốp sau', full: 'Cốp sau', side: 'b', y: 100 },
]

function PartLabel({ l, state, onClick }: { l: typeof LABELS[number]; state: PartState; onClick: () => void }) {
  return (
    <button type="button" className={`vf-part vf-press ${l.side} s-${state}`} style={l.side === 'l' || l.side === 'r' ? { top: `${l.y}%` } : undefined} onClick={onClick}
      aria-label={`${l.full}: ${PART_TEXT[state]} (mô phỏng)`} data-state={state}>
      <i aria-hidden /><span><b>{l.text}</b>{state !== 'closed' && <small>{PART_TEXT[state]}</small>}</span>
    </button>
  )
}

export function VinfastVehicleView() {
  const v = useVehicle()
  const door = (d: DoorId) => v.doors?.[d]
  const items: Record<typeof LABELS[number]['key'], [boolean | undefined, () => void]> = {
    fl: [door('frontLeft'), () => v.toggleDoor('frontLeft')], rl: [door('rearLeft'), () => v.toggleDoor('rearLeft')],
    fr: [door('frontRight'), () => v.toggleDoor('frontRight')], rr: [door('rearRight'), () => v.toggleDoor('rearRight')],
    frunk: [v.frontTrunkOpen, v.toggleFrunk], trunk: [v.rearTrunkOpen, v.toggleTrunk], port: [v.chargingPortOpen, v.toggleChargePort],
  }
  return (
    <div className="vf-stage" data-testid="vf-car">
      <img className="vf-cartop" src={`${import.meta.env.BASE_URL}vinfast/car-top-mirrors.png`} alt="Xe nhìn từ trên xuống (ảnh tham chiếu Aurora, đã tách nền)" draggable={false} />
      {LABELS.map((l) => <PartLabel key={l.key} l={l} state={partState(items[l.key][0])} onClick={items[l.key][1]} />)}
    </div>
  )
}

type QcState = 'default' | 'selected' | 'active' | 'warn'
function Qc({ label, icon, state, tone, onClick, badge, aria, iconOnly }: { label: string; icon: ReactNode; state: QcState; tone?: 'cool' | 'heat' | 'light'; onClick: () => void; badge?: string; aria: string; iconOnly?: boolean }) {
  return (
    <button type="button" className={`vf-qt vf-press s-${state} ${tone ? `t-${tone}` : ''} ${iconOnly ? 'io' : ''}`} onClick={onClick} aria-label={aria} aria-pressed={state === 'selected' || state === 'active' || state === 'warn'}>
      <span className="ic">{icon}{badge && <sup>{badge}</sup>}</span>{!iconOnly && <span className="lb">{label}</span>}
    </button>
  )
}

const SEAT_LEVELS: [number, string][] = [[0, 'Tắt'], [1, 'Thấp'], [2, 'Vừa'], [3, 'Cao']]

/** Lower-left controls, as on the real display. Row 1: main shortcuts. Row 2: the three vehicle modes (baby, camping, pet) + CAR MODE.
 *  The Tắt / Thấp / Vừa / Cao bar is NOT always visible: it opens over the vehicle only after the heated-seat button is pressed.
 *  States: default / selected (screen open or bar open) / active (feature on, semantic colour) / warn. Lock and hazard never actuate the vehicle. */
export function VinfastQuickControls() {
  const ui = useUi(), v = useVehicle(), [seatOpen, setSeatOpen] = useState(false)
  const seat = v.climate.seatHeatDriver, climateOn = v.climate.enabled
  useEffect(() => {
    if (!seatOpen) return
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.vf-seatpop, [data-seat-btn]')) setSeatOpen(false) }
    const t = setTimeout(() => setSeatOpen(false), 6000)
    addEventListener('pointerdown', close)
    return () => { clearTimeout(t); removeEventListener('pointerdown', close) }
  }, [seatOpen, seat])
  return (
    <div className="vf-qc" data-testid="vf-bottom-left">
      {seatOpen && (
        <div className="vf-seatpop" role="radiogroup" aria-label="Mức sưởi ghế lái (mô phỏng)">
          {SEAT_LEVELS.map(([n, l]) => <button key={n} type="button" role="radio" aria-checked={seat === n} className="vf-press" onClick={() => { v.setClimate({ seatHeatDriver: n }); setSeatOpen(false) }}>{l}</button>)}
          <span className="cap">Mức sưởi ghế lái · mô phỏng</span>
        </div>)}
      <div className="vf-row1">
        <Qc label="Tổng quan" aria="Tổng quan xe" icon={<GCarTop size={32} />} state={ui.overlay === 'vehicle' ? 'selected' : 'default'} onClick={() => ui.toggleOverlay('vehicle')} />
        <Qc label="Khoá cửa" aria="Khoá cửa (mô phỏng, không điều khiển xe thật)" icon={<GLock size={32} />} state="default" onClick={() => notify({ key: 'vf-lock', level: 'info', title: 'Khoá xe · MÔ PHỎNG', body: 'Thay đổi đầu vào ở bảng mô phỏng. Xác nhận sự cố vẫn ở điện thoại chủ xe.' })} />
        <Qc label="Điều hòa" aria={`Điều hòa${climateOn ? ' đang bật' : ' đang tắt'}`} icon={<GFan size={32} />} state={ui.overlay === 'climate' ? 'selected' : climateOn ? 'active' : 'default'} tone="cool" onClick={() => ui.toggleOverlay('climate')} />
        <span data-seat-btn style={{ display: 'contents' }}><Qc label="Sưởi ghế" aria={`Ghế sưởi bên lái, mức ${seat}. Bấm để chọn mức`} icon={<GSeat size={32} />} badge={seat ? String(seat) : undefined} state={seatOpen ? 'selected' : seat ? 'active' : 'default'} tone="heat" onClick={() => setSeatOpen((o) => !o)} /></span>
        <Qc label="CabinSentinel" aria="Thiết lập CabinSentinel" icon={<GCabinEye size={32} />} state={ui.overlay === 'cabinset' ? 'selected' : 'default'} onClick={() => ui.toggleOverlay('cabinset')} />
        <button type="button" className={`vf-qt vf-qt-primary vf-press ${ui.overlay === 'carmode' ? 'is-open' : ''}`} aria-label="Car Mode: cắm trại, bé, thú cưng, rửa xe" aria-pressed={ui.overlay === 'carmode'} onClick={() => ui.toggleOverlay('carmode')}>
          <span className="ic"><GCarMode size={32} /></span><span className="lb">CAR MODE</span></button>
      </div>
    </div>
  )
}

/** One-line alert slot: cabin warning/critical first, then seatbelt, else a quiet "no warning" line (never a claim that the cabin is safe). */
function Banner() {
  const ui = useUi(), view = useView(), belt = useVehicle((s) => s.driverSeatbelt)
  const alarm = view.tone === 'critical' || view.tone === 'warning'
  if (alarm) return <button type="button" className={`vf-banner ${view.tone}`} role="alert" data-testid="vf-prompt" onClick={() => ui.setOverlay('cabin')}><GHazard size={24} /><span><b>Cabin: {view.headline}</b><small>{view.reason}</small></span></button>
  if (!belt) return <div className="vf-banner warning" role="status" data-testid="vf-prompt"><GHazard size={24} /><span><b>Chú ý thắt dây an toàn</b></span></div>
  // never "no warning" while the cabin cannot be verified: unknown is not safe
  const verified = view.kind === 'current'
  return <div className={`vf-banner ${verified ? 'quiet' : 'warning'}`} role="status" data-testid="vf-prompt"><GBulb size={24} /><span><b>{verified ? view.headline : 'Chưa thể xác minh cabin'}</b><small>{verified ? (view.caution ?? view.reason) : view.kind === 'waiting' ? 'Chưa nhận khung hình nào' : view.kind === 'last-known' ? 'Mất kết nối, đang hiện dữ liệu cũ' : 'Dữ liệu không còn hiện tại hoặc camera lỗi'}</small></span></div>
}

export function VinfastLeftPanel() {
  const v = useVehicle(), ui = useUi(), hazard = useCarUi((s) => s.hazard)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const t = buildTelemetry(v), mode = v.accelerationMode
  return (
    <section className="vf-lp" aria-label="Thông tin xe" data-testid="vf-ipc">
      <header className="vf-za">
        <span className="vf-tm-time">{now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="chips">
          {v.parkingBrake && <span className="vf-pill warn">Phanh tay</span>}
          {v.headlights !== 'off' && <span className="vf-pill ok">Đèn {v.headlights === 'auto' ? 'tự động' : 'bật'}</span>}
          {hazard && <span className="vf-pill warn blink">Khẩn cấp</span>}
          {v.parkingBrake && <span className="vf-pill">Giữ phanh</span>}
        </span>
        <span className="vf-airbag-s" data-testid="vf-airbag"><b>Túi khí</b><span>Chưa có dữ liệu</span></span>
      </header>
      <div className="vf-zb">
        <button type="button" className={`vf-dm vf-press ${mode}`} aria-label={`Chế độ lái ${DRIVE[mode]}. Chạm để đổi`} onClick={() => v.set({ accelerationMode: NEXT[mode] })}>
          <span>{DRIVE[mode]}</span><DriveModeLine mode={mode} />
        </button>
        <div className="row">
          <div className="batt" aria-label={`Pin ${t.batterySocPercent}%, còn ${t.estimatedRangeKm} km`}>
            <GBattery size={44} pct={t.batterySocPercent} /><b className="vf-tnum">{t.batterySocPercent}<small>%</small></b><span className="vf-tnum">{t.estimatedRangeKm} km</span>
          </div>
          <div className="spd">
            <span className="vf-speed vf-tnum" data-testid="vf-speed">{formatSpeed(v.speed, ui.units)}</span>
            <span className="unit">{ui.units === 'metric' ? 'km/h' : 'mph'}</span>
            <span className={`ready ${v.parkingBrake ? '' : 'on'}`}>{v.parkingBrake ? 'ĐỖ' : 'SẴN SÀNG'}</span>
          </div>
          <div className="gear" role="img" aria-label={`Số ${v.gear}`}>{(['P', 'R', 'N', 'D'] as const).map((g) => <b key={g} className={g === v.gear ? 'on' : ''}>{g}</b>)}</div>
        </div>
      </div>
      <div className="vf-zl">
        <Banner />
        <div className="vf-zc"><VinfastVehicleView /></div>
        <VinfastQuickControls />
      </div>
    </section>
  )
}
