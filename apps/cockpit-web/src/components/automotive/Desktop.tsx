import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsIn, ArrowsOut, CornersOut, DotsThree } from '@phosphor-icons/react'
import { NavigationMap } from './navigation/NavigationMap'
import { MediaCard } from './media/MediaPlayer'
import { DrivePane, ParkedHero } from './vehicle/VehiclePanel'
import { useVehicle } from '../../store/vehicleStore'
import { useUi } from '../../store/uiStore'
import { SPRING_PAGE } from '../../lib/motion'

type PaneId = 'drive' | 'map' | 'music'
const ORDER: PaneId[] = ['drive', 'map', 'music']
const LABEL: Record<PaneId, string> = { drive: 'Xe', map: 'Bản đồ', music: 'Âm nhạc' }
const FULL: Record<PaneId, 'vehicle' | 'map' | 'media'> = { drive: 'vehicle', map: 'map', music: 'media' }

/** Pane menu behind the "•••" handle. Every row does something: widen (snap 2/3), back to thirds, open full screen. */
function PaneMenu({ id, wide, onClose }: { id: PaneId; wide: PaneId | null; onClose: () => void }) {
  const set = useUi((s) => s.set), setOverlay = useUi((s) => s.setOverlay)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('pointerdown', off); addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', off); removeEventListener('keydown', esc) }
  }, [onClose])
  const row = (icon: React.ReactNode, text: string, go: () => void, disabled = false) => (
    <button type="button" disabled={disabled} onClick={() => { go(); onClose() }} className="t-body flex w-full items-center gap-[1rem] rounded-[var(--r-ctl)] px-[1rem] text-left disabled:opacity-40 hover:bg-white/[.06]" style={{ minHeight: 'var(--touch)' }}>{icon}{text}</button>
  )
  return (
    <motion.div ref={ref} role="menu" aria-label={`Menu ${LABEL[id]}`} className="su-glass absolute left-1/2 z-20 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-[var(--r-pop)] p-[.5rem]" style={{ top: 'calc(var(--touch) + .5rem)' }}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING_PAGE}>
      {row(<ArrowsOut size="1.75rem" weight="bold" />, 'Mở rộng 2/3', () => set({ paneWide: id }), wide === id)}
      {row(<ArrowsIn size="1.75rem" weight="bold" />, 'Về ba vùng', () => set({ paneWide: null }), wide === null)}
      {row(<CornersOut size="1.75rem" weight="bold" />, 'Mở toàn màn hình', () => setOverlay(FULL[id]))}
    </motion.div>
  )
}

/** Home desktop. Parked (P, stopped): one scene panel. Otherwise a 3-column grid `repeat(3, minmax(0, 1fr))`, gap 16/12 px:
 *  map mode = the vehicle keeps exactly one column, the map takes two columns plus the gap between them, music folds into the dock.
 *  Widening: "•••" menu, the "Về ba vùng" button, or dragging across a column boundary (snaps 1/3 ↔ 2/3). */
export function Desktop({ dark }: { dark: boolean }) {
  const parked = useVehicle((s) => s.gear === 'P' && s.speed < 0.5)
  const wide = useUi((s) => s.paneWide)
  const set = useUi((s) => s.set)
  const [menu, setMenu] = useState<PaneId | null>(null)
  const drag = useRef<number | null>(null)
  const hidden: PaneId | null = wide === 'map' || wide === 'drive' ? 'music' : wide === 'music' ? 'map' : null
  const visible = ORDER.filter((id) => id !== hidden)
  const body = { drive: <DrivePane />, map: <NavigationMap dark={dark} />, music: <MediaCard /> }
  const cls = { drive: 'su-pane-car', map: 'su-pane-map', music: 'su-pane-music' }
  // column spans: thirds, or 1 + 2 in map/vehicle mode, or 2 + 1 in music mode (music mode hides the map)
  const span = (id: PaneId) => (wide === id ? 2 : 1)
  const cols = visible.reduce((n, id) => n + span(id), 0)
  const boundary = (left: PaneId, right: PaneId, after: number) => (
    <div key={`${left}-${right}`} role="separator" aria-orientation="vertical" className="absolute top-0 z-10 h-full w-[1.5rem] touch-none"
      style={{ left: `calc((100% - ${(cols - 1)} * var(--gap-panel)) / ${cols} * ${after} + ${after - 1} * var(--gap-panel) + var(--gap-panel) / 2 - .75rem)` }}
      onPointerDown={(e) => { drag.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
      onPointerUp={(e) => { if (drag.current == null) return; const dx = e.clientX - drag.current; drag.current = null
        if (Math.abs(dx) > 40) set({ paneWide: dx > 0 ? left : right }) }} />
  )
  let acc = 0
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {parked ? (
        <motion.div key="parked" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING_PAGE}><ParkedHero /></motion.div>
      ) : (
        <motion.div key="drive" className="relative h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING_PAGE}>
          <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 'var(--gap-panel)' }}>
            {visible.map((id) => (
              <div key={id} className={`su-pane ${cls[id]}`} style={{ gridColumn: `span ${span(id)}` }} data-pane={id}>
                <button type="button" className="su-dots" aria-label={`Menu ${LABEL[id]}`} aria-haspopup="menu" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? null : id)}><DotsThree size="1.75rem" weight="bold" /></button>
                <AnimatePresence>{menu === id && <PaneMenu id={id} wide={wide} onClose={() => setMenu(null)} />}</AnimatePresence>
                <div className="relative z-[1] h-full">{body[id]}</div>
              </div>
            ))}
          </div>
          {visible.slice(0, -1).map((id, i) => { acc += span(id); return boundary(id, visible[i + 1]!, acc) })}
          {wide && (
            <motion.button type="button" onClick={() => set({ paneWide: null })} className="su-glass t-label absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-[.75rem] rounded-full px-[1.5rem]" style={{ bottom: 'var(--pad)', minHeight: 'var(--touch)' }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_PAGE}><ArrowsIn size="1.75rem" weight="bold" />Về ba vùng</motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
