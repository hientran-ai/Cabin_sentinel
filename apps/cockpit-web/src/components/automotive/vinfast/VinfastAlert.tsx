import { AlertOctagon, AlertTriangle, BellRing, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNotifications } from '../../../store/notificationStore'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useE2e } from '../../../e2e/store'
import { useTick, useView } from '../../../e2e/hooks'
import { swipeDismiss } from './gesture'
import { IC } from './parts'

/** Prompt slot (584 x 132, left column). A cabin warning, critical or unverifiable open incident always takes it, with no animation delay. */
export function VinfastPrompt() {
  useTick(1000)
  const view = useView(), incident = useE2e((s) => s.state?.incident), belt = useVehicle((s) => s.driverSeatbelt), setOverlay = useUi((s) => s.setOverlay)
  const open = incident?.status === 'OPEN'
  const alarming = view.tone === 'critical' || view.tone === 'warning'
  if (alarming || (open && view.tone === 'unknown')) {
    const crit = view.tone === 'critical'
    return (
      <button type="button" className={`vf-prompt vf-glass vf-press ${crit ? 'critical' : 'warning'}`} data-testid="vf-prompt" data-tone={view.tone} onClick={() => setOverlay('cabin')}>
        {crit ? <AlertOctagon size={44} strokeWidth={1.6} className="vf-tone-critical" aria-hidden /> : <AlertTriangle size={44} strokeWidth={1.6} className={view.tone === 'warning' ? 'vf-tone-warning' : 'vf-tone-unknown'} aria-hidden />}
        <span style={{ textAlign: 'left', minWidth: 0 }}><span className="vf-ctl" style={{ display: 'block' }}>{view.kind === 'stale' || view.kind === 'last-known' ? 'Không xác minh được cabin' : `Cabin: ${view.headline}`}</span>
          <span className="vf-cap" style={{ display: 'block' }}>{view.kind === 'current' ? view.reason : 'Sự cố vẫn mở · dữ liệu không còn hiện tại'}</span></span>
      </button>)
  }
  if (!belt) return <div className="vf-prompt vf-glass warning" role="status" data-testid="vf-prompt"><BellRing size={40} strokeWidth={1.6} className="vf-tone-warning" aria-hidden /><span className="vf-ctl">Chú ý thắt dây an toàn</span></div>
  return null
}

const ICON = { info: Info, warning: AlertTriangle, critical: AlertOctagon } as const

/** Toasts under the status bar. Swiping one away only hides the toast; it is never an acknowledgement or a resolution. */
export function VinfastToasts() {
  const { items, dismiss } = useNotifications()
  return (
    <div className="vf-toasts" aria-live="polite" data-testid="vf-toasts">
      <AnimatePresence initial={false}>
        {items.filter((n) => !n.key.startsWith('e2e-')).map((n) => {
          const I = ICON[n.level]
          return (
            <motion.div key={n.id} layout role={n.level === 'critical' ? 'alert' : 'status'} className={`vf-toast vf-glass ${n.level}`}
              initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0, transition: { duration: .26, ease: [.2, .8, .2, 1] } }} exit={{ opacity: 0, x: 48, transition: { duration: .2, ease: [.4, 0, 1, 1] } }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: .5 }} dragSnapToOrigin onDragEnd={(_, i) => { if (swipeDismiss(i.offset.x, i.velocity.x)) dismiss(n.id) }}>
              <I size={34} strokeWidth={1.6} className={`vf-tone-${n.level === 'info' ? 'info' : n.level}`} aria-hidden />
              <div style={{ flex: 1, minWidth: 0 }}><div className="vf-ctl">{n.title}</div>{n.body && <div className="vf-cap">{n.body}</div>}</div>
              <button type="button" className="vf-btn is-quiet vf-icon-btn vf-press" aria-label="Ẩn thông báo" onClick={() => dismiss(n.id)}><X {...IC} /></button>
            </motion.div>)
        })}
      </AnimatePresence>
    </div>
  )
}
