import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useUi } from '../../../store/uiStore'
import type { MapControls } from '../navigation/NavigationMap'
import { fitVinfast } from './layout'
import { VinfastPrompt } from './VinfastAlert'
import { VinfastCabinTile } from './VinfastCabin'
import { VinfastBottomBar } from './VinfastClimate'
import { VinfastLauncher, VinfastMapLayer, VinfastMedia } from './VinfastHomeWidgets'
import { VinfastStatusBar } from './VinfastStatusBar'
import { BlueBottom, BlueTop, BlueWallpaper } from './VinfastBlue'
import { VinfastLeftPanel } from './VinfastLeftPanel'
import { SKIN } from './skin'
import { VinfastCar, VinfastIpc, VinfastRail } from './VinfastVehiclePane'
import { useMode, useVinfast } from './useVinfast'
import './vinfast.css'

/** Home: one 1920 x 1080 artboard fitted without stretching. Function panels arrive as children and sit above it. */
export function VinfastDashboard({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const controls = useRef<MapControls | null>(null)
  const [fit, setFit] = useState({ scale: 0, x: 0, y: 0 })
  const mode = useMode(), hue = useVinfast((s) => s.ambientHue)
  const overlay = useUi((s) => s.overlay), brightness = useUi((s) => s.brightness)
  useLayoutEffect(() => {
    const el = box.current!
    const measure = () => setFit(fitVinfast(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const panelOpen = overlay !== null && overlay !== 'map'
  const hideRight = panelOpen || overlay === 'map'
  return (
    <div ref={box} className="vf-viewport" data-testid="vf-viewport">
      <div className="vf-artboard vf-shell" data-testid="vf-artboard" data-vf-mode={mode} data-vf-skin={SKIN} data-vf-panel={panelOpen} data-vf-map={overlay === 'map'} style={{ left: fit.x, top: fit.y, transform: `scale(${fit.scale})`, filter: brightness < 100 ? `brightness(${brightness / 100})` : undefined, ['--vf-ambient' as string]: hue }}>
        {SKIN === 'blue' ? <BlueWallpaper /> : <div className="vf-wall" aria-hidden />}
        <VinfastMapLayer controls={controls} />
        <div style={{ opacity: hideRight ? 0 : 1, pointerEvents: hideRight ? 'none' : 'auto', transition: 'opacity 200ms linear' }} aria-hidden={hideRight}>
          <VinfastMedia />
          <VinfastLauncher />
        </div>
        {SKIN === 'aurora' ? <><VinfastIpc /><VinfastRail /><VinfastCar /></> : <VinfastLeftPanel />}
        <VinfastCabinTile />
        <VinfastPrompt />
        {SKIN === 'aurora' ? <><VinfastBottomBar /><VinfastStatusBar /></> : <><BlueBottom /><BlueTop /><span className="vf-dots" aria-hidden><i className="on" /><i /><i /></span></>}
        {children}
      </div>
    </div>
  )
}
