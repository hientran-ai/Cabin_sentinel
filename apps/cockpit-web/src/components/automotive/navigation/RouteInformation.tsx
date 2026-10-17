import { AnimatePresence, motion } from 'motion/react'
import { Flag, Loader } from 'lucide-react'
import { remaining, useNavigation } from '../../../store/navigationStore'
import { useT, useUi } from '../../../store/uiStore'
import { formatDistance, formatDuration } from '../../../lib/vehicleSimulation'

export function RouteInformation() {
  const t = useT()
  const ui = useUi()
  const nav = useNavigation()
  const show = nav.status !== 'idle'
  const r = nav.route ? remaining(nav.route, nav.along) : null
  const eta = r ? new Date(Date.now() + r.durationS * 1000).toLocaleTimeString(ui.language === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="cx-panel p-4" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {nav.status === 'routing' && <div className="flex items-center gap-2 text-text-2"><Loader size="1.4rem" className="animate-spin" />{t('routing')}</div>}
          {nav.status === 'arrived' && <div className="flex items-center gap-2 t-label"><Flag size="1.5rem" className="text-accent" />{t('arrived')} · {nav.destination?.name}</div>}
          {nav.status === 'active' && r && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div><div className="t-body font-light leading-tight">{eta}</div><div className="text-xs text-text-2">{t('arrival')}</div></div>
                <div><div className="t-body font-light leading-tight">{formatDistance(r.distanceM, ui.units)}</div><div className="text-xs text-text-2">{t('remaining')}</div></div>
                <div><div className="t-body font-light leading-tight">{formatDuration(r.durationS, ui.language)}</div><div className="text-xs text-text-2">{t('duration')}</div></div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-text-3">
                <span>{nav.route?.source === 'osrm' ? t('routeOsrm') : t('routeMock')}</span>
                <button type="button" className="cx-btn h-8 px-3 text-critical" onClick={nav.clearRoute}>{t('endRoute')}</button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
