import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useVehicle } from '../../store/vehicleStore'
import { useUi, useT } from '../../store/uiStore'
import { useMedia } from '../../store/mediaStore'
import { useVehicleSimulation } from '../../hooks/useVehicleSimulation'
import { TopStatusBar } from './TopStatusBar'
import { BottomControlBar } from './BottomControlBar'
import { Desktop } from './Desktop'
import { ControlCenter, MapPage, MusicPage } from './Su7Pages'
import { ClimateOverlay } from './climate/ClimateOverlay'
import { VehicleSettings } from './settings/VehicleSettings'
import { CameraPanel } from './camera/CameraPanel'
import { CabinMonitoring } from './safety/CabinMonitoring'
import { E2eCabinMonitoring } from '../../e2e/CockpitCabin'
import { CabinCareScreen } from '../../e2e/CabinCareScreen'
import { AppLauncher } from './launcher/AppLauncher'
import { NotificationLayer } from './notifications/NotificationLayer'
import { DevPanel } from './dev/DevPanel'

function useTheme() {
  const brand = useVehicle((s) => s.brand)
  const appearance = useUi((s) => s.appearance)
  const language = useUi((s) => s.language)
  // "auto" follows each design's default: the Tesla-inspired screen is light, the VinFast-inspired one dark
  const mode = appearance === 'auto' ? (brand === 'tesla' ? 'light' : 'dark') : appearance
  useEffect(() => {
    const el = document.documentElement
    el.dataset.brand = brand; el.dataset.mode = mode; el.lang = language
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(el).getPropertyValue('--cx-bg').trim())
  }, [brand, mode, language])
  return { brand, mode }
}

function VolumePopover() {
  const t = useT()
  const m = useMedia()
  const close = () => useUi.getState().setOverlay(null)
  return (
    <>
      <button type="button" aria-label={t('dismiss')} className="absolute inset-0 z-30 cursor-default" onClick={close} />
      <motion.div className="cx-panel absolute bottom-2 right-2 z-40 flex w-[26rem] items-center gap-4 border cx-hair p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18 }}>
        <span className="text-sm text-text-2">{t('volume')}</span>
        <input type="range" min={0} max={10} value={m.muted ? 0 : m.volume} onChange={(e) => m.setVolume(+e.target.value)} className="cx-range grow" aria-label={t('volume')} />
        <span className="w-6 text-right tabular-nums">{m.muted ? 0 : m.volume}</span>
      </motion.div>
    </>
  )
}

/** Layer 0: screen bounds, theme, layers and global keys. One screen, overlays on top; never a separate page. */
export function AutomotiveDashboard() {
  useVehicleSimulation()
  const { mode } = useTheme()
  const ui = useUi()
  const gear = useVehicle((s) => s.gear)

  // reverse gear opens the rear camera, leaving reverse closes it again
  useEffect(() => {
    const s = useUi.getState()
    if (gear === 'R') s.set({ overlay: 'camera', cameraView: 'rear' })
    else if (s.overlay === 'camera' && s.cameraView === 'rear') s.setOverlay(null)
  }, [gear])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === '`') useUi.getState().set({ devOpen: !useUi.getState().devOpen })
      if (e.key === 'Escape') useUi.getState().setOverlay(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="cx-screen su-screen relative flex h-full w-full select-none flex-col gap-[var(--gap-v)] overflow-hidden" style={{ filter: ui.brightness < 100 ? `brightness(${ui.brightness / 100})` : undefined }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
        <TopStatusBar />
        {/* Home desktop (parked scene or three panes), or the one function panel that is open. Status bar and dock stay. */}
        <main className="relative flex min-h-0 flex-1 px-[var(--margin)]">
          <div className="relative min-w-0 flex-1 overflow-hidden" data-testid="cockpit-content">
            {/* a full page replaces the panes (and their 3D canvas); the control centre floats over them */}
            {(ui.overlay === null || ui.overlay === 'control' || ui.overlay === 'volume') && <Desktop dark={mode === 'dark'} />}
            {ui.e2e && <CabinCareScreen />}
            <AnimatePresence>
              {ui.overlay === 'climate' && <ClimateOverlay key="climate" />}
              {ui.overlay === 'vehicle' && <VehicleSettings key="vehicle" />}
              {ui.overlay === 'camera' && <CameraPanel key="camera" />}
              {ui.overlay === 'cabin' && (ui.e2e ? <E2eCabinMonitoring key="cabin" /> : <CabinMonitoring key="cabin" />)}
              {ui.overlay === 'launcher' && <AppLauncher key="launcher" />}
              {ui.overlay === 'media' && <MusicPage key="media" />}
              {ui.overlay === 'map' && <MapPage key="map" dark={mode === 'dark'} />}
              {ui.overlay === 'control' && <ControlCenter key="control" />}
            </AnimatePresence>
            {ui.overlay !== 'cabin' && <NotificationLayer />}
          </div>
          <AnimatePresence>
            {ui.overlay === 'volume' && <VolumePopover key="volume" />}
            {ui.devOpen && <DevPanel key="dev" />}
          </AnimatePresence>
        </main>
        <BottomControlBar />
      </motion.div>
    </MotionConfig>
  )
}
