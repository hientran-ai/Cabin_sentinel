import { Power, Repeat2, Snowflake } from 'lucide-react'
import { motion, useDragControls } from 'motion/react'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useE2e } from '../../../e2e/store'
import { formatTemp } from '../../../lib/vehicleSimulation'
import { swipeDismiss } from './gesture'
import { IC, Seg, SimChip, VfIcon } from './parts'
import type { Airflow } from '../../../types/vehicle'

const TEMP_UNIT = (u: 'metric' | 'imperial') => (u === 'metric' ? '°C' : '°F')

function SetTemp({ who }: { who: 'driver' | 'passenger' }) {
  const v = useVehicle(), units = useUi((s) => s.units), c = v.climate
  const t = who === 'driver' ? c.driverTemperature : c.passengerTemperature
  const name = who === 'driver' ? 'bên lái' : 'bên phụ'
  return (
    <div className="vf-settemp">
      <button type="button" className="vf-press" aria-label={`Giảm nhiệt độ đặt ${name}`} onClick={() => v.stepTemp(who, -.5)}><VfIcon n={who === 'driver' ? 'down-l' : 'down-r'} h={28} /></button>
      <span className="val vf-temp" data-testid={`vf-set-${who}`} aria-label={`Nhiệt độ đặt ${name} ${formatTemp(t, units)} ${TEMP_UNIT(units)}`}>{formatTemp(t, units)}<sup>{TEMP_UNIT(units)}</sup></span>
      <button type="button" className="vf-press" aria-label={`Tăng nhiệt độ đặt ${name}`} onClick={() => v.stepTemp(who, .5)}><VfIcon n={who === 'driver' ? 'up-l' : 'up-r'} h={28} /></button>
    </div>
  )
}

/** Climate bar 1632 x 112 plus quick-control and library slots. All values are the simulated vehicle's SET points. */
export function VinfastBottomBar() {
  const v = useVehicle(), ui = useUi(), c = v.climate
  const sheet = ui.overlay === 'climate'
  return (
    <footer className="vf-bottom" data-testid="vf-bottom">
      <button type="button" className="vf-q vf-press" aria-label="Cài đặt xe" onClick={() => ui.toggleOverlay('vehicle')}><VfIcon n="door" h={58} /></button>
      <div className="vf-climate-bar" role="group" aria-label="Điều hòa">
        <button type="button" className="vf-cb vf-press" aria-label={`Ghế sưởi bên lái mức ${c.seatHeatDriver}`} onClick={() => v.cycleSeatHeat('driver')}><VfIcon n="seat-l" h={46} />{c.seatHeatDriver}</button>
        <SetTemp who="driver" />
        <button type="button" className="vf-cb vf-press" aria-pressed={c.frontDefrost} aria-label="Sấy kính trước" onClick={() => v.setClimate({ frontDefrost: !c.frontDefrost })}><VfIcon n="defrost-f" h={42} /></button>
        <button type="button" className="vf-cb vf-press" aria-pressed={sheet} aria-label="Mở điều hòa" data-testid="vf-open-climate" onClick={() => ui.toggleOverlay('climate')}><VfIcon n="fan" h={44} />{c.enabled ? c.fanSpeed : 'Tắt'}</button>
        <button type="button" className="vf-cb vf-press" aria-pressed={c.rearDefrost} aria-label="Sấy kính sau" onClick={() => v.setClimate({ rearDefrost: !c.rearDefrost })}><VfIcon n="defrost-r" h={42} /></button>
        <SetTemp who="passenger" />
        <button type="button" className="vf-cb vf-press" aria-label={`Ghế sưởi bên phụ mức ${c.seatHeatPassenger}`} onClick={() => v.cycleSeatHeat('passenger')}><VfIcon n="seat-r" h={46} />{c.seatHeatPassenger}</button>
      </div>
      <button type="button" className="vf-lib vf-press" aria-label="Thư viện ứng dụng" aria-pressed={ui.overlay === 'library'} onClick={() => ui.toggleOverlay('library')}><VfIcon n="grid" h={46} /></button>
    </footer>
  )
}

const AIR: [Airflow, string][] = [['face', 'Mặt'], ['faceFeet', 'Mặt + chân'], ['feet', 'Chân'], ['windshield', 'Kính']]

