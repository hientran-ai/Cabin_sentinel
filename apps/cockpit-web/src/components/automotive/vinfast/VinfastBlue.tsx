// Chrome of the "blue" skin, positioned from the measured photo of the real display (1920 x 1080 rectified, +-10 px).
import { useEffect, useState } from 'react'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useE2e } from '../../../e2e/store'
import { BRANDS, formatSpeed, formatTemp, rangeKm } from '../../../lib/vehicleSimulation'
import { AppImg } from './VinfastHomeWidgets'
import { UserRound } from 'lucide-react'
import { api } from '../../../e2e/api'
import { GTent } from './glyphs'
import { useCarUi } from './carUi'
import { useVinfast } from './useVinfast'
import { GCarTop, GChevron, GDefrostFront, GDefrostRear, GFan, GGrid, GHome, GSeat, GSun, GBattery } from './glyphs'

const DRIVE = { chill: 'ECO', standard: 'NORMAL', sport: 'SPORT' } as const
const NEXT = { chill: 'standard', standard: 'sport', sport: 'chill' } as const

export function BlueWallpaper() {
  const wp = useVinfast((s) => s.wallpaper)
  const B = import.meta.env.BASE_URL
  return (
    <div className="vf-wall" data-wall={wp} aria-hidden>
      {wp === 'leaf' && <img className="vf-leaf" src={`${B}vinfast/leaf-top.png`} alt="" draggable={false} />}
      {(wp === 'aurora' || wp === 'snow') && <img className="vf-band" src={`${B}vinfast/wall/${wp}-band.jpg`} alt="" draggable={false} />}
      {wp.startsWith('wall-') && <img className="vf-wallimg" src={`${B}vinfast/wall/${wp}.jpg`} alt="" draggable={false} />}
      <div className="vf-leftpane" />
    </div>
  )
}

