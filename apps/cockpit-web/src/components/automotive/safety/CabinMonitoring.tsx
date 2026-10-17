import { Baby, PawPrint, User, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useCabin } from '../../../store/cabinStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT } from '../../../store/uiStore'
import { MOCK_SCENARIOS, type MockScenario } from '../../../lib/cabinMonitor'
import { formatTemp } from '../../../lib/vehicleSimulation'
import { Sheet, SimTag } from '../ui'

const TONE = { SAFE: 'text-ok', WARNING: 'text-warning', CRITICAL: 'text-critical', UNKNOWN: 'text-text-2' } as const
const ICON = { SAFE: ShieldCheck, WARNING: ShieldAlert, CRITICAL: ShieldAlert, UNKNOWN: ShieldQuestion } as const
const OCC = { adult: User, child: Baby, pet: PawPrint } as const

/** Cabin Monitoring overlay, ready for CabinSentinel: renders adapter snapshots only, never runs inference itself. */
export function CabinMonitoring() {
  const t = useT()
  const ui = useUi()
  const cabin = useCabin()
  const gear = useVehicle((s) => s.gear), speed = useVehicle((s) => s.speed)
  const s = cabin.snapshot
  const parked = gear === 'P' && speed < 0.5
  const Icon = s ? ICON[s.risk] : ShieldQuestion
  const sample = cabin.scenario === 'child_alone' ? 'ai-child.mp4' : 'empty-cabin.mp4'
  return (
    <Sheet label={t('cabinMonitoring')} onClose={() => ui.setOverlay(null)} className="inset-x-6 bottom-3 top-3">
      <div className="flex items-center gap-3 border-b cx-hair px-6 py-3">
        <h2 className="t-label font-medium">{t('cabinMonitoring')}</h2><SimTag text={t('simulated')} />
        <span className="grow" /><span className="text-sm text-text-2">{t('simSource')}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] gap-6 p-6">
        <div className="relative overflow-hidden rounded-xl bg-black">
          {parked
            ? <video key={sample} src={`${import.meta.env.BASE_URL}samples/${sample}`} autoPlay muted loop playsInline className="h-full w-full object-cover" style={{ filter: 'blur(10px)' }} />
            : <div className="grid h-full place-items-center p-6 text-center text-white/80">{t('cabinParkOnly')}</div>}
          {parked && <span className="cx-chip absolute left-3 top-3 bg-black/60 text-white">{t('cabinBlurred')} · {t('sample')}</span>}
        </div>
        <div className="flex min-h-0 flex-col gap-4 cx-scroll">
          <div className={`flex items-center gap-3 ${s ? TONE[s.risk] : ''}`}>
            <Icon size="3.2rem" />
            <div><div className="text-xs font-semibold uppercase tracking-wider text-text-2">{t('risk')}</div><div className="t-title">{s ? t(s.risk) : '—'}</div></div>
          </div>
          <p className="t-label">{s?.reason ?? '—'}</p>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-2">{t('occupancy')}</div>
            {s && s.occupants.length > 0
              ? <ul className="flex flex-wrap gap-2">{s.occupants.map((o, i) => { const O = OCC[o.kind]; return <li key={i} className="cx-chip bg-surface-2 py-1.5 text-sm"><O size="1.4rem" />{t(o.kind)}</li> })}</ul>
              : <div className="text-text-2">{s?.verifiedEmpty ? t('verifiedEmpty') : t('nobody')}</div>}
            {s && !s.verifiedEmpty && s.occupants.length === 0 && <div className="mt-1 text-sm text-warning">{t('nothingNotEmpty')}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-text-2">{t('temperature')}</div><div className="t-body font-light">{s?.temperatureC != null ? `${formatTemp(s.temperatureC, ui.units)}°` : '—'}</div></div>
            <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-text-2">{t('lastUpdate')}</div><div className="t-body font-light">{s ? new Date(s.updatedAt).toLocaleTimeString(ui.language === 'vi' ? 'vi-VN' : 'en-GB') : '—'}</div></div>
          </div>
          <label className="mt-auto flex items-center gap-3 text-sm text-text-2">
            {ui.language === 'vi' ? 'Kịch bản mô phỏng' : 'Simulated scenario'}
            <select value={cabin.scenario} onChange={(e) => cabin.setScenario(e.target.value as MockScenario)} className="h-10 grow rounded-lg bg-surface-2 px-2 text-text">
              {(Object.keys(MOCK_SCENARIOS) as MockScenario[]).map((k) => <option key={k} value={k}>{MOCK_SCENARIOS[k][ui.language]}</option>)}
            </select>
          </label>
        </div>
      </div>
    </Sheet>
  )
}
