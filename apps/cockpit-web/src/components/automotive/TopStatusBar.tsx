import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bell, LinkSimple, Lock, LockOpen, WifiHigh } from '@phosphor-icons/react'
import { useVehicle } from '../../store/vehicleStore'
import { useUi, useT } from '../../store/uiStore'
import { useNotifications } from '../../store/notificationStore'
import { BRANDS, rangeKm } from '../../lib/vehicleSimulation'
import { SPRING_PAGE } from '../../lib/motion'
import { SimTag } from './ui'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id) }, [])
  return now
}

/** Status bar (V6): height 72/56 px, text 20/18 px weight 500, system icons 28 px, touch targets 56 px, side margin 24/16 px.
 *  Pulling down from the left or right half (or tapping the connection icons) opens the quick-control centre. */
export function TopStatusBar() {
  const t = useT()
  const v = useVehicle()
  const ui = useUi()
  const notes = useNotifications((s) => s.items)
  const now = useClock()
  const [panel, setPanel] = useState(false)
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startY = useRef<number | null>(null)
  const time = now.toLocaleTimeString(ui.language === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const range = rangeKm(BRANDS[v.brand], v.batteryLevel, v.climate.enabled)
  const shownRange = ui.units === 'metric' ? `${range} km` : `${Math.round(range * 0.621)} mi`
  const down = () => { press.current = setTimeout(() => ui.set({ devOpen: !useUi.getState().devOpen }), 700) }
  const up = () => { if (press.current) clearTimeout(press.current) }
  const pull = (side: 'driver' | 'passenger') => ({
    onPointerDown: (e: React.PointerEvent) => { startY.current = e.clientY },
    onPointerUp: (e: React.PointerEvent) => {
      if (startY.current != null && e.clientY - startY.current > 24) ui.set({ overlay: 'control', controlSide: side })
      startY.current = null
    },
  })
  const icon = 'su-icon48 text-[var(--cx-text-2)]'
  return (
    <div className="t-status relative z-20 flex shrink-0 items-center justify-between px-[var(--margin)]" style={{ height: 'var(--h-status)' }} data-testid="status-bar">
      <div className="flex h-full items-center gap-[1.5rem]" {...pull('driver')}>
        <button type="button" onPointerDown={down} onPointerUp={up} onPointerLeave={up} className="su-num t-status h-[var(--touch)] min-w-[var(--touch)] text-[var(--cx-text-2)]" aria-label={time}>{time}</button>
        <div className="flex items-center gap-[.5rem]" title="Quãng đường ước tính (mô phỏng)">
          <span className="su-num">{shownRange}</span>
          <div className="h-[.5rem] w-[4.5rem] overflow-hidden rounded-full bg-white/15"><div className={`h-full rounded-full ${v.batteryLevel <= 20 ? 'bg-warning' : 'bg-[var(--cx-text)]'}`} style={{ width: `${v.batteryLevel}%` }} /></div>
          <span className="su-num text-[var(--cx-text-2)]">{Math.round(v.batteryLevel)}%</span>
        </div>
        <div className="flex items-center" role="radiogroup" aria-label="Số xe">
          {(['P', 'R', 'N', 'D'] as const).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={v.gear === g} onClick={() => v.setGear(g)}
              className={`t-status h-[var(--touch)] w-[var(--touch)] ${v.gear === g ? 'text-[var(--cx-text)]' : 'text-[var(--cx-text-3)]'}`} style={{ fontWeight: v.gear === g ? 600 : 400 }}>{g}</button>))}
        </div>
        <button type="button" className={icon} aria-label={v.isLocked ? t('locked') : t('unlocked')} onClick={v.toggleLock}>
          {v.isLocked ? <Lock size="1.75rem" weight="bold" /> : <LockOpen size="1.75rem" weight="bold" />}</button>
      </div>
      <div className="flex h-full items-center gap-[.5rem]" {...pull('passenger')}>
        <SimTag text={t('simulated')} />
        <button type="button" onClick={() => setPanel((p) => !p)} className={`${icon} relative`} aria-label="Thông báo">
          <Bell size="1.75rem" weight="fill" />
          {notes.length > 0 && <span className="absolute right-[.5rem] top-[.5rem] grid h-[1.5rem] min-w-[1.5rem] place-items-center rounded-full bg-critical px-1 text-[length:var(--fs-label)] font-medium leading-none text-[#0D121A]">{notes.length}</span>}
        </button>
        <button type="button" className={icon} aria-label="Wi-Fi (mô phỏng)" onClick={() => ui.set({ overlay: 'control', controlSide: 'passenger' })}><WifiHigh size="1.75rem" weight="bold" /></button>
        <button type="button" className={icon} aria-label="Kết nối (mô phỏng)" onClick={() => ui.set({ overlay: 'control', controlSide: 'passenger' })}><LinkSimple size="1.75rem" weight="bold" /></button>
      </div>
      <AnimatePresence>
        {panel && (
          <motion.div className="su-glass t-label absolute right-[var(--margin)] z-50 w-[26rem] rounded-[var(--r-pop)] p-[1rem]" style={{ top: 'calc(var(--h-status) + .25rem)' }}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING_PAGE}>
            <div className="mb-2 flex items-center justify-between"><b className="t-body">{t('system')}</b><SimTag text={t('simulated')} /></div>
            {notes.length === 0 && <div className="py-2 text-[var(--cx-text-2)]">Không có thông báo.</div>}
            {notes.map((n) => <div key={n.id} className="border-b border-white/10 py-2 last:border-0"><div>{n.title}</div>{n.body && <div className="text-[var(--cx-text-2)]">{n.body}</div>}</div>)}
            <div className="mt-3 text-[var(--cx-text-2)]">Giữ đồng hồ 1 giây để mở bảng mô phỏng. Kéo xuống từ thanh trên để mở điều khiển nhanh.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
