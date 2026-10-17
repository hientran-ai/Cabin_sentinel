import { Camera, CaretLeft, CaretRight, Faders, House, Scan, SpeakerHigh, SpeakerSlash, SquaresFour, type Icon as PhIcon } from '@phosphor-icons/react'
import { useVehicle as useVeh } from '../../store/vehicleStore'
import { useView } from '../../e2e/hooks'
import { useVehicle } from '../../store/vehicleStore'
import { useMedia } from '../../store/mediaStore'
import { useUi, useT } from '../../store/uiStore'
import { formatTemp } from '../../lib/vehicleSimulation'
import type { Overlay } from '../../types/vehicle'
import { Art } from './media/MediaPlayer'
import { motion } from 'motion/react'
import { lift, tap } from '../../lib/motion'
import { RollNumber } from './RollNumber'

/** Dock after the SU7 UI kit (100 px): home · driver temp · four apps (the app list is the fixed last one) · now playing ·
 *  passenger temp · volume. No dividers or cards: the elements sit directly on the screen background. */
export function BottomControlBar() {
  const t = useT()
  const v = useVehicle()
  const c = v.climate
  const ui = useUi()
  const m = useMedia()
  const { track, station } = m.current()
  const view = useView()
  const parked = useVeh((x) => x.gear === 'P' && x.speed < 0.5)
  const musicOpen = ui.overlay === 'media' || (!parked && ui.overlay === null && ui.paneWide !== 'map' && ui.paneWide !== 'drive')
  const alarm = ui.e2e && (view.tone === 'critical' || view.tone === 'warning')
  const app = (o: Exclude<Overlay, null>, label: string, Icon: PhIcon, bg: string) => (
    <motion.button type="button" aria-label={label} title={label} aria-pressed={ui.overlay === o} onClick={() => ui.toggleOverlay(o)} className="su-app" style={{ background: bg }} {...lift}><Icon size="2rem" weight="fill" /></motion.button>
  )
  // CabinSentinel icon: neutral graphite container and a scan glyph (no tick, no green). A small dot appears only for a backend warning/critical state.
  const cabinApp = (
    <motion.button type="button" aria-label={t('cabinMonitoring')} title={t('cabinMonitoring')} aria-pressed={ui.overlay === 'cabin'} onClick={() => ui.toggleOverlay('cabin')} className="su-app relative" style={{ background: 'linear-gradient(160deg, #4a515c, #2c3139)' }} {...lift}>
      <Scan size="2rem" weight="bold" />
      {alarm && <span className={`absolute right-[.2rem] top-[.2rem] h-[1rem] w-[1rem] rounded-full ring-2 ring-[#0D0F12] ${view.tone === 'critical' ? 'bg-critical' : 'bg-warning'}`} />}
    </motion.button>
  )
  const temp = (who: 'driver' | 'passenger') => {
    const value = who === 'driver' ? c.driverTemperature : c.passengerTemperature
    return (
      <div className="flex shrink-0 items-center" title="Nhiệt độ điều hoà đặt (không phải nhiệt độ cabin đo được)">
        <button type="button" className="su-icon72 text-white/60 disabled:opacity-30" aria-label={`${t(who)} −`} disabled={!c.enabled} onClick={() => v.stepTemp(who, -0.5)}><CaretLeft size="1.75rem" weight="bold" /></button>
        <button type="button" onClick={() => ui.toggleOverlay('climate')} aria-pressed={ui.overlay === 'climate'} aria-label={`${t('climate')} · ${t(who)}`}
          className={`su-num flex min-w-[5.5rem] flex-col items-center ${c.enabled ? 'text-[var(--cx-text)]' : 'text-[var(--cx-text-3)]'}`}>
          {c.enabled ? <><span className="flex"><RollNumber value={formatTemp(value, ui.units)} className="t-title" /><span className="t-title text-[var(--cx-text-3)]">°</span></span><span className="t-label text-[var(--cx-text-2)]">Đặt</span></> : <span className="t-body">{t('climateOff')}</span>}</button>
        <button type="button" className="su-icon72 text-white/60 disabled:opacity-30" aria-label={`${t(who)} +`} disabled={!c.enabled} onClick={() => v.stepTemp(who, 0.5)}><CaretRight size="1.75rem" weight="bold" /></button>
      </div>
    )
  }
  return (
    <nav aria-label="Controls" className="su-dock relative z-20 flex shrink-0 items-center justify-between gap-[var(--gap-v)] px-[var(--margin)]" style={{ height: 'var(--h-dock)' }} data-testid="dock">
      <motion.button type="button" aria-label="Home" onClick={() => ui.setOverlay(null)} className="su-icon72" {...tap}><House size="2rem" weight="fill" /></motion.button>
      {temp('driver')}
      <div className="flex shrink-0 items-center justify-center gap-[var(--gap-panel)]">
        {app('vehicle', t('settings'), Faders, 'linear-gradient(160deg, #9aa0a8, #5b6068)')}
        {cabinApp}
        {app('camera', t('camera'), Camera, 'linear-gradient(160deg, #4aa3ff, #1f5fe0)')}
        {app('launcher', t('apps'), SquaresFour, 'linear-gradient(135deg, #ff9f43 0 50%, #7f5af0 50% 100%)')}
      </div>
      <div className={`flex min-w-0 items-center gap-[.5rem] ${musicOpen ? 'shrink-0 justify-center' : 'max-w-[26rem] flex-1'}`}>
        {!musicOpen && (
          <button type="button" onClick={() => ui.toggleOverlay('media')} aria-label={t('music')} className="flex min-w-0 grow items-center gap-[1rem] text-left">
            <Art hue={track.hue} size="3.5rem" />
            <span className="min-w-0 grow"><span className="t-body block truncate">{station ? station.name : track.title}</span>
              <span className="t-label block truncate text-[var(--cx-text-2)]">{station ? 'Trực tiếp' : track.artist}</span></span>
          </button>)}
        <button type="button" className="su-icon48" aria-label={m.playing ? 'Tạm dừng' : 'Phát'} onClick={m.togglePlay}>
          {m.playing ? <svg viewBox="0 0 24 24" width="2rem" height="2rem" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            : <svg viewBox="0 0 24 24" width="2rem" height="2rem" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>}</button>
        {!musicOpen && <button type="button" className="su-icon48" aria-label={station ? 'Đài tiếp' : 'Bài tiếp'} onClick={() => m.skip(1)}>
          <svg viewBox="0 0 24 24" width="2rem" height="2rem" fill="currentColor"><path d="M5 5.2v13.6a1 1 0 0 0 1.55.83l9.6-6.8a1 1 0 0 0 0-1.66l-9.6-6.8A1 1 0 0 0 5 5.2Z" /><rect x="17" y="4.5" width="2.6" height="15" rx="1" /></svg></button>}
      </div>
      {temp('passenger')}
      <button type="button" aria-pressed={ui.overlay === 'volume'} aria-label={t('volume')} onClick={() => ui.toggleOverlay('volume')} className="su-icon72">
        {m.muted || m.volume === 0 ? <SpeakerSlash size="2rem" weight="fill" /> : <SpeakerHigh size="2rem" weight="fill" />}</button>
    </nav>
  )
}