export function VinfastClimateSheet() {
  const v = useVehicle(), ui = useUi(), c = v.climate
  const e2eTemp = useE2e((s) => s.state?.sensor_snapshot?.temperature)
  const measured = typeof e2eTemp === 'number' ? e2eTemp : v.cabinTemperature
  const drag = useDragControls()
  const close = () => ui.setOverlay(null)
  return (
    <motion.section role="region" aria-label="Điều hòa" className="vf-sheet vf-glass vf-solid" data-testid="vf-climate"
      initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0, transition: { duration: .28, ease: [.2, .8, .2, 1] } }} exit={{ opacity: 0, y: 36, transition: { duration: .2, ease: [.4, 0, 1, 1] } }}
      drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .6 }} dragSnapToOrigin
      onDragEnd={(_, i) => { if (swipeDismiss(i.offset.y, i.velocity.y)) close() }}>
      <button type="button" className="vf-handle" aria-label="Kéo xuống để đóng điều hòa" style={{ touchAction: 'none' }} onPointerDown={(e) => drag.start(e)} onClick={close}><i /></button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 40px 14px' }}>
        <h2 className="vf-title" style={{ flex: 1 }}>Điều hòa</h2>
        <span className="vf-cap" data-testid="vf-cabin-temp">Nhiệt độ <b>đặt</b> là điểm đặt của điều hòa. Trong xe đo được: {measured.toFixed(1)}°C</span><SimChip />
        <button type="button" className={`vf-btn vf-press ${c.enabled ? 'is-on' : ''}`} aria-pressed={c.enabled} onClick={() => v.setClimate({ enabled: !c.enabled })}><Power {...IC} />{c.enabled ? 'Bật' : 'Tắt'}</button>
      </div>
      <div className="grid">
        <div className="vf-zone"><div className="vf-cap" style={{ marginBottom: 8 }}>Bên lái · đặt</div>
          <div className="vf-bigtemp"><button type="button" className="vf-press" aria-label="Giảm nhiệt độ lái" onClick={() => v.stepTemp('driver', -.5)}><VfIcon n="down-l" h={34} /></button>{formatTemp(c.driverTemperature, ui.units)}°<button type="button" className="vf-press" aria-label="Tăng nhiệt độ lái" onClick={() => v.stepTemp('driver', .5)}><VfIcon n="up-l" h={34} /></button></div>
          <div className="vf-toggles" style={{ marginTop: 14, justifyContent: 'center' }}><button type="button" className="vf-btn vf-press" aria-label="Ghế sưởi bên lái" onClick={() => v.cycleSeatHeat('driver')}><VfIcon n="seat-l" h={46} />Ghế {c.seatHeatDriver}</button></div></div>
        <div className="vf-zone"><div className="vf-cap" style={{ marginBottom: 8 }}>Quạt · chế độ</div>
          <div className="vf-toggles">
            <button type="button" className="vf-btn vf-press" aria-pressed={c.autoMode && c.enabled} onClick={() => v.setClimate({ autoMode: !c.autoMode, enabled: true })}>Auto</button>
            <button type="button" className="vf-btn vf-press" aria-pressed={c.ac} onClick={() => v.setClimate({ ac: !c.ac })}><Snowflake {...IC} />A/C</button>
            <button type="button" className="vf-btn vf-press" aria-pressed={c.sync} onClick={() => v.setClimate({ sync: !c.sync })}>Sync</button>
            <button type="button" className="vf-btn vf-press" aria-pressed={c.recirculation} onClick={() => v.setClimate({ recirculation: !c.recirculation })}><Repeat2 {...IC} />Trong xe</button>
          </div>
          <div className="vf-fanlevels" style={{ marginTop: 16 }} role="group" aria-label={`Quạt mức ${c.fanSpeed}`}>
            {Array.from({ length: 10 }, (_, i) => <button key={i} type="button" className={i < c.fanSpeed ? 'on' : ''} style={{ height: 14 + i * 4, width: 28, minHeight: 0 }} aria-label={`Quạt mức ${i + 1}`} onClick={() => v.setClimate({ fanSpeed: i + 1, autoMode: false, enabled: true })} />)}
          </div></div>
        <div className="vf-zone"><div className="vf-cap" style={{ marginBottom: 8 }}>Bên phụ · đặt</div>
          <div className="vf-bigtemp"><button type="button" className="vf-press" aria-label="Giảm nhiệt độ phụ" onClick={() => v.stepTemp('passenger', -.5)}><VfIcon n="down-l" h={34} /></button>{formatTemp(c.passengerTemperature, ui.units)}°<button type="button" className="vf-press" aria-label="Tăng nhiệt độ phụ" onClick={() => v.stepTemp('passenger', .5)}><VfIcon n="up-l" h={34} /></button></div>
          <div className="vf-toggles" style={{ marginTop: 14, justifyContent: 'center' }}><button type="button" className="vf-btn vf-press" aria-label="Ghế sưởi bên phụ" onClick={() => v.cycleSeatHeat('passenger')}><VfIcon n="seat-r" h={46} />Ghế {c.seatHeatPassenger}</button></div></div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Seg value={c.airflow} options={AIR} onChange={(airflow) => v.setClimate({ airflow, autoMode: false })} label="Hướng gió" />
          <button type="button" className="vf-btn vf-press" aria-pressed={c.frontDefrost} onClick={() => v.setClimate({ frontDefrost: !c.frontDefrost })}><VfIcon n="defrost-f" h={36} />Kính trước</button>
          <button type="button" className="vf-btn vf-press" aria-pressed={c.rearDefrost} onClick={() => v.setClimate({ rearDefrost: !c.rearDefrost })}><VfIcon n="defrost-r" h={36} />Kính sau</button>
          <span className="vf-note" style={{ flex: 1 }}>Điều hòa chỉ là tiện nghi mô phỏng. Bật điều hòa không đóng sự cố cabin và không đổi mức rủi ro.</span>
        </div>
      </div>
    </motion.section>
  )
}
