import { useMemo, useState } from 'react'
import { Briefcase as BriefcaseFill, House as HouseFill, MagnifyingGlass } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { GraduationCap, MapPin, X, Zap } from 'lucide-react'
import { useNavigation } from '../../../store/navigationStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useT, useUi } from '../../../store/uiStore'
import { PLACES, type Place } from '../../../lib/mapConfig'
import { distanceM, formatDistance } from '../../../lib/vehicleSimulation'

const ICON = { home: HouseFill, work: BriefcaseFill, school: GraduationCap, charger: Zap, poi: MapPin }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

export function NavigationSearch() {
  const t = useT()
  const units = useUi((s) => s.units)
  const nav = useNavigation()
  const driving = useVehicle((s) => s.speed > 0.5)
  const [q, setQ] = useState('')
  const results = useMemo(() => PLACES.filter((p) => !q || fold(`${p.name} ${p.sub}`).includes(fold(q))), [q])
  const pick = (p: Place) => { setQ(''); void nav.setDestination(p) }
  return (
    <div className="su-black overflow-hidden">
      <div className="flex h-[4.25rem] w-full items-center gap-[.8rem] px-[1.25rem]">
      <button type="button" className="flex h-[3.5rem] min-w-[3.5rem] grow items-center gap-[1.2rem] text-left" onClick={() => nav.set({ searchOpen: !nav.searchOpen })} aria-expanded={nav.searchOpen}>
        <MagnifyingGlass size="2.2rem" weight="bold" className="shrink-0 text-white" /><span className="grow truncate t-body text-[var(--cx-text-2)]">{nav.destination ? `${nav.destination.name} · ${nav.destination.sub}` : 'Tìm điểm đến'}</span>
        {nav.destination && <span role="button" tabIndex={0} aria-label={t('endRoute')} className="cx-btn h-12 w-12" onClick={(e) => { e.stopPropagation(); nav.clearRoute() }}><X size="1.8rem" /></span>}
      </button>
      {!nav.destination && (['home', 'work'] as const).map((kind) => {
        const place = PLACES.find((p) => p.kind === kind)
        const Icon = ICON[kind]
        return place ? <button key={kind} type="button" className="flex h-[3.5rem] shrink-0 items-center gap-[.6rem] rounded-[var(--r-sm)] bg-white/[.08] px-[1rem] t-label text-[var(--cx-text)]" aria-label={`Đi tới ${place.name}`} onClick={() => pick(place)}><Icon size="1.9rem" weight="fill" />{place.name}</button> : null
      })}
      </div>
      <AnimatePresence initial={false}>
        {nav.searchOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="border-t cx-hair">
            <div className="p-3">
              {driving
                ? <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-2">{t('noTyping')}</div>
                : <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchDest')} aria-label={t('searchDest')}
                  className="h-11 w-full rounded-lg bg-surface-2 px-3 t-label outline-none focus:ring-2 focus:ring-accent" />}
              <div className="mt-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-3">{t('recent')}</div>
              <ul className="mt-1 max-h-72 cx-scroll">
                {results.map((p) => {
                  const Icon = ICON[p.kind]
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => pick(p)} className="cx-btn flex h-[4.5rem] w-full justify-start gap-3 px-2 text-left">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2"><Icon size="1.5rem" /></span>
                        <span className="grow"><span className="block t-label">{p.name}</span><span className="block text-xs text-text-2">{p.sub}</span></span>
                        <span className="text-xs text-text-2">{formatDistance(distanceM(nav.position, p), units)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
