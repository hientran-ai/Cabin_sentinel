import { AnimatePresence, motion } from 'motion/react'
import { ChevronUp, Heart, Pause, Play, SkipBack, SkipForward, Radio, Bluetooth, Music2, Usb } from 'lucide-react'
import { CaretDown, Pause as PausePh, Play as PlayPh, SkipBack as SkipBackPh, SkipForward as SkipForwardPh, Star } from '@phosphor-icons/react'
import { LIBRARY, useMedia, type MediaSource, type Track } from '../../../store/mediaStore'
import { useT, useUi } from '../../../store/uiStore'
import { RadioStations } from './RadioStations'

export function Art({ hue, size, mono }: { hue: number; size: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size, filter: mono ? 'grayscale(1)' : undefined }} className="shrink-0 rounded-lg" aria-hidden="true">
      <rect width="100" height="100" fill={`hsl(${hue} 42% 30%)`} /><circle cx="30" cy="70" r="46" fill={`hsl(${hue} 52% 44%)`} />
      <circle cx="78" cy="26" r="24" fill={`hsl(${(hue + 40) % 360} 62% 62%)`} />
    </svg>
  )
}
const SOURCES: [MediaSource, typeof Radio][] = [['radio', Radio], ['bluetooth', Bluetooth], ['streaming', Music2], ['local', Usb]]
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Layer 6: compact player under the map; expands upward with station cards and sources. */
export function MediaPlayer({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const m = useMedia()
  const ui = useUi()
  const { track, station, device } = m.current()
  const fav = station ? m.favorites.includes(station.id) : false
  const expanded = ui.mediaExpanded && !compact
  // dock mini player: art, title with a thin progress line, play and next
  if (compact) return (
    <section aria-label={t('music')} className="flex items-center gap-3">
      <Art hue={track.hue} size="3.2rem" />
      <div className="w-[12rem] min-w-0">
        <div className="truncate text-xs">{station ? station.name : track.title}</div>
        <div className="mt-1.5 h-[3px] rounded-full bg-surface-2"><div className="h-full rounded-full bg-text-2" style={{ width: station ? '100%' : `${(m.pos / track.len) * 100}%` }} /></div>
      </div>
      <button type="button" className="cx-btn h-[4.5rem] w-14" aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.togglePlay}>{m.playing ? <Pause size="2.1rem" /> : <Play size="2.1rem" />}</button>
      <button type="button" className="cx-btn h-[4.5rem] w-14" aria-label="Next" onClick={() => m.skip(1)}><SkipForward size="2.1rem" /></button>
    </section>
  )
  return (
    <motion.section layout transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} aria-label={t('music')} className="cx-panel overflow-hidden">
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="exp" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="border-b cx-hair">
            <div className="flex items-center gap-2 px-4 pt-3">
              {SOURCES.map(([s, Icon]) => (
                <button key={s} type="button" aria-pressed={m.source === s} onClick={() => m.setSource(s)} className={`cx-btn h-10 gap-2 px-3 text-sm ${m.source === s ? 'bg-surface-2' : 'text-text-2'}`}><Icon size="1.4rem" />{t(s)}</button>
              ))}
              <span className="grow" />
              <span className="text-xs text-text-3">{t('mediaNote')}</span>
            </div>
            {m.source === 'radio' ? <RadioStations /> : <Queue tracks={libTracks(m.source)} current={m.trackIdx} onPick={(i) => m.set({ trackIdx: i, pos: 0, playing: true })} />}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-4 px-4 py-3">
        <Art hue={track.hue} size="5.2rem" />
        <div className="min-w-0 grow">
          <div className="truncate text-xs font-semibold uppercase tracking-wider text-text-2">{station ? `${station.name} · ${station.freq}` : device}</div>
          <div className="truncate t-body">{track.title}</div>
          <div className="truncate text-sm text-text-2">{track.artist}</div>
          {m.source !== 'radio' && <div className="mt-1 flex items-center gap-2 t-label text-text-3"><span>{mmss(m.pos)}</span><div className="h-1 grow rounded-full bg-surface-2"><div className="h-full rounded-full bg-text-2" style={{ width: `${(m.pos / track.len) * 100}%` }} /></div><span>{mmss(track.len)}</span></div>}
        </div>
        {station && <button type="button" className={`cx-btn h-14 w-14 ${fav ? 'text-critical' : 'text-text-2'}`} aria-pressed={fav} aria-label={t('favorites')} onClick={() => m.toggleFavorite(station.id)}><Heart size="2.2rem" fill={fav ? 'currentColor' : 'none'} /></button>}
        <button type="button" className="cx-btn h-14 w-14" aria-label="Previous" onClick={() => m.skip(-1)}><SkipBack size="2.2rem" /></button>
        <button type="button" className="cx-btn h-[4.5rem] w-[4.5rem] rounded-full bg-surface-2" aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.togglePlay}>{m.playing ? <Pause size="2.4rem" /> : <Play size="2.4rem" />}</button>
        <button type="button" className="cx-btn h-14 w-14" aria-label="Next" onClick={() => m.skip(1)}><SkipForward size="2.2rem" /></button>
        <button type="button" className="cx-btn h-14 w-14 text-text-2" aria-expanded={expanded} aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => ui.set({ mediaExpanded: !expanded })}>
          {expanded ? <CaretDown size="2.2rem" weight="bold" /> : <ChevronUp size="2.2rem" />}
        </button>
      </div>
    </motion.section>
  )
}

