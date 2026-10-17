import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl'
import { Compass, LocateFixed, Minus, Plus, Box, Zap } from 'lucide-react'
import { Crosshair, SignOut } from '@phosphor-icons/react'
import { useNavigation } from '../../../store/navigationStore'
import { useT } from '../../../store/uiStore'
import { CHARGERS, START, mapStyle } from '../../../lib/mapConfig'
import { NavigationSearch } from './NavigationSearch'
import { RouteInformation } from './RouteInformation'

// MapLibre 6 requires an explicit bundled worker URL in Vite production builds.
maplibregl.setWorkerUrl(workerUrl)

export interface MapControls { zoomIn(): void; zoomOut(): void; north(): void }

const ROUTE_LAYERS = (accent: string) => [
  { id: 'route-casing', type: 'line' as const, source: 'route', layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const }, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 } },
  { id: 'route-line', type: 'line' as const, source: 'route', layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const }, paint: { 'line-color': accent, 'line-width': 6 } },
]

function carMarkerEl() {
  const el = document.createElement('div')
  el.className = 'cx-car-marker'
  el.innerHTML = '<svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="var(--cx-accent)" opacity=".18"/><path d="M20 6 30 32 20 26 10 32Z" fill="var(--cx-accent)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>'
  return el
}

/** Layer 5. Real map tiles (OpenFreeMap, no key); the route comes from OSRM's demo server or a deterministic mock. */
export function NavigationMap({ dark, full = false, showInterface = true, chargersVisible = true, controlsRef, palette = 'default' }: { dark: boolean; full?: boolean; showInterface?: boolean; chargersVisible?: boolean; controlsRef?: Ref<MapControls>; palette?: 'default' | 'vinfast' }) {
  if (import.meta.env.DEV && location.search.includes('nomap')) return null
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const car = useRef<Marker | null>(null), dest = useRef<Marker | null>(null)
  const chargers = useRef<Marker[]>([])
  useImperativeHandle(controlsRef, () => ({
    zoomIn: () => map.current?.zoomIn({ duration: 300 }),
    zoomOut: () => map.current?.zoomOut({ duration: 300 }),
    north: () => map.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 }),
  }), [])
  const [bearing, setBearing] = useState(0)
  const [ready, setReady] = useState(false)
  const nav = useNavigation()
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--cx-accent').trim() || '#2C6BED'

  // create once
  useEffect(() => {
    if (!box.current) return
    let m: MlMap
    try {
      m = new maplibregl.Map({ container: box.current, style: mapStyle(dark ? 'dark' : 'light', palette), center: [START.lng, START.lat], zoom: 14.2, attributionControl: { compact: true }, pitchWithRotate: true, dragRotate: true, fadeDuration: 0, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25) })
    } catch { useNavigation.getState().set({ mapError: true }); return }
    map.current = m
    if (import.meta.env.DEV) { (window as unknown as { __map: MlMap }).__map = m; m.on('error', (e) => console.warn('[map]', e.error?.message ?? e)) }
    m.on('error', (e) => { if (String(e.error?.message || '').match(/fetch|network|Failed|tiles|worker|NetworkError/i)) useNavigation.getState().set({ mapError: true }) })
    m.on('load', () => useNavigation.getState().set({ mapError: false }))
    m.on('rotate', () => setBearing(m.getBearing()))
    m.on('dragstart', () => useNavigation.getState().set({ follow: false }))
    const addRoute = () => {
      if (!m.getSource('route')) m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      for (const l of ROUTE_LAYERS(accent)) if (!m.getLayer(l.id)) m.addLayer(l)
      syncRoute()
      setReady(true)
    }
    m.on('style.load', addRoute)
    car.current = new maplibregl.Marker({ element: carMarkerEl(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([START.lng, START.lat]).addTo(m)
    for (const c of CHARGERS) {
      const el = document.createElement('div'); el.className = 'cx-charger-marker'; el.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="var(--cx-ok)"/></svg>${c.id === 'charger-tc' ? '4/6' : '2/4'}`
      el.title = `${c.name} · ${c.sub}`
      chargers.current.push(new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(m))
    }
    // panes resize (1/3 ↔ 2/3, parked ↔ driving); maplibre only tracks the window by itself
    const ro = new ResizeObserver(() => m.resize()); ro.observe(box.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null; chargers.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const marker of chargers.current) marker.getElement().style.visibility = chargersVisible ? 'visible' : 'hidden'
  }, [chargersVisible])

  // theme change: new style, then the route layers come back via style.load
  const firstTheme = useRef(true)
  useEffect(() => {
    if (firstTheme.current) { firstTheme.current = false; return }      // the map was created with this theme already
    map.current?.setStyle(mapStyle(dark ? 'dark' : 'light', palette))
  }, [dark])

  function syncRoute() {
    const m = map.current
    const s = useNavigation.getState()
    const src = m?.getSource('route') as GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features: s.route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: s.route.coords.map((c) => [c.lng, c.lat]) } }] : [] })
  }
  useEffect(() => { if (ready) syncRoute() }, [nav.route, ready])

  // destination marker + fit the route once it arrives
  useEffect(() => {
    const m = map.current
    if (!m) return
    dest.current?.remove(); dest.current = null
    if (nav.destination) {
      const el = document.createElement('div'); el.className = 'cx-dest-marker'
      dest.current = new maplibregl.Marker({ element: el }).setLngLat([nav.destination.lng, nav.destination.lat]).addTo(m)
    }
    if (nav.route) {
      const b = new maplibregl.LngLatBounds()
      nav.route.coords.forEach((c) => b.extend([c.lng, c.lat]))
      m.fitBounds(b, { padding: { top: 120, bottom: 220, left: 80, right: 80 }, duration: 700, maxZoom: 15.5 })
      useNavigation.getState().set({ follow: false })
      setTimeout(() => useNavigation.getState().set({ follow: true }), 2500)
    }
  }, [nav.destination, nav.route])

  // vehicle marker; camera follows while driving unless the user panned
  useEffect(() => {
    car.current?.setLngLat([nav.position.lng, nav.position.lat]).setRotation(nav.heading)
    const m = map.current
    if (m && nav.follow) m.easeTo({ center: [nav.position.lng, nav.position.lat], duration: 300, ...(nav.pitched ? { bearing: nav.heading } : {}) })
  }, [nav.position, nav.heading, nav.follow, nav.pitched])
  useEffect(() => {
    const m = map.current
    if (m) m.easeTo({ center: [nav.position.lng, nav.position.lat], zoom: Math.max(m.getZoom(), 14), duration: 500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.recenterNonce])
  useEffect(() => { map.current?.easeTo({ pitch: nav.pitched ? 55 : 0, bearing: nav.pitched ? nav.heading : 0, duration: 400 }) }, [nav.pitched]) // eslint-disable-line react-hooks/exhaustive-deps

  const btn = 'cx-btn h-[4rem] w-[4rem] su-black text-white'
  return (
    <section aria-label={t('navigation')} className="relative h-full w-full overflow-hidden" data-map-state={nav.mapError ? 'error' : ready ? 'ready' : 'loading'}>
      <div className="absolute inset-0"><div ref={box} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /></div>
      {nav.mapError && <div className="absolute inset-x-0 top-14 mx-auto w-fit rounded-full bg-surface px-4 py-1.5 text-sm text-text-2 shadow">{t('mapOffline')}</div>}
      {showInterface && <div data-nav-search className={`absolute z-10 flex flex-col gap-2 ${full ? 'left-[1.5rem] top-[3.6rem] w-[40rem]' : 'inset-x-[1.25rem] top-[3.6rem]'}`}>
        <NavigationSearch />
        <RouteInformation />
      </div>}
      {/* exit navigation, bottom-left as in the kit (120 x 100, black) */}
      {showInterface && nav.status !== 'idle' && <button data-nav-end type="button" onClick={nav.clearRoute} className="su-black absolute bottom-[1.5rem] left-[1.25rem] z-10 flex h-[6.25rem] w-[7.5rem] flex-col items-center justify-center gap-1 text-white">
        <SignOut size="2.6rem" weight="bold" className="rotate-180" /><span className="t-body text-white/50">{t('endRoute')}</span></button>}
      {showInterface && !full && <button type="button" className={`${btn} absolute bottom-[1.5rem] right-[1.25rem] z-10 ${nav.follow ? 'is-on' : ''}`} aria-label={t('recenter')} onClick={nav.recenter}><Crosshair size="2rem" weight="bold" /></button>}
      {showInterface && full && <div data-nav-tools className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
        <button type="button" className={btn} aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size="1.7rem" /></button>
        <button type="button" className={btn} aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size="1.7rem" /></button>
        <button type="button" className={btn} aria-label="North up" title="N" onClick={() => map.current?.easeTo({ bearing: 0 })}>
          <Compass size="1.7rem" style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 150ms' }} />
        </button>
        <button type="button" className={`${btn} ${nav.pitched ? 'is-on' : ''}`} aria-pressed={nav.pitched} aria-label="2D / 3D" onClick={() => nav.set({ pitched: !nav.pitched })}><Box size="1.6rem" /></button>
        <button type="button" className={`${btn} ${nav.follow ? 'is-on' : ''}`} aria-label={t('recenter')} title={t('recenter')} onClick={nav.recenter}><LocateFixed size="1.7rem" /></button>
        <button type="button" className={btn} aria-label={t('charger')} title={t('charger')} onClick={() => nav.set({ searchOpen: true })}><Zap size="1.6rem" /></button>
      </div>}
    </section>
  )
}
