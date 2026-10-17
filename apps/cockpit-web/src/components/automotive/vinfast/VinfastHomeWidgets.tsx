import { useMemo, useState, type RefObject } from 'react'
import { Compass, LocateFixed, Maximize2, Minimize2, Music2, Pause, Play, Plus, Minus, ScanEye, Search, SkipBack, SkipForward, X, Zap, Box } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { NavigationMap, type MapControls } from '../navigation/NavigationMap'
import { remaining, useNavigation } from '../../../store/navigationStore'
import { useMedia } from '../../../store/mediaStore'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { PLACES, type Place } from '../../../lib/mapConfig'
import { distanceM, formatDistance, formatDuration } from '../../../lib/vehicleSimulation'
import { IC } from './parts'
import { useMode } from './useVinfast'
import { MAP_RECT, SKIN } from './skin'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

/** ONE persistent MapLibre canvas. Open/close only changes its rectangle, so the map never reloads or loses its view. */
export function VinfastMapLayer({ controls }: { controls: RefObject<MapControls | null> }) {
  const ui = useUi(), nav = useNavigation(), mode = useMode(), driving = useVehicle((s) => s.speed > 0.5)
  const open = ui.overlay === 'map'
  const [q, setQ] = useState('')
  const units = ui.units
  const results = useMemo(() => PLACES.filter((p) => !q || fold(`${p.name} ${p.sub}`).includes(fold(q))), [q])
  const r = nav.route ? remaining(nav.route, nav.along) : null
  const pick = (p: Place) => { setQ(''); void nav.setDestination(p) }
  const rect = open ? MAP_RECT[SKIN].open : MAP_RECT[SKIN].home
  return (
    <section className="vf-map" style={rect} aria-label="Bản đồ dẫn đường" data-testid="vf-map" data-open={open}>
      <NavigationMap dark={mode === 'dark' || SKIN === 'blue'} full showInterface={false} controlsRef={controls} palette="vinfast" />
      <div className="vf-map-ui">
        <button type="button" className="vf-search vf-glass vf-press" aria-label="Tìm điểm đến" aria-expanded={open && nav.searchOpen} onClick={() => { if (!open) ui.setOverlay('map'); nav.set({ searchOpen: open ? !nav.searchOpen : true }) }}>
          <Search {...IC} /><span className="vf-body">{nav.destination ? `${nav.destination.name} · ${nav.destination.sub}` : 'Tìm điểm đến'}</span>
        </button>
        <button type="button" className="vf-map-btn vf-glass vf-press" style={{ right: 20, top: 20 }} aria-label={open ? 'Thu nhỏ bản đồ' : 'Mở rộng bản đồ'} onClick={() => ui.setOverlay(open ? null : 'map')}>
          {open ? <Minimize2 {...IC} /> : <Maximize2 {...IC} />}</button>
        <button type="button" className={`vf-map-btn vf-glass vf-press`} style={{ right: 20, bottom: 20 }} aria-label="Về vị trí xe" aria-pressed={nav.follow} onClick={nav.recenter}><LocateFixed {...IC} /></button>
        {open && <div style={{ right: 20, top: 108, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" className="vf-map-btn vf-glass vf-press" aria-label="Phóng to" onClick={() => controls.current?.zoomIn()}><Plus {...IC} /></button>
          <button type="button" className="vf-map-btn vf-glass vf-press" aria-label="Thu nhỏ" onClick={() => controls.current?.zoomOut()}><Minus {...IC} /></button>
          <button type="button" className="vf-map-btn vf-glass vf-press" aria-label="Hướng bắc" onClick={() => controls.current?.north()}><Compass {...IC} /></button>
          <button type="button" className="vf-map-btn vf-glass vf-press" aria-label="2D / 3D" aria-pressed={nav.pitched} onClick={() => nav.set({ pitched: !nav.pitched })}><Box {...IC} /></button>
          <button type="button" className="vf-map-btn vf-glass vf-press" aria-label="Trạm sạc" onClick={() => nav.set({ searchOpen: true })}><Zap {...IC} /></button>
        </div>}
        <AnimatePresence>
          {open && nav.searchOpen && (
            <motion.div className="vf-search-sheet vf-glass" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0, transition: { duration: .22, ease: [.2, .8, .2, 1] } }} exit={{ opacity: 0, y: -8, transition: { duration: .16 } }}>
              {driving ? <p className="vf-note" style={{ padding: 12 }}>Đang chạy: không nhập chữ. Chọn một điểm gần đây.</p>
                : <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm địa điểm demo" aria-label="Tìm địa điểm demo" />}
              <p className="vf-cap" style={{ padding: '10px 12px 4px' }}>Địa điểm demo ở Hà Nội · không phải GPS hay trạm sạc còn chỗ thực</p>
              {results.map((p) => (
                <button key={p.id} type="button" className="vf-place vf-press" onClick={() => pick(p)}>
                  <Zap size={30} strokeWidth={1.6} style={{ opacity: p.kind === 'charger' ? 1 : .0 }} aria-hidden />
                  <span style={{ flex: 1 }}><span className="vf-body" style={{ display: 'block' }}>{p.name}</span><span className="vf-cap">{p.sub}</span></span>
                  <span className="vf-cap">{formatDistance(distanceM(nav.position, p), units)}</span>
                </button>))}
              {results.length === 0 && <p className="vf-note" style={{ padding: 12 }}>Không có địa điểm khớp.</p>}
            </motion.div>)}
        </AnimatePresence>
        {nav.status !== 'idle' && (
          <div className="vf-route vf-glass" data-testid="vf-route">
            {nav.status === 'routing' && <span className="vf-body">Đang tìm đường…</span>}
            {nav.status === 'arrived' && <span className="vf-body">Đã đến · {nav.destination?.name}</span>}
            {nav.status === 'active' && r && <>
              <span><b>{formatDuration(r.durationS, 'vi')}</b><span className="vf-cap">còn lại</span></span>
              <span><b>{formatDistance(r.distanceM, units)}</b><span className="vf-cap">quãng đường</span></span>
              <span className="vf-cap" style={{ flex: 1 }}>{nav.route?.source === 'osrm' ? 'Lộ trình: OSRM demo' : 'Lộ trình mô phỏng (không có OSRM)'}</span></>}
            <button type="button" className="vf-btn vf-press" aria-label="Kết thúc dẫn đường" onClick={nav.clearRoute}><X {...IC} />Kết thúc</button>
          </div>)}
        {nav.mapError && <div className="vf-offline vf-glass vf-cap" role="status">Bản đồ ngoại tuyến · cảnh báo cabin vẫn hoạt động</div>}
      </div>
    </section>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Multimedia widget 632 x 416. Titles and progress only: no audio is played or streamed (SIMULATED). */
export function VinfastMedia() {
  const m = useMedia(), ui = useUi()
  const cur = m.current()
  const SRC = { radio: 'Radio', bluetooth: 'Bluetooth', streaming: 'Trực tuyến', local: 'USB' } as const
  return (
    <section className="vf-widget vf-media vf-glass" aria-label="Đa phương tiện" data-testid="vf-media">
      <button type="button" className="vf-press" style={{ display: 'flex', gap: 24, alignItems: 'center', textAlign: 'left' }} aria-label="Mở trình phát đầy đủ" onClick={() => ui.setOverlay('media')}>
        <span className="vf-art" style={{ background: `linear-gradient(140deg, hsl(${cur.track.hue} 70% 48%), hsl(${(cur.track.hue + 50) % 360} 70% 32%))` }}><Music2 size={56} strokeWidth={1.4} aria-hidden /></span>
        <span style={{ minWidth: 0 }}><span className="vf-title" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.track.title}</span>
          <span className="vf-body" style={{ display: 'block', color: 'var(--vf-text2)' }}>{cur.track.artist}</span>
          <span className="vf-cap" style={{ display: 'block' }}>{SRC[m.source]} · {cur.station?.name ?? cur.device} · mô phỏng, không phát âm thanh</span></span>
      </button>
      <div className="vf-bar" role="progressbar" aria-label="Tiến trình bài" aria-valuemin={0} aria-valuemax={Math.round(cur.track.len)} aria-valuenow={Math.round(m.pos)}><i style={{ width: `${Math.min(100, (m.pos / cur.track.len) * 100)}%` }} /></div>
      <div className="vf-cap" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{mmss(m.pos)}</span><span>{mmss(cur.track.len)}</span></div>
      <div className="vf-transport">
        <button type="button" className="vf-btn is-quiet vf-icon-btn vf-press" aria-label="Bài trước" onClick={() => m.skip(-1)}><SkipBack {...IC} /></button>
        <button type="button" className="vf-play vf-press" aria-label={m.playing ? 'Tạm dừng' : 'Phát'} onClick={m.togglePlay}>{m.playing ? <Pause size={40} strokeWidth={1.6} /> : <Play size={40} strokeWidth={1.6} />}</button>
        <button type="button" className="vf-btn is-quiet vf-icon-btn vf-press" aria-label="Bài sau" onClick={() => m.skip(1)}><SkipForward {...IC} /></button>
      </div>
    </section>
  )
}

/** Icon crops from Aurora A14 ("Hệ thống Icon"), cropped as-is from the reference raster (public/vinfast/app-RC.png). */
const A14 = (id: string) => `${import.meta.env.BASE_URL}vinfast/app-${id}.png`
export const APP_IMG = { driveAids: '00', manual: '01', cast: '02', globe: '03', settings: '04', radio: '10', ev: '11', phone: '12', music: '13', pin: '14', auto: '20', camera: '22', tools: '23', voice: '24', carplay: '25' } as const
export const APP_CABIN_BG = 'linear-gradient(140deg,#0CC393,#2395FF)'
export function AppImg({ id, size = 100 }: { id: keyof typeof APP_IMG; size?: number }) {
  return <img src={A14(APP_IMG[id])} alt="" width={size} height={size} draggable={false} style={{ borderRadius: '22.5%', boxShadow: '0 10px 22px rgba(0,10,30,.28)', display: 'block' }} />
}

/** Launcher tiles (3 x 2) under the multimedia widget. */
export function VinfastLauncher() {
  const ui = useUi(), nav = useNavigation()
  const Tile = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className="vf-app vf-press" onClick={onClick} aria-label={label}>{children}{label}</button>)
  return (
    <nav className="vf-widget vf-launcher" aria-label="Ứng dụng" data-testid="vf-launcher">
      <Tile label="Camera" onClick={() => ui.setOverlay('camera')}><AppImg id="camera" /></Tile>
      <Tile label="Giám sát cabin" onClick={() => ui.setOverlay('cabin')}><span className="vf-appicon" style={{ background: APP_CABIN_BG }}><ScanEye size={52} strokeWidth={1.5} aria-hidden /></span></Tile>
      <Tile label="Điện thoại" onClick={() => ui.setOverlay('phone')}><AppImg id="phone" /></Tile>
      <Tile label="Âm nhạc" onClick={() => ui.setOverlay('media')}><AppImg id="music" /></Tile>
      <Tile label="Sạc / EV" onClick={() => { ui.setOverlay('map'); nav.set({ searchOpen: true }) }}><AppImg id="ev" /></Tile>
      <Tile label="Cài đặt" onClick={() => ui.setOverlay('vehicle')}><AppImg id="settings" /></Tile>
    </nav>
  )
}