function libTracks(source: MediaSource): Track[] { return source === 'radio' ? [] : LIBRARY[source].tracks }

function Queue({ tracks, current, onPick }: { tracks: Track[]; current: number; onPick: (i: number) => void }) {
  return (
    <ul className="flex gap-3 overflow-x-auto px-4 py-3">
      {tracks.map((tr, i) => (
        <li key={tr.title + i}>
          <button type="button" onClick={() => onPick(i)} className={`cx-btn h-[4.5rem] w-60 justify-start gap-3 rounded-xl border px-2 text-left ${i === current % tracks.length ? 'border-accent' : 'cx-hair'}`}>
            <Art hue={tr.hue} size="3.2rem" /><span className="min-w-0"><span className="block truncate text-sm">{tr.title}</span><span className="block truncate text-xs text-text-2">{tr.artist}</span></span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Music panel: header → artwork (~52 % of the panel width) → name and source → playback, as one centred group on graphite with
 *  a faint tint taken from the artwork. Radio shows "Trực tiếp" and no progress; progress and shuffle appear only where the source
 *  supports them (shuffle is not implemented, so it never appears). Shares playback state with the dock. */
export function MediaCard() {
  const t = useT()
  const m = useMedia()
  const ui = useUi()
  const { track, station } = m.current()
  const fav = station ? m.favorites.includes(station.id) : false
  const title = station ? station.name : track.title
  const sub = station ? `${station.freq} · Trực tiếp` : track.artist
  const ctl = (label: string, onClick: () => void, child: React.ReactNode, big = false) => (
    <button type="button" aria-label={label} onClick={onClick} className="grid place-items-center rounded-full text-[var(--cx-text)] active:bg-white/10" style={{ width: big ? '5.5rem' : '3.5rem', height: big ? '5.5rem' : '3.5rem' }}>{child}</button>
  )
  return (
    <section aria-label={t('music')} className="relative flex h-full min-h-0 flex-col px-[2rem] pb-[2rem] pt-[3.4rem]">
      <div className="pointer-events-none absolute inset-0 -z-0" style={{ background: `radial-gradient(90% 55% at 50% 22%, hsl(${track.hue} 38% 42% / .22), transparent 70%)` }} />
      <div className="relative flex items-center justify-between">
        <span className="t-body font-medium text-[var(--cx-text-2)]">{t('music')}</span>
        <button type="button" className="su-icon48 text-[var(--cx-text-2)]" aria-label="Mở trang âm nhạc" onClick={() => ui.setOverlay('media')}><CaretDown size="2rem" weight="bold" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="aspect-square w-[52%] overflow-hidden rounded-[var(--r-md)] shadow-[0_1.2rem_2.4rem_-1rem_rgba(0,0,0,.7)]"><Art hue={track.hue} size="100%" /></div>
        <div className="mt-[2rem] w-full text-center">
          <div className="truncate t-title">{title}</div>
          <div className="mt-[.3rem] truncate t-label text-[var(--cx-text-2)]">{sub}</div>
          {station && <div className="mx-auto mt-[.8rem] max-w-[24rem] t-label leading-snug text-[var(--cx-text-3)]">{t('mediaNote')}</div>}
        </div>
        {!station && (
          <div className="mt-[1.6rem] w-full" aria-label="Tiến trình bài hát">
            <div className="h-[.3rem] rounded-full bg-white/20"><div className="h-full rounded-full bg-[var(--cx-text)]" style={{ width: `${(m.pos / track.len) * 100}%` }} /></div>
            <div className="mt-[.5rem] flex justify-between t-label tabular-nums text-[var(--cx-text-2)]"><span>{mmss(m.pos)}</span><span>{mmss(track.len)}</span></div>
          </div>)}
        <div className="mt-[1.6rem] flex items-center justify-center gap-[1rem]">
          {station && ctl(t('favorites'), () => m.toggleFavorite(station.id), <Star size="2.2rem" weight={fav ? 'fill' : 'bold'} />)}
          {ctl(station ? 'Đài trước' : 'Bài trước', () => m.skip(-1), <SkipBackPh size="2.4rem" weight="fill" />)}
          {ctl(m.playing ? 'Tạm dừng' : 'Phát', m.togglePlay, m.playing ? <PausePh size="3rem" weight="fill" /> : <PlayPh size="3rem" weight="fill" />, true)}
          {ctl(station ? 'Đài tiếp' : 'Bài tiếp', () => m.skip(1), <SkipForwardPh size="2.4rem" weight="fill" />)}
        </div>
      </div>
    </section>
  )
}
