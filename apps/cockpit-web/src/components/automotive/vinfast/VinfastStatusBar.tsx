import { useEffect, useState } from 'react'
import { Smartphone, UserRound } from 'lucide-react'
import { useVehicle } from '../../../store/vehicleStore'
import { useE2e } from '../../../e2e/store'
import { BRANDS, rangeKm } from '../../../lib/vehicleSimulation'
import { SimChip, VfIcon } from './parts'

/** Thin V-shaped curve at the centre is drawn as a generic stroke (A06/A13); no OEM logo asset is bundled. */
function VCurve() {
  return (
    <svg className="vf-vlogo" viewBox="0 0 560 64" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <path d="M10 1c110 0 150 2 196 24 30 14 52 28 74 38 22-10 44-24 74-38C400 3 440 1 550 1" strokeWidth="1.2" opacity=".35" />
    </svg>
  )
}
const VLogo = () => <span className="vf-vlogo2"><VfIcon n="logo" h={44} /></span>


export function VinfastStatusBar() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const battery = useVehicle((s) => s.batteryLevel), gear = useVehicle((s) => s.gear), climate = useVehicle((s) => s.climate.enabled)
  const mode = useE2e((s) => s.service?.mode)
  const km = Math.round(rangeKm(BRANDS.vinfast, battery, climate))
  return (
    <header className="vf-status" data-testid="vf-status">
      <div className="grp"><VfIcon n="battery" h={26} /><span>{Math.round(battery)}%</span><span style={{ color: 'var(--vf-text2)' }}>{km} km</span>
        <span aria-label={`Số ${gear}`} style={{ fontWeight: 800, marginLeft: 10 }}>{gear}</span></div>
      <VCurve /><VLogo />
      <span className="grow" />
      <div className="grp" style={{ marginRight: 212 }}>
        <SimChip text={mode ?? 'HOSTED_SIMULATION'} />
        <span className="vf-ctl" style={{ fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="grp" style={{ gap: 8, color: 'var(--vf-text2)' }}><UserRound size={26} strokeWidth={1.6} aria-hidden />Chủ xe</span>
        <span className="grp" style={{ gap: 8, color: 'var(--vf-text2)' }}><Smartphone size={26} strokeWidth={1.6} aria-hidden />Điện thoại chủ xe</span>
      </div>
      <div className="vf-airbag" data-testid="vf-airbag">TÚI KHÍ<span>chưa có dữ liệu</span></div>
    </header>
  )
}
