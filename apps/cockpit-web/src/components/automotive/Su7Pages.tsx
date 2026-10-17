// Pages that complete the SU7-style layer set: quick-control centre (pull-down), full music page, full map page.
// Layout follows the "Xiaomi SU7 Free UIkit" Figma (Jackywine, CC BY 4.0) wireframes; our own icons and copy.
import { motion } from 'motion/react'
import { SPRING_PAGE, SPRING_TAP } from '../../lib/motion'
import { ArrowLineDown, Armchair, Car, Door, Fan, Lightbulb, Lock, LockOpen, Snowflake, SpeakerHigh, Sun, Wind } from '@phosphor-icons/react'
import { useVehicle } from '../../store/vehicleStore'
import { useMedia, LIBRARY, STATIONS, type MediaSource } from '../../store/mediaStore'
import { useUi, useT } from '../../store/uiStore'
import { Sheet, SimTag } from './ui'
import { Art, MediaCard } from './media/MediaPlayer'
import { NavigationMap } from './navigation/NavigationMap'
import { FrontDefrost } from './icons'

/** Quick-control centre: pulled down from the left (driver: whole car) or right (passenger: own seat and climate). */
export function ControlCenter() {
  const t = useT()
  const v = useVehicle()
  const ui = useUi()
  const m = useMedia()
  const c = v.climate
  const driver = ui.controlSide === 'driver'
  const close = () => ui.setOverlay(null)
  const tile = (label: string, on: boolean, onClick: () => void, icon: React.ReactNode, sub?: string) => (
    <motion.button type="button" aria-pressed={on} onClick={onClick} whileTap={{ scale: 0.94 }} transition={SPRING_TAP} className={`flex h-[8.5rem] flex-col justify-between rounded-[var(--r-lg)] p-[1.1rem] text-left transition-[background-color,transform] duration-200 active:scale-[.97] ${on ? 'bg-[linear-gradient(160deg,#2f7bff,#0057EF)] text-white shadow-[0_.6rem_1.6rem_-.4rem_rgba(0,87,239,.6)]' : 'bg-white/[.08] text-white/85'}`}>
      {icon}<span className="t-label leading-tight">{label}{sub && <span className="block t-label text-white/60">{sub}</span>}</span></motion.button>
  )
  const vented = Object.values(v.windows).some((w) => w !== 'closed')
  return (
    <>
      <button type="button" aria-label={t('dismiss')} className="absolute inset-0 z-40 cursor-default bg-black/30" onClick={close} />
      <motion.section role="dialog" aria-label="Điều khiển nhanh" className={`absolute top-0 z-50 w-[42.5rem] su-glass rounded-[var(--r-xl)] p-[1.75rem] shadow-2xl ${driver ? 'left-[2.25rem]' : 'right-[2.25rem]'}`}
        initial={{ opacity: 0, y: -40, scale: 0.97, filter: 'blur(.5rem)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0rem)' }} exit={{ opacity: 0, y: -28, scale: 0.98, filter: 'blur(.4rem)' }} transition={SPRING_PAGE}>
        <div className="mb-[1.25rem] flex items-center gap-3"><span className="t-title">{driver ? 'Điều khiển xe' : 'Ghế phụ'}</span><SimTag text={t('simulated')} /></div>
        <div className="grid grid-cols-4 gap-[.9rem]">
          {driver ? <>
            {tile(v.isLocked ? t('locked') : t('unlocked'), !v.isLocked, v.toggleLock, v.isLocked ? <Lock size="2.4rem" weight="fill" /> : <LockOpen size="2.4rem" weight="fill" />)}
            {tile(t('frunk'), v.frontTrunkOpen, v.toggleFrunk, <Car size="2.4rem" weight="fill" />, v.frontTrunkOpen ? t('open') : t('closed'))}
            {tile(t('trunk'), v.rearTrunkOpen, v.toggleTrunk, <ArrowLineDown size="2.4rem" weight="bold" />, v.rearTrunkOpen ? t('open') : t('closed'))}
            {tile(t('windows'), vented, () => v.setAllWindows(vented ? 'closed' : 'vent'), <Wind size="2.4rem" weight="bold" />, vented ? t('vent') : t('closed'))}
            {tile(t('headlights'), v.headlights === 'on', () => v.setHeadlights(v.headlights === 'on' ? 'auto' : 'on'), <Lightbulb size="2.4rem" weight="fill" />, t(v.headlights))}
            {tile(t('frontDefrost'), c.frontDefrost, () => v.setClimate({ frontDefrost: !c.frontDefrost, enabled: true }), <FrontDefrost />)}
            {tile(t('seatHeat'), c.seatHeatDriver > 0, () => v.cycleSeatHeat('driver'), <Armchair size="2.4rem" weight="fill" />, t('driver'))}
            {tile(t('ac'), c.enabled, () => v.setClimate({ enabled: !c.enabled }), <Snowflake size="2.4rem" weight="bold" />)}
          </> : <>
            {tile(t('seatHeat'), c.seatHeatPassenger > 0, () => v.cycleSeatHeat('passenger'), <Armchair size="2.4rem" weight="fill" />, t('passenger'))}
            {tile(t('sync'), c.sync, () => v.setClimate({ sync: !c.sync }), <Fan size="2.4rem" weight="fill" />)}
            {tile(t('ac'), c.enabled, () => v.setClimate({ enabled: !c.enabled }), <Snowflake size="2.4rem" weight="bold" />)}
            {tile(t('doors'), v.doors.frontRight, () => v.toggleDoor('frontRight'), <Door size="2.4rem" weight="fill" />, v.doors.frontRight ? t('open') : t('closed'))}
          </>}
        </div>
        <div className="mt-[1.5rem] space-y-[1rem]">
          <label className="flex items-center gap-[1rem] text-white/70"><Sun size="2.2rem" weight="fill" /><input type="range" min={40} max={100} value={ui.brightness} onChange={(e) => ui.set({ brightness: +e.target.value })} className="cx-range grow" aria-label={t('brightness')} /></label>
          <label className="flex items-center gap-[1rem] text-white/70"><SpeakerHigh size="2.2rem" weight="fill" /><input type="range" min={0} max={10} value={m.muted ? 0 : m.volume} onChange={(e) => m.setVolume(+e.target.value)} className="cx-range grow" aria-label={t('volume')} /></label>
        </div>
        <p className="mt-[1rem] t-label text-white/45">Điều khiển xe mô phỏng. Không có lệnh nào tới xe thật.</p>
      </motion.section>
    </>
  )
}