/** Left pane x 0-608: status row, drive-mode line, range, speed, gear, camera button, bottom shortcuts. All values from the simulated vehicle. */
export function BlueLeft() {
  const v = useVehicle(), ui = useUi()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const km = Math.round(rangeKm(BRANDS.vinfast, v.batteryLevel, v.climate.enabled))
  return (
    <section className="vf-bl" aria-label="Bảng đồng hồ" data-testid="vf-ipc">
      <div className="vf-bl-airbag" data-testid="vf-airbag">TÚI KHÍ<br /><span>chưa có dữ liệu</span></div>
      <span className="vf-bl-time">{now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="vf-bl-bat"><GBattery pct={v.batteryLevel} size={46} /></span><span className="vf-bl-odo">{Math.round(v.batteryLevel)}% · {km} km</span>
      <span className="vf-bl-head">{v.headlights === 'auto' ? 'AUTO' : v.headlights === 'on' ? 'ĐÈN' : ''}</span>
      <button type="button" className="vf-bl-mode vf-press" aria-label={`Chế độ lái ${DRIVE[v.accelerationMode]}. Đổi chế độ`} onClick={() => v.set({ accelerationMode: NEXT[v.accelerationMode] })}>{DRIVE[v.accelerationMode]}</button>
      <svg className="vf-bl-line" viewBox="0 0 470 40" aria-hidden><path d="M2 8H215q15 0 25 12 8 11 20 11 12 0 20-11 10-12 25-12H468" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></svg>
      <span className="vf-bl-hold">{v.parkingBrake ? 'PARK' : ''}</span>
      <span className={`vf-bl-ready ${v.parkingBrake ? '' : 'on'}`}>READY</span>
      <span className="vf-bl-range">{km}<small> km</small><br />{Math.round(v.batteryLevel)}<small>%</small></span>
      <span className="vf-speed vf-bl-speed" data-testid="vf-speed">{formatSpeed(v.speed, ui.units)}</span>
      <span className="vf-bl-unit">{ui.units === 'metric' ? 'km/h' : 'mph'}</span>
      <span className="vf-bl-prnd" role="img" aria-label={`Số ${v.gear}`}>{(['P', 'R', 'N', 'D'] as const).map((g) => <b key={g} className={g === v.gear ? 'on' : ''}>{g}</b>)}</span>
      <button type="button" className="vf-bl-cam vf-press" aria-label="Camera" aria-pressed={ui.overlay === 'camera'} onClick={() => ui.toggleOverlay('camera')}><AppImg id="camera" size={64} /></button>
      <div className="vf-bl-bottom" role="group" aria-label="Điều khiển nhanh">
        <button type="button" className="vf-press" aria-label="Cài đặt xe" onClick={() => ui.toggleOverlay('vehicle')}><GCarTop size={52} /></button>
        <button type="button" className="vf-press" aria-label={`Ghế sưởi bên lái mức ${v.climate.seatHeatDriver}`} onClick={() => v.cycleSeatHeat('driver')}><GSeat size={50} style={{ color: v.climate.seatHeatDriver ? '#ff5a3c' : undefined }} />{v.climate.seatHeatDriver}</button>
        <button type="button" className="vf-press" aria-label={`Độ sáng ${ui.brightness}%`} onClick={() => ui.set({ brightness: ui.brightness > 80 ? 80 : ui.brightness > 60 ? 60 : 100 })}><GSun size={50} /></button>
        <button type="button" className="vf-press vf-bl-carmode" aria-label="Giám sát cabin" onClick={() => ui.toggleOverlay('cabin')}>CAR<br />MODE</button>
      </div>
    </section>
  )
}

/** Right pane header: V mark, mode chip, owner avatar. */
export function BlueTop() {
  const connected = useE2e((s) => s.connection) === 'ok'
  return (
    <div className="vf-bt" data-testid="vf-status">
      <span className="vf-bt-logo vf-brand" role="img" aria-label="VinFast"><span className="vmark"><img src={`${import.meta.env.BASE_URL}vinfast/brand/vinfast-symbol-light.svg`} alt="" height={92} width={92} draggable={false} /></span><ModeWidget /></span>
      <span className="vf-bt-right">
        {!connected && <span className="vf-cap" role="status" style={{ color: 'var(--warning)' }}>Mất kết nối máy chủ</span>}
        <span className="vf-bt-owner" aria-label="Chủ xe"><UserRound aria-hidden />Chủ xe</span>
      </span>
    </div>
  )
}

const Temp = ({ who }: { who: 'driver' | 'passenger' }) => {
  const v = useVehicle(), units = useUi((s) => s.units), c = v.climate
  const t = who === 'driver' ? c.driverTemperature : c.passengerTemperature, nm = who === 'driver' ? 'bên lái' : 'bên phụ'
  return (
    <span className="vf-bb-temp">
      <button type="button" className="vf-press" aria-label={`Giảm nhiệt độ đặt ${nm}`} onClick={() => v.stepTemp(who, -.5)}><GChevron dir="left" size={40} /></button>
      <span data-testid={`vf-set-${who}`} aria-label={`Nhiệt độ đặt ${nm} ${formatTemp(t, units)}`}><b className="vf-temp">{formatTemp(t, units)}°{units === 'metric' ? 'C' : 'F'}</b><small>{c.enabled && c.ac ? 'A/C ON' : 'A/C OFF'} · đặt</small></span>
      <button type="button" className="vf-press" aria-label={`Tăng nhiệt độ đặt ${nm}`} onClick={() => v.stepTemp(who, .5)}><GChevron dir="right" size={40} /></button>
    </span>
  )
}

/** Right bottom bar y 985-1070: home, apps, set temperature, fan, defrost. Temperatures are SET points, not measurements. */
export function BlueBottom() {
  const v = useVehicle(), ui = useUi(), c = v.climate
  return (
    <footer className="vf-bb" data-testid="vf-bottom">
      <button type="button" className="vf-press" aria-label="Trang chủ" onClick={() => ui.setOverlay(null)}><GHome size={48} /></button>
      <button type="button" className="vf-press" aria-label="Thư viện ứng dụng" aria-pressed={ui.overlay === 'library'} onClick={() => ui.toggleOverlay('library')}><GGrid size={46} /></button>
      <Temp who="driver" />
      <button type="button" className="vf-press" aria-label="Mở điều hòa" aria-pressed={ui.overlay === 'climate'} data-testid="vf-open-climate" onClick={() => ui.toggleOverlay('climate')}><GFan size={50} />{c.enabled ? c.fanSpeed : ''}</button>
      <Temp who="passenger" />
      <button type="button" className="vf-press" aria-label="Sấy kính trước" aria-pressed={c.frontDefrost} onClick={() => v.setClimate({ frontDefrost: !c.frontDefrost })}><GDefrostFront size={50} /></button>
      <button type="button" className="vf-press" aria-label="Sấy kính sau" aria-pressed={c.rearDefrost} onClick={() => v.setClimate({ rearDefrost: !c.rearDefrost })}><GDefrostRear size={50} /></button>
    </footer>
  )
}

/** Function widget next to the V mark. Shows the vehicle mode that is running and is its own button: with camping on it stops camping (backend Cabin Care,
 *  simulated command); otherwise it opens the Vehicle Modes screen. It never resolves or hides a cabin incident. */
function ModeWidget() {
  const care = useE2e((s) => s.state?.care), run = useE2e((s) => s.care), ui = useUi(), petOn = useCarUi((s) => s.petOn), washOn = useCarUi((s) => s.washOn)
  const cared = care?.status === 'ACTIVE' ? care.profile : null
  const careName = cared === 'ADULT' ? 'cắm trại' : cared === 'CHILD' ? 'bé' : cared === 'PET' ? 'thú cưng' : null
  const label = careName ? `Tắt chế độ ${careName}` : petOn ? 'Tắt chế độ thú cưng' : washOn ? 'Tắt chế độ rửa xe' : 'Chế độ xe'
  const act = () => { if (careName) void run((s) => api.careStop(s, 'COCKPIT'), `Đã tắt chế độ ${careName}.`); else if (petOn) useCarUi.getState().set({ petOn: false }); else if (washOn) useCarUi.getState().set({ washOn: false }); else ui.setOverlay('carmode') }
  const on = !!careName || petOn || washOn
  return <button type="button" className={`vf-modewidget vf-press ${on ? 'on' : ''}`} onClick={act} aria-label={`${label} (mô phỏng)`} data-testid="vf-modewidget"><GTent size={30} /><span>{label}</span></button>
}
