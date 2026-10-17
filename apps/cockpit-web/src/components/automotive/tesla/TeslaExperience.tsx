import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useMedia } from '../../../store/mediaStore'
import { useVehicleSimulation } from '../../../hooks/useVehicleSimulation'
import { E2eCabinMonitoring } from '../../../e2e/CockpitCabin'
import { CabinCareScreen } from '../../../e2e/CabinCareScreen'
import { TeslaClimate } from './TeslaClimate'
import { TeslaSettings } from './TeslaSettings'
import { CameraPanel } from '../camera/CameraPanel'
import { CabinMonitoring } from '../safety/CabinMonitoring'
import { TeslaPhone } from './TeslaPhone'
import { NotificationLayer } from '../notifications/NotificationLayer'
import { DevPanel } from '../dev/DevPanel'
import { TeslaDashboard } from './TeslaDashboard'

function Volume() {
  const m = useMedia()
  return <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-4 right-0 flex items-center gap-4 rounded-xl bg-surface p-5 shadow-xl" aria-label="Âm lượng">
    <label htmlFor="tesla-volume">Âm lượng · MÔ PHỎNG</label>
    <input id="tesla-volume" type="range" min="0" max="10" value={m.muted ? 0 : m.volume} onChange={e => m.setVolume(+e.target.value)} />
    <span>{m.muted ? 0 : m.volume}</span>
    <button type="button" aria-label="Đóng âm lượng" onClick={() => useUi.getState().setOverlay(null)}><X /></button>
  </motion.section>
}

/** Separate Tesla shell. Reuses the existing read models, panels and simulation guards. */
export function TeslaExperience() {
  useVehicleSimulation()
  const ui = useUi()
  const gear = useVehicle(s => s.gear)
  const mode = ui.appearance === 'light' ? 'light' : 'dark'
  useEffect(() => {
    const el = document.documentElement
    el.dataset.brand = 'tesla'; el.dataset.mode = mode; el.lang = ui.language
    el.style.setProperty('--cx-surface', mode === 'dark' ? '#171717' : '#fafafa')
    return () => { el.style.removeProperty('--cx-surface') }
  }, [mode, ui.language])
  useEffect(() => {
    const s = useUi.getState()
    if (gear === 'R') s.set({ overlay: 'camera', cameraView: 'rear' })
    else if (s.overlay === 'camera' && s.cameraView === 'rear') s.setOverlay(null)
  }, [gear])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') useUi.getState().setOverlay(null)
      if (e.key === '`') useUi.getState().set({ devOpen: !useUi.getState().devOpen })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return <MotionConfig reducedMotion="user" transition={{ duration: .22, ease: [.2, 0, 0, 1] }}>
    <div className="tesla-shell relative h-full w-full" style={{ filter: ui.brightness < 100 ? `brightness(${ui.brightness / 100})` : undefined }}>
      <TeslaDashboard>
        <main className="pointer-events-none absolute left-[600px] right-[20px] top-[80px] bottom-[140px] z-20" data-testid="tesla-function-panels">
          <div className="relative h-full" style={{ pointerEvents: ui.overlay && ui.overlay !== 'map' ? 'auto' : 'none' }}>
            {ui.e2e && <div className="pointer-events-auto"><CabinCareScreen /></div>}
            <AnimatePresence>
              {ui.overlay === 'climate' && <TeslaClimate key="climate" />}
              {ui.overlay === 'vehicle' && <TeslaSettings key="vehicle" />}
              {ui.overlay === 'camera' && <CameraPanel key="camera" presentation="tesla" />}
              {ui.overlay === 'cabin' && (ui.e2e ? <E2eCabinMonitoring key="cabin" /> : <CabinMonitoring key="cabin" />)}
              {ui.overlay === 'launcher' && <TeslaPhone key="phone" />}
              {ui.overlay === 'control' && <TeslaSettings key="control" />}
            </AnimatePresence>
          </div>
          {ui.overlay !== 'cabin' && <NotificationLayer />}
          <AnimatePresence>
            {ui.overlay === 'volume' && <div className="pointer-events-auto"><Volume key="volume" /></div>}
            {ui.devOpen && <div className="pointer-events-auto"><DevPanel key="dev" /></div>}
          </AnimatePresence>
        </main>
      </TeslaDashboard>
    </div>
  </MotionConfig>
}