const SOURCES: [MediaSource, string][] = [['radio', 'Radio'], ['bluetooth', 'Bluetooth'], ['streaming', 'Trực tuyến'], ['local', 'USB']]

/** Full music page: player on the left (552 px column), library on the right with source tabs. */
export function MusicPage() {
  const t = useT()
  const m = useMedia()
  const ui = useUi()
  const items = m.source === 'radio' ? STATIONS.map((s) => ({ key: s.id, title: s.name, sub: s.freq, hue: s.hue, on: m.stationId === s.id, go: () => m.setStation(s.id) }))
    : LIBRARY[m.source as Exclude<MediaSource, 'radio'>].tracks.map((tr, i, all) => ({ key: `${tr.title}-${i}`, title: tr.title, sub: tr.artist, hue: tr.hue, on: m.trackIdx % all.length === i, go: () => m.set({ trackIdx: i, pos: 0, playing: true }) }))
  return (
    <Sheet label={t('music')} onClose={() => ui.setOverlay(null)}>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,34.5rem)_minmax(0,1fr)] gap-[var(--gap-panel)] px-[var(--pad)] pb-[var(--pad)]">
        <div className="su-pane su-pane-music"><div className="relative z-[1] h-full"><MediaCard /></div></div>
        <div className="flex min-h-0 flex-col pt-[1.5rem]">
          <div className="flex flex-wrap items-center gap-[.75rem] pr-[calc(var(--touch)+var(--pad))]">
            {SOURCES.map(([s, label]) => <button key={s} type="button" aria-pressed={m.source === s} onClick={() => m.setSource(s)}
              className={`h-[2.6rem] min-w-[7.5rem] rounded-[1.3rem] px-[1.25rem] t-label ${m.source === s ? 'bg-white text-black' : 'bg-white/10 text-white/70'}`}>{label}</button>)}
            <span className="grow" /><span className="whitespace-nowrap"><SimTag text={t('mediaNote')} /></span>
          </div>
          <ul className="mt-[1.25rem] grid min-h-0 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-[1.25rem] overflow-y-auto pb-4">
            {items.map((it) => (
              <li key={it.key}><button type="button" onClick={it.go} className="w-full text-left">
                <div className={`aspect-square overflow-hidden rounded-[1rem] ${it.on ? 'ring-[.2rem] ring-white' : ''}`}><Art hue={it.hue} size="100%" /></div>
                <div className="mt-[.6rem] truncate t-body">{it.title}</div><div className="truncate t-label text-white/50">{it.sub}</div>
              </button></li>))}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}

/** Full-screen map page. */
export function MapPage({ dark }: { dark: boolean }) {
  const t = useT()
  return <Sheet label={t('navigation')} onClose={() => useUi.getState().setOverlay(null)}><div className="relative min-h-0 flex-1"><NavigationMap dark={dark} full /></div></Sheet>
}
