import { Minus, Plus, Power } from 'lucide-react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT } from '../../../store/uiStore'
import { formatTemp } from '../../../lib/vehicleSimulation'
import type { Airflow } from '../../../types/vehicle'
import { PanelHeader, Seg, Sheet, Switch } from '../ui'
import { FrontDefrost, RearDefrost, SeatHeat } from '../icons'

function Zone({ who }: { who: 'driver' | 'passenger' }) {
  const t = useT()
  const v = useVehicle()
  const units = useUi((s) => s.units)
  const temp = who === 'driver' ? v.climate.driverTemperature : v.climate.passengerTemperature
  const f = (temp - 15) / 13
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-text-2">{t(who)}</div>
      <div className="relative grid h-44 w-44 place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--cx-surface-2)" strokeWidth="5" strokeDasharray="207 277" transform="rotate(135 50 50)" strokeLinecap="round" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={v.climate.enabled ? 'var(--cx-accent)' : 'var(--cx-text-3)'} strokeWidth="5" strokeDasharray={`${207 * f} 277`} transform="rotate(135 50 50)" strokeLinecap="round" style={{ transition: 'stroke-dasharray 200ms ease-out' }} />
        </svg>
        <div className="t-title tabular-nums">{formatTemp(temp, units)}°</div>
      </div>
      <div className="flex gap-3">
        <button type="button" className="cx-btn h-12 w-12 bg-surface-2" aria-label={`${t(who)} −`} onClick={() => v.stepTemp(who, -0.5)}><Minus size="1.7rem" /></button>
        <button type="button" className="cx-btn h-12 w-12 bg-surface-2" aria-label={`${t(who)} +`} onClick={() => v.stepTemp(who, 0.5)}><Plus size="1.7rem" /></button>
      </div>
    </div>
  )
}

/** Layer 8: expanded climate, over the dashboard. */
export function ClimateOverlay() {
  const t = useT()
  const v = useVehicle()
  const c = v.climate
  const close = () => useUi.getState().setOverlay(null)
  const flow: [Airflow, string][] = [['face', t('face')], ['faceFeet', t('faceFeet')], ['feet', t('feet')], ['windshield', t('windshield')]]
  const tile = (label: string, on: boolean, onClick: () => void, icon: React.ReactNode) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={`cx-btn h-24 w-36 flex-col rounded-xl border text-xs ${on ? 'border-accent is-on' : 'cx-hair text-text'}`}>{icon}{label}</button>
  )
  return (
    <Sheet label={t('climate')} onClose={close}>
      <PanelHeader title={t('climate')}>
        <span className="grow" />
        <button type="button" aria-pressed={c.enabled} onClick={() => v.setClimate({ enabled: !c.enabled })} className={`cx-btn h-14 gap-2 px-5 ${c.enabled ? 'bg-accent text-white' : 'bg-surface-2 text-text-2'}`}><Power size="1.7rem" />{c.enabled ? t('on') : t('off')}</button>
      </PanelHeader>
      <div className="grid min-h-0 grid-cols-[auto_1fr_auto] gap-8 overflow-auto px-8 py-5">
        <Zone who="driver" />
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-28 text-text-2">{t('fan')}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('fan')}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" role="radio" aria-checked={c.fanSpeed === n} aria-label={`${t('fan')} ${n}`} onClick={() => v.setClimate({ fanSpeed: n, autoMode: false, enabled: true })}
                  className={`h-10 w-7 rounded-md transition-colors ${n <= c.fanSpeed && c.enabled ? 'bg-accent' : 'bg-surface-2'}`} style={{ height: `${1.2 + n * 0.14}rem` }} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4"><span className="w-28 text-text-2">{t('airflow')}</span><Seg value={c.airflow} options={flow} onChange={(a) => v.setClimate({ airflow: a, autoMode: false })} label={t('airflow')} /></div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-3"><span className="text-text-2">{t('auto')}</span><Switch checked={c.autoMode} onChange={(x) => v.setClimate({ autoMode: x, enabled: true })} label={t('auto')} /></label>
            <label className="flex items-center gap-3"><span className="text-text-2">A/C</span><Switch checked={c.ac} onChange={(x) => v.setClimate({ ac: x })} label="A/C" /></label>
            <label className="flex items-center gap-3"><span className="text-text-2">{t('recirc')}</span><Switch checked={c.recirculation} onChange={(x) => v.setClimate({ recirculation: x })} label={t('recirc')} /></label>
            <label className="flex items-center gap-3"><span className="text-text-2">{t('sync')}</span><Switch checked={c.sync} onChange={(x) => v.setClimate({ sync: x, ...(x ? { passengerTemperature: c.driverTemperature } : {}) })} label={t('sync')} /></label>
          </div>
          <div className="flex flex-wrap gap-3">
            {tile(t('frontDefrost'), c.frontDefrost, () => v.setClimate({ frontDefrost: !c.frontDefrost, enabled: true }), <FrontDefrost />)}
            {tile(t('rearDefrost'), c.rearDefrost, () => v.setClimate({ rearDefrost: !c.rearDefrost }), <RearDefrost />)}
            {tile(`${t('driver')} ${c.seatHeatDriver || ''}`, c.seatHeatDriver > 0, () => v.cycleSeatHeat('driver'), <SeatHeat level={c.seatHeatDriver} />)}
            {tile(`${t('passenger')} ${c.seatHeatPassenger || ''}`, c.seatHeatPassenger > 0, () => v.cycleSeatHeat('passenger'), <SeatHeat level={c.seatHeatPassenger} style={{ transform: 'scaleX(-1)' }} />)}
          </div>
        </div>
        <Zone who="passenger" />
      </div>
    </Sheet>
  )
}
