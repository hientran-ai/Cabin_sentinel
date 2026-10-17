import { AnimatePresence, motion } from 'motion/react'
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react'
import { useNotifications } from '../../../store/notificationStore'
import { useT } from '../../../store/uiStore'
import { SPRING_PAGE } from '../../../lib/motion'

const STYLE = {
  info: { Icon: Info, cls: 'border-line', icon: 'text-accent' },
  warning: { Icon: AlertTriangle, cls: 'border-warning', icon: 'text-warning' },
  critical: { Icon: AlertOctagon, cls: 'border-critical bg-critical text-[#0D121A]', icon: 'text-[#0D121A]' },
} as const

/** Layer 11: top-centre, never blocks the dock or the map controls. Critical stays until dismissed. */
export function NotificationLayer() {
  const t = useT()
  const { items, dismiss } = useNotifications()
  return (
    <div className="pointer-events-none absolute right-[1.5rem] top-[5.8rem] z-50 flex w-[min(36rem,calc(100%-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((n) => {
          const s = STYLE[n.level]
          return (
            <motion.div key={n.id} layout role={n.level === 'critical' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: -28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.97 }} transition={SPRING_PAGE}
              className={`pointer-events-auto flex items-center gap-4 rounded-[var(--r-lg)] border px-5 py-3 shadow-2xl backdrop-blur-xl ${n.level === 'critical' ? 'su-alert-critical text-white' : n.level === 'warning' ? 'su-alert-warning text-white' : 'su-glass'}`}>
              <s.Icon size="1.9rem" className={`mt-0.5 shrink-0 ${s.icon}`} />
              <div className="min-w-0 grow"><div className="text-sm">{n.title}</div>{n.body && <div className={`text-xs ${n.level === 'critical' ? 'text-white/85' : 'text-text-2'}`}>{n.body}</div>}</div>
              <button type="button" aria-label={t('dismiss')} onClick={() => dismiss(n.id)} className="cx-btn h-12 w-12 shrink-0"><X size="1.7rem" /></button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
