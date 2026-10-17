import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT } from '../../../store/uiStore'
import { formatSpeed } from '../../../lib/vehicleSimulation'
import { CabinChip } from '../../../e2e/CockpitCabin'
import { ADAS_FIXTURE } from './adasFixture'

const Vehicle3D = lazy(() => import('./Vehicle3D').then((m) => ({ default: m.Vehicle3D })))
const Car = ({ backdrop }: { backdrop: 'sky' | 'adas' | 'none' }) => <Suspense fallback={<div className="grid h-full place-items-center text-sm text-text-2">…</div>}><Vehicle3D backdrop={backdrop} /></Suspense>

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id) }, [])
  return now
}


/** Parked desktop (gear P, stopped): one scene panel. The 3D canvas fills it (sky, ground, car are one scene); the clock/date/lock
 *  group and the cabin card are inset by the panel padding and sit on top (they take the pointer, the 3D scene does not behind them). */
export function ParkedHero() {
  const t = useT()
  const ui = useUi()
  const v = useVehicle()
  const now = useNow()
  const locale = ui.language === 'vi' ? 'vi-VN' : 'en-GB'
  useEffect(() => { useUi.getState().resetCarView('threeQuarter') }, [])
  return (
    <section aria-label={t('vehicle')} className="su-scene relative h-full overflow-hidden" style={{ borderRadius: 'var(--r-panel)' }} data-testid="scene-parked">
      <div className="absolute inset-0"><Car backdrop="sky" /></div>
      {/* fixed vehicle-status group: clock, date, lock state (unchanged meaning and colour) */}
      <div className="pointer-events-none absolute z-10 flex flex-col items-start" style={{ left: 'var(--pad)', top: 'var(--pad)' }} data-testid="status-group">
        <div className="su-num t-clock" data-testid="parked-clock">{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="t-body mt-[.5rem] text-[var(--cx-text-2)]">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'numeric' })}</div>
        {!v.isLocked && <div className="t-label mt-[.75rem] rounded-[var(--r-ctl)] px-[.75rem] py-[.25rem] text-[var(--cx-warning)]" style={{ background: 'linear-gradient(rgba(232,162,58,.14), rgba(232,162,58,.14)), rgba(13,18,26,.72)' }}>{t('unlocked')}</div>}
      </div>
      {ui.e2e && <div className="absolute z-10" style={{ left: 'var(--pad)', bottom: 'var(--pad)', width: 'var(--card-w)' }} data-testid="cabin-card-wrap"><CabinChip /></div>}
    </section>
  )
}

/** Vehicle pane in the 2/3-zone layouts: the illustrative ADAS road scene fills the pane, speed on top (80/64 px, weight 500),
 *  the cabin card at the bottom. The scene is a fixed fixture, separate from cabin perception and from the risk engine. */
export function DrivePane() {
  const t = useT()
  const v = useVehicle()
  const ui = useUi()
  const beltWarn = !v.driverSeatbelt && (v.gear === 'D' || v.gear === 'R')
  return (
    <section aria-label={t('vehicle')} className="su-adas relative h-full overflow-hidden" style={{ borderRadius: 'var(--r-panel)' }}>
      <div className="absolute inset-0"><Car backdrop="adas" /></div>
      <div className="pointer-events-none relative z-10 flex flex-col items-center" style={{ paddingTop: 'calc(var(--touch) + var(--pad) / 2)' }}>
        <div className="flex items-center gap-4">
          {beltWarn && <span title={t('seatbelt')} className="text-critical"><AlertTriangle size="2rem" /></span>}
          <span className="su-num t-speed" data-testid="speed">{formatSpeed(v.speed, ui.units)}</span>
        </div>
        <span className="t-label rounded-full bg-black/40 px-[1rem] text-[var(--cx-text-2)]">{ui.units === 'metric' ? 'km/h' : 'mph'}</span>
        <span className="t-label mt-[.5rem] rounded-full bg-black/40 px-[1rem] text-[var(--cx-text-2)]" data-testid="adas-label">{ADAS_FIXTURE.label}</span>
      </div>
      {ui.e2e && <div className="absolute z-10" style={{ left: 'var(--pad)', right: 'var(--pad)', bottom: 'var(--pad)' }} data-testid="cabin-card-wrap"><CabinChip /></div>}
    </section>
  )
}

/** Kept for the mock playground and older imports: the parked hero. */
export const VehiclePanel = ParkedHero
