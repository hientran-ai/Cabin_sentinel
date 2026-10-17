import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { X, Shield, BookOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi } from '../../../store/uiStore'
import { useMedia } from '../../../store/mediaStore'
import { notify } from '../../../store/notificationStore'
import { CabinChip } from '../../../e2e/CockpitCabin'
import { formatSpeed } from '../../../lib/vehicleSimulation'
import { fitArtboard } from './layout'
import { allowFigmaReference } from './reference'
import { TeslaNavigation } from './TeslaNavigation'
import type { MapControls } from '../navigation/NavigationMap'
import Model3Frame from './Model3Frame'
import Model3LightFrame from './Model3LightFrame'
import LibraryDark from './LibraryDark'
import LibraryLight from './LibraryLight'
import type { TeslaModel } from './types'
import './tesla.css'

/** Original Figma artboard, with the existing frontend stores and safety presentation layered over it. */
export function TeslaDashboard({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 0, x: 0, y: 0 })
  const [now, setNow] = useState(() => new Date())
  const mapControls = useRef<MapControls>(null)
  const [chargers, setChargers] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [library, setLibrary] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const v = useVehicle(), ui = useUi(), media = useMedia()
  const reference = allowFigmaReference(location.search)
  useLayoutEffect(() => {
    const el = container.current!
    const measure = () => setFit(fitArtboard(el.clientWidth, el.clientHeight))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => {
    if (ui.overlay === 'media') { setExpanded(true); useUi.getState().setOverlay(null) }
  }, [ui.overlay])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setLibrary(false); setExpanded(false) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const current = media.current()
  const model: TeslaModel = {
    gear: v.gear,
    speed: reference ? 'P' : v.gear === 'P' ? 'P' : String(formatSpeed(v.speed, ui.units)),
    units: reference || ui.units === 'imperial' ? 'MPH' : 'KM/H',
    battery: reference ? '90%' : `${Math.round(v.batteryLevel)}%`,
    time: reference ? '10:21 AM' : now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    outside: reference ? '17 ºC' : `${v.outsideTemperature.toFixed(0)} ºC`,
    driverTemp: reference ? '20' : String(v.climate.driverTemperature),
    passengerTemp: reference ? '20' : String(v.climate.passengerTemperature),
    title: reference ? "Mia & Sebastian's Theme" : current.track.title,
    artist: reference ? 'Justin Hurwitz' : current.track.artist,
    album: reference ? 'La La Land (Original Motion Pi...' : `${media.source.toUpperCase()} · phát nhạc mô phỏng`,
    frunkOpen: v.frontTrunkOpen, trunkOpen: v.rearTrunkOpen, chargeOpen: v.chargingPortOpen,
    playing: media.playing, favorite, mediaExpanded: expanded, mapZoom: 1, chargers,
  }
  const simulatedInfo = (title: string, body: string) => notify({ key: 'tesla-info', level: 'info', title, body })
  function control(name: string) {
    switch (name) {
      case 'frunk': v.toggleFrunk(); break
      case 'trunk': v.toggleTrunk(); break
      case 'charge': v.toggleChargePort(); break
      case 'driver-up': v.stepTemp('driver', .5); break
      case 'driver-down': v.stepTemp('driver', -.5); break
      case 'passenger-up': v.stepTemp('passenger', .5); break
      case 'passenger-down': v.stepTemp('passenger', -.5); break
      case 'driver-seat': v.cycleSeatHeat('driver'); break
      case 'passenger-seat': v.cycleSeatHeat('passenger'); break
      case 'defrost': v.setClimate({ frontDefrost: !v.climate.frontDefrost }); break
      case 'heater': v.setClimate({ rearDefrost: !v.climate.rearDefrost }); break
      case 'play': media.togglePlay(); break
      case 'next': media.skip(1); break
      case 'previous': media.skip(-1); break
      case 'favorite': setFavorite(x => !x); break
      case 'volume-up': media.setVolume(media.volume + 1); break
      case 'volume-down': media.setVolume(media.volume - 1); break
      case 'volume': ui.toggleOverlay('volume'); break
      case 'climate': ui.toggleOverlay('climate'); break
      case 'camera': ui.toggleOverlay('camera'); break
      case 'cabin': ui.toggleOverlay('cabin'); break
      case 'settings': ui.toggleOverlay('vehicle'); break
      case 'map': ui.toggleOverlay('map'); break
      case 'media': setExpanded(true); break
      case 'expand-music': setExpanded(x => !x); break
      case 'music-expand': setExpanded(true); break
      case 'music-collapse': setExpanded(false); break
      case 'zoom-in': mapControls.current?.zoomIn(); break
      case 'zoom-out': mapControls.current?.zoomOut(); break
      case 'north': mapControls.current?.north(); break
      case 'chargers': setChargers(x => !x); break
      case 'library': setLibrary(true); break
      // The Figma padlock must never bypass the existing authenticated incident flow.
      case 'lock-info': simulatedInfo('Khóa xe · MÔ PHỎNG', 'Thay đổi đầu vào tại bảng mô phỏng. Xác nhận xử lý sự cố vẫn ở điện thoại chủ xe.'); break
      case 'voice': simulatedInfo('Điều khiển giọng nói', 'Chưa tích hợp nhận dạng giọng nói. Không có lệnh nào được gửi.'); break
      case 'phone': ui.toggleOverlay('launcher'); break
    }
  }
  return (
    <div ref={container} className="tesla-viewport" data-testid="tesla-dashboard">
      <div className="tesla-artboard" data-testid="tesla-artboard" style={{ left: fit.x, top: fit.y, transform: `scale(${fit.scale})` }}>
        <TeslaNavigation controlsRef={mapControls} chargersVisible={chargers} />
        <div className="tesla-source-frame" data-map-open={ui.overlay === 'map'}>
          {ui.appearance === 'light' ? <Model3LightFrame model={model} onControl={control} /> : <Model3Frame model={model} onControl={control} />}
        </div>
        {!reference && <>
          <div className="tesla-cabin-slot">
            {ui.e2e ? <CabinChip /> : <button className="tesla-cabin-mock" type="button" onClick={() => ui.setOverlay('cabin')}><Shield size={28} /><span>CabinSentinel<span>MOCK PLAYGROUND · không qua backend</span></span></button>}
          </div>
          <div className="tesla-simulation-label">MÔ PHỎNG · SIMULATED · xe mô phỏng · map API OpenFreeMap</div>
        </>}
        {reference && <span className="tesla-reference-label">FIGMA REFERENCE · SIMULATED</span>}
        <button type="button" className="tesla-library-button" aria-label="Thư viện Tesla UI" onClick={() => setLibrary(true)}><BookOpen size={18} /></button>
        {children}
        <AnimatePresence>{library && <motion.section className="tesla-library" role="dialog" aria-modal="true" aria-label="Thư viện Tesla UI"
          initial={{ opacity: 0, y: 14, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .99 }}
          onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); e.currentTarget.querySelector<HTMLButtonElement>('button')?.focus() } }}>
          <header><div><h2>Tesla UI Component Library</h2><p>Layer gốc · 630 × 1080 · các component tham chiếu, dữ liệu mẫu</p></div><button type="button" autoFocus aria-label="Đóng thư viện" onClick={() => setLibrary(false)}><X /></button></header>
          <div className="tesla-library-cards">
            <figure><figcaption>Parked · Light</figcaption><div className="tesla-library-card"><LibraryLight /></div></figure>
            <figure><figcaption>Parked · Dark</figcaption><div className="tesla-library-card"><LibraryDark /></div></figure>
          </div>
          <p className="tesla-library-credit">Nguồn: Tesla Dashboard UI Component Library (Community) · Figma. Đây là bản tham chiếu thiết kế, không điều khiển xe.</p>
        </motion.section>}</AnimatePresence>
      </div>
    </div>
  )
}
