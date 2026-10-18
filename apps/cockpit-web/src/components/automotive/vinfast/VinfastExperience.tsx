import { useEffect, useState } from 'react'
import { Tent } from 'lucide-react'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { useVehicleSimulation } from '../../../hooks/useVehicleSimulation'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { CabinCareScreen } from '../../../e2e/CabinCareScreen'
import { showCareScreen, useCareState } from '../../../e2e/careScreen'
import { closeTopLayer, installLayerHistory } from '../../../lib/layers'
import { CameraPanel } from '../camera/CameraPanel'
import { VinfastToasts } from './VinfastAlert'
import { CabinMonitorDialog } from './CabinMonitor'
import { VinfastCarMode } from './VinfastCarMode'
import { VinfastClimatePanel } from './VinfastClimatePanel'
import { VinfastDashboard } from './VinfastDashboard'
import { VinfastLibrary, VinfastMediaPanel } from './VinfastPanels'
import { VinfastPhoneFeature } from './VinfastPhoneFeature'
import { VinfastSettings } from './VinfastSettings'
import { useMode } from './useVinfast'

/** Third independent shell (/cockpit/vinfast/). Reuses the same stores, read model, map and simulation guards as SU7 and Tesla. */
/** Optional intro (?intro=1): draws the V once, has Skip, never runs by default and never delays an alert. */
function Intro() {
  const [on, setOn] = useState(() => new URLSearchParams(location.search).get('intro') === '1')
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 2100); return () => clearTimeout(t) }, [on])
  if (!on) return null
  return <div className="vf-intro" data-testid="vf-intro"><svg width="300" height="160" viewBox="0 0 100 54" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 6 50 48 94 6" /></svg><button type="button" className="vf-btn vf-press" style={{ position: 'absolute', right: 40, bottom: 40 }} onClick={() => setOn(false)}>Bỏ qua</button></div>
}

export function VinfastExperience() {
  useVehicleSimulation()
  const overlay = useUi((s) => s.overlay), language = useUi((s) => s.language)
  const gear = useVehicle((s) => s.gear)
  const mode = useMode()
  const care = useCareState()
  useEffect(() => {
    const el = document.documentElement
    el.dataset.brand = 'vinfast'; el.dataset.mode = mode; el.lang = language
    el.style.setProperty('--cx-accent', '#2395FF')   // the shared map reads the accent for the route line
    return () => { el.style.removeProperty('--cx-accent') }
  }, [mode, language])
  useEffect(() => {   // reverse gear opens the rear camera, as on the other skins
    const s = useUi.getState()
    if (gear === 'R') s.set({ overlay: 'camera', cameraView: 'rear' })
    else if (s.overlay === 'camera' && s.cameraView === 'rear') s.setOverlay(null)
  }, [gear])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      // Esc closes the top layer (overlay first, then the care screen); preventDefault tells the page-level Esc handler it was used
      if (e.key === 'Escape' && closeTopLayer()) e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => installLayerHistory(), [])   // browser Back closes the top layer instead of leaving the page
  return (
    <MotionConfig reducedMotion="user">
      <VinfastDashboard>
        <AnimatePresence mode="popLayout">
          {overlay === 'climate' && <VinfastClimatePanel key="climate" />}
          {overlay === 'vehicle' && <VinfastSettings key="vehicle" />}
          {overlay === 'camera' && <CameraPanel key="camera" presentation="vinfast" />}
          {overlay === 'cabinset' && <VinfastSettings key="cabinset" initial="cabin" />}
          {overlay === 'phone' && <VinfastPhoneFeature key="phone" />}
          {overlay === 'media' && <VinfastMediaPanel key="media" />}
          {overlay === 'carmode' && <VinfastCarMode key="carmode" />}
          {overlay === 'library' && <VinfastLibrary key="library" />}
        </AnimatePresence>
        {care.visible && overlay !== 'cabin' && <div className="vf-abs vf-glass" style={{ left: 608, top: 88, width: 1288, height: 856, zIndex: 21, overflow: 'hidden' }} data-testid="vf-care"><CabinCareScreen /></div>}
        {care.hidden && <button type="button" className="vf-care-chip vf-press" data-testid="vf-care-chip" onClick={showCareScreen} aria-label={`Chế độ ${care.name} đang chạy. Mở lại màn hình`}><Tent size={30} strokeWidth={1.8} aria-hidden /><span>Chế độ {care.name} đang chạy · Mở lại</span></button>}
        <VinfastToasts />
        {overlay === 'cabin' && <CabinMonitorDialog inCar />}
        <Intro />
      </VinfastDashboard>
    </MotionConfig>
  )
}
