// Climate screen cloned from the in-car VF 8 climate page (user photo, rectified; layout in reference-crops) and the
// Aurora 3D-illustration style: cut-away car, round airflow buttons on the car, 0-6 fan arc, mode buttons left and right.
// Every control drives the SIMULATED vehicle store. Climate never resolves a cabin incident and never changes risk.
import { useRef, type PointerEvent as RPE, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useE2e } from '../../../e2e/store'
import { formatTemp } from '../../../lib/vehicleSimulation'
import type { Airflow } from '../../../types/vehicle'
import { GAirFace, GAirFeet, GAirScreen, GHand, GIon, GRecirc, GSnow, GThermo } from './glyphs'
import { Panel, SimChip } from './parts'
import { useVinfast } from './useVinfast'

export const FAN_MAX = 6
/** Fan arc position (0-6) from a pointer x on the arc, clamped. Pure so the boundary is testable. */
export function fanFromX(x: number, left: number, width: number): number {
  if (!(width > 0)) return 0
  return Math.max(0, Math.min(FAN_MAX, Math.round(((x - left) / width) * FAN_MAX)))
}
/** The store keeps 1-10; the arc shows 0-6. 0 means the blower is off. */
export const fanLevel = (enabled: boolean, speed: number) => (enabled ? Math.max(1, Math.min(FAN_MAX, speed)) : 0)

function ModeBtn({ label, on, onClick, children, sim }: { label: string; on?: boolean; onClick: () => void; children: ReactNode; sim?: boolean }) {
  return (
    <button type="button" className={`vf-cmode vf-press ${on ? 'on' : ''}`} aria-pressed={!!on} aria-label={`${label}${sim ? ' (mô phỏng)' : ''}`} onClick={onClick}>
      {children}<span>{label}</span>
    </button>
  )
}

const VENTS: { id: Airflow; x: number; y: number; label: string; G: typeof GAirFace }[] = [
  { id: 'windshield', x: 426, y: 151, label: 'Gió kính', G: GAirScreen },
  { id: 'face', x: 493, y: 180, label: 'Gió mặt', G: GAirFace },
  { id: 'feet', x: 511, y: 248, label: 'Gió chân', G: GAirFeet },
]
/** Air streams drawn over the car; they flow only while the blower runs and follow the selected outlets. */
const STREAMS: Record<'windshield' | 'face' | 'feet', string[]> = {
  windshield: ['M470 150C430 120 400 110 360 118', 'M470 160C440 140 410 132 372 140'],
  face: ['M520 182C600 160 690 160 790 178', 'M520 192C610 178 700 182 800 200', 'M520 172C600 148 680 140 770 150'],
  feet: ['M535 250C600 262 660 262 720 248', 'M535 260C610 280 680 282 750 268'],
}

