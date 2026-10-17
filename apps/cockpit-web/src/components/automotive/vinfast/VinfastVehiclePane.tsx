import { AppImg } from './VinfastHomeWidgets'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { formatSpeed } from '../../../lib/vehicleSimulation'
import type { DoorId } from '../../../types/vehicle'
import { VfIcon } from './parts'
import { useMode } from './useVinfast'

const GEARS = ['P', 'R', 'N', 'D'] as const
const DRIVE_LABEL = { chill: 'Êm', standard: 'Chuẩn', sport: 'Thể thao' } as const
const STEER_LABEL = { comfort: 'Nhẹ', standard: 'Chuẩn', sport: 'Nặng' } as const
const next = <T extends string>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length]!

/** Speed, gear and telltales from the simulated vehicle. Nothing here comes from a real ECU. */
export function VinfastIpc() {
  const v = useVehicle(), units = useUi((s) => s.units)
  return (
    <section className="vf-ipc" aria-label="Bảng đồng hồ" data-testid="vf-ipc">
      <div className="speed"><span className="vf-speed" data-testid="vf-speed">{formatSpeed(v.speed, units)}</span><span className="unit">{units === 'metric' ? 'KM/H' : 'MPH'}</span></div>
      <div className="vf-gears" role="img" aria-label={`Số ${v.gear}`}>{GEARS.map((g) => <span key={g} className={g === v.gear ? 'on' : ''}>{g}</span>)}</div>
      <div className="vf-tells">
        <span className="vf-tell">{v.parkingBrake ? 'Phanh tay' : 'Sẵn sàng'}</span>
        <span className={`vf-tell ${v.driverSeatbelt ? '' : 'warn'}`}>{v.driverSeatbelt ? 'Dây an toàn' : 'Chưa thắt dây'}</span>
      </div>
    </section>
  )
}

export function VinfastRail() {
  const ui = useUi(), v = useVehicle()
  return (
    <nav className="vf-rail" aria-label="Điều khiển nhanh" data-testid="vf-rail">
      <button type="button" className="vf-press" onClick={() => ui.set({ brightness: ui.brightness > 80 ? 80 : ui.brightness > 60 ? 60 : 100 })} aria-label={`Độ sáng ${ui.brightness}%`}><VfIcon n="sun" h={42} />{ui.brightness}%</button>
      <button type="button" className="vf-press" onClick={() => v.set({ accelerationMode: next(['chill', 'standard', 'sport'] as const, v.accelerationMode) })} aria-label={`Chế độ lái ${DRIVE_LABEL[v.accelerationMode]}`}><VfIcon n="wiper" h={34} />{DRIVE_LABEL[v.accelerationMode]}</button>
      <button type="button" className="vf-press" onClick={() => v.set({ steeringMode: next(['comfort', 'standard', 'sport'] as const, v.steeringMode) })} aria-label={`Vô lăng ${STEER_LABEL[v.steeringMode]}`}><AppImg id="driveAids" size={44} />Lái {STEER_LABEL[v.steeringMode]}</button>
      <button type="button" className="vf-press" aria-pressed={ui.overlay === 'camera'} onClick={() => ui.toggleOverlay('camera')} aria-label="Camera"><AppImg id="camera" size={44} />Camera</button>
    </nav>
  )
}

const DOORS: { id: DoorId; label: string; x: number; y: number }[] = [
  { id: 'frontLeft', label: 'Cửa lái', x: -220, y: 120 }, { id: 'rearLeft', label: 'Cửa sau T', x: -220, y: 214 },
  { id: 'frontRight', label: 'Cửa phụ', x: 124, y: 120 }, { id: 'rearRight', label: 'Cửa sau P', x: 124, y: 214 },
]

/** Top view cropped from Aurora A13 (public/vinfast/car-top.png, the reference raster as-is). Door, boot and port tags follow the simulated state. */
export function VinfastCar() {
  const v = useVehicle(), mode = useMode()
  const open = (d: DoorId) => v.doors[d]
  return (
    <div className="vf-carbuddy" data-testid="vf-car">
      <span className="vf-glow" aria-hidden /><img src={`${import.meta.env.BASE_URL}vinfast/car-top.png`} alt="Xe nhìn từ trên xuống (ảnh tham chiếu Aurora)" draggable={false}
        style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, height: 415, width: 'auto', filter: mode === 'dark' ? 'brightness(.52) saturate(1.15)' : undefined,
          WebkitMaskImage: 'radial-gradient(ellipse 62% 56% at 50% 50%, #000 62%, transparent 100%)', maskImage: 'radial-gradient(ellipse 62% 56% at 50% 50%, #000 62%, transparent 100%)' }} />
      {DOORS.map((d) => (
        <button key={d.id} type="button" className="vf-car-tag vf-press" style={{ left: `calc(50% + ${d.x}px)`, top: d.y, width: 96 }} aria-pressed={open(d.id)} aria-label={`${d.label}: ${open(d.id) ? 'đang mở' : 'đóng'} (mô phỏng)`}
          onClick={() => v.toggleDoor(d.id)}>{d.label}<br />{open(d.id) ? 'Mở' : 'Đóng'}</button>
      ))}
      <button type="button" className="vf-car-tag vf-press" style={{ left: 'calc(50% + 74px)', top: 8, width: 96 }} aria-pressed={v.frontTrunkOpen} aria-label={`Cốp trước: ${v.frontTrunkOpen ? 'đang mở' : 'đóng'} (mô phỏng)`} onClick={v.toggleFrunk}>Cốp trước<br />{v.frontTrunkOpen ? 'Mở' : 'Đóng'}</button>
      <button type="button" className="vf-car-tag vf-press" style={{ left: 'calc(50% + 74px)', top: 340, width: 96 }} aria-pressed={v.rearTrunkOpen} aria-label={`Cốp sau: ${v.rearTrunkOpen ? 'đang mở' : 'đóng'} (mô phỏng)`} onClick={v.toggleTrunk}>Cốp sau<br />{v.rearTrunkOpen ? 'Mở' : 'Đóng'}</button>
      <button type="button" className="vf-car-tag vf-press" style={{ left: 'calc(50% - 220px)', top: 330, width: 96 }} aria-pressed={v.chargingPortOpen} aria-label={`Cổng sạc: ${v.chargingPortOpen ? 'đang mở' : 'đóng'} (mô phỏng)`} onClick={v.toggleChargePort}>Cổng sạc<br />{v.chargingPortOpen ? 'Mở' : 'Đóng'}</button>
    </div>
  )
}