export function VinfastClimatePanel() {
  const v = useVehicle(), ui = useUi(), c = v.climate
  const ion = useVinfast((s) => s.ion), setIon = useVinfast((s) => s.setIon)
  const e2eTemp = useE2e((s) => s.state?.sensor_snapshot?.temperature)
  const measured = typeof e2eTemp === 'number' ? e2eTemp : v.cabinTemperature
  const level = fanLevel(c.enabled, c.fanSpeed)
  const arc = useRef<SVGSVGElement>(null)
  const setLevel = (n: number) => v.setClimate(n === 0 ? { enabled: false } : { enabled: true, fanSpeed: n, autoMode: false })
  const fromPointer = (e: RPE<SVGSVGElement>) => {
    const r = arc.current!.getBoundingClientRect()
    // the arc's numbers span 60..580 of the 640-wide viewBox
    setLevel(fanFromX(e.clientX, r.left + r.width * (60 / 640), r.width * (520 / 640)))
  }
  const flows = !c.enabled ? [] : c.airflow === 'faceFeet' ? [...STREAMS.face, ...STREAMS.feet] : STREAMS[c.airflow]
  const ventOn = (id: Airflow) => c.airflow === id || (c.airflow === 'faceFeet' && (id === 'face' || id === 'feet'))
  return (
    <Panel title="Điều hòa" label="Điều hòa" className="vf-climate-panel" tag={<SimChip />}>
      <div className="vf-cbody" data-testid="vf-climate">
        <div className="vf-ccar">
          <img src={`${import.meta.env.BASE_URL}vinfast/ill/climate-car.jpg`} alt="Xe cắt lớp minh hoạ luồng gió (ảnh tham chiếu)" draggable={false} />
          <svg className="vf-cflow" viewBox="0 0 1250 460" aria-hidden>
            {flows.map((d, i) => <path key={d} d={d} className="vf-stream" style={{ animationDelay: `${i * .35}s`, animationDuration: `${Math.max(.9, 2.6 - level * .28)}s` }} />)}
          </svg>
          {VENTS.map(({ id, x, y, label, G }) => (
            <button key={id} type="button" className={`vf-vent vf-press ${ventOn(id) ? 'on' : ''}`} style={{ left: x - 30, top: y - 30 }} aria-pressed={ventOn(id)} aria-label={label}
              onClick={() => v.setClimate({ airflow: id === 'face' && c.airflow === 'feet' ? 'faceFeet' : id === 'feet' && c.airflow === 'face' ? 'faceFeet' : id, autoMode: false, enabled: true })}><G size={34} /></button>
          ))}
        </div>
        <div className="vf-ccol left">
          <ModeBtn label={c.autoMode ? 'TỰ ĐỘNG' : 'THỦ CÔNG'} on={c.autoMode} onClick={() => v.setClimate({ autoMode: !c.autoMode, enabled: true })}><GHand size={44} /></ModeBtn>
          <ModeBtn label="A/C" on={c.ac && c.enabled} onClick={() => v.setClimate({ ac: !c.ac, enabled: true })}><GSnow size={40} /></ModeBtn>
          <ModeBtn label="LẠNH TỐI ĐA" sim on={c.ac && c.enabled && c.fanSpeed >= FAN_MAX && c.recirculation && !c.autoMode}
            onClick={() => v.setClimate({ ac: true, enabled: true, fanSpeed: FAN_MAX, recirculation: true, autoMode: false })}><GSnow size={40} /></ModeBtn>
        </div>
        <div className="vf-ccol right">
          <ModeBtn label="TUẦN HOÀN" on={c.recirculation} onClick={() => v.setClimate({ recirculation: !c.recirculation })}><GRecirc size={44} /></ModeBtn>
          <ModeBtn label="ION" sim on={ion} onClick={() => setIon(!ion)}><GIon size={40} /></ModeBtn>
          <ModeBtn label="ĐỒNG BỘ" on={c.sync} onClick={() => v.setClimate({ sync: !c.sync })}><GThermo size={40} /></ModeBtn>
        </div>
        <div className="vf-carc">
          <svg ref={arc} viewBox="0 0 640 170" role="slider" aria-label="Mức quạt" aria-valuemin={0} aria-valuemax={FAN_MAX} aria-valuenow={level} tabIndex={0}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e) }} onPointerMove={(e) => { if (e.buttons) fromPointer(e) }}
            onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setLevel(Math.min(FAN_MAX, level + 1)); if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setLevel(Math.max(0, level - 1)) }}>
            <defs><linearGradient id="vfTray" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgba(160,215,235,.32)" /><stop offset="1" stopColor="rgba(160,215,235,0)" /></linearGradient>
              <linearGradient id="vfTrack" x1="0" x2="1"><stop offset="0" stopColor="#2395FF" stopOpacity=".2" /><stop offset="1" stopColor="#5fd0ff" /></linearGradient></defs>
            <path d="M0 170C60 170 70 60 160 52H480C570 60 580 170 640 170Z" fill="url(#vfTray)" />
            <path d="M60 128Q320 104 580 128" stroke="rgba(255,255,255,.18)" strokeWidth="5" fill="none" strokeLinecap="round" />
            <motion.path d="M60 128Q320 104 580 128" stroke="url(#vfTrack)" strokeWidth="5" fill="none" strokeLinecap="round" initial={false} animate={{ pathLength: level / FAN_MAX }} transition={{ duration: .22 }} />
            {Array.from({ length: FAN_MAX + 1 }, (_, i) => {
              const x = 60 + (520 / FAN_MAX) * i, y = 92 - Math.sin((i / FAN_MAX) * Math.PI) * 12
              return <text key={i} x={x} y={y} textAnchor="middle" className={i === level ? 'on' : ''} onPointerDown={(e) => { e.stopPropagation(); setLevel(i) }}>{i}</text>
            })}
            <motion.circle r="10" fill="#fff" initial={false} animate={{ cx: 60 + (520 / FAN_MAX) * level, cy: 128 - Math.sin((level / FAN_MAX) * Math.PI) * 12 }} transition={{ duration: .22, ease: [.2, .8, .2, 1] }} />
          </svg>
        </div>
        <p className="vf-cnote" data-testid="vf-cabin-temp">Đặt: lái {formatTemp(c.driverTemperature, ui.units)}° · phụ {formatTemp(c.passengerTemperature, ui.units)}° — trong xe đo được {measured.toFixed(1)} °C. Điều hòa là tiện nghi mô phỏng: không đóng sự cố cabin, không đổi mức rủi ro.</p>
      </div>
    </Panel>
  )
}
