import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT } from '../../../store/uiStore'
import type { CameraView } from '../../../types/vehicle'
import { Sheet } from '../ui'
import { useCabin } from '../../../store/cabinStore'

const VIEWS: CameraView[] = ['front', 'rear', 'left', 'right', 'cabin']
type Feed = { kind: 'device'; stream: MediaStream } | { kind: 'sample' } | { kind: 'synthetic' }

/** Synthetic road picture for exterior views when no camera is available. Clearly labelled as such. */
function SyntheticRoad({ view }: { view: CameraView }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    let raf = 0, offset = 0, last = performance.now()
    const draw = (now: number) => {
      const dt = (now - last) / 1000; last = now
      const speed = useVehicle.getState().speed
      offset = (offset + (speed / 3.6) * dt * 40) % 80
      const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio)
      g.fillStyle = '#7d93a8'; g.fillRect(0, 0, w, h * 0.45)
      g.fillStyle = '#3b3f44'; g.fillRect(0, h * 0.45, w, h)
      const vx = view === 'left' ? w * 0.25 : view === 'right' ? w * 0.75 : w / 2
      g.strokeStyle = '#e8e8e8'; g.lineWidth = 4 * devicePixelRatio
      for (const side of [-1, 1]) { g.beginPath(); g.moveTo(vx + side * w * 0.04, h * 0.45); g.lineTo(vx + side * w * 0.6, h); g.stroke() }
      g.setLineDash([30 * devicePixelRatio, 50 * devicePixelRatio]); g.lineDashOffset = -offset * devicePixelRatio
      g.beginPath(); g.moveTo(vx, h * 0.45); g.lineTo(vx, h); g.stroke(); g.setLineDash([])
      if (view === 'rear') {                      // parking guide lines
        for (const [col, y] of [['#2fbf5b', 0.6], ['#e5b93a', 0.75], ['#e04a4a', 0.9]] as const) {
          g.strokeStyle = col; g.lineWidth = 5 * devicePixelRatio; const half = w * (0.12 + (y - 0.6) * 0.5)
          g.beginPath(); g.moveTo(w / 2 - half, h * y); g.lineTo(w / 2 - half + w * 0.04, h * y); g.moveTo(w / 2 + half, h * y); g.lineTo(w / 2 + half - w * 0.04, h * y); g.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [view])
  return <canvas ref={ref} className="h-full w-full" aria-label="synthetic" />
}

/** Layer 10. Device camera only after an explicit tap; failures fall back to samples. The cabin view is park-only and blurred. */
export function CameraPanel({ presentation = 'default' }: { presentation?: 'default' | 'tesla' | 'vinfast' }) {
  const t = useT()
  const ui = useUi()
  const gear = useVehicle((s) => s.gear), speed = useVehicle((s) => s.speed)
  const view = ui.cameraView
  const [feed, setFeed] = useState<Feed>({ kind: 'synthetic' })
  const [note, setNote] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const video = useRef<HTMLVideoElement>(null)
  const cabinBlocked = view === 'cabin' && (gear !== 'P' || speed > 0.5)
  // the cabin sample follows the simulated Cabin Monitoring scenario (AI-generated child clip, or the empty cabin)
  const sample = useCabin((s) => (s.scenario === 'child_alone' ? 'ai-child.mp4' : 'empty-cabin.mp4'))

  useEffect(() => { if (feed.kind !== 'device') setFeed(view === 'cabin' ? { kind: 'sample' } : { kind: 'synthetic' }) }, [view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (feed.kind === 'device') feed.stream.getTracks().forEach((tr) => tr.stop()) }, [feed])
  useEffect(() => { if (video.current && feed.kind === 'device') video.current.srcObject = feed.stream }, [feed])

  async function startDevice(id?: string) {
    if (!navigator.mediaDevices?.getUserMedia) { setNote(t('cameraNone')); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : { facingMode: view === 'cabin' ? 'user' : 'environment' }, audio: false })
      if (feed.kind === 'device') feed.stream.getTracks().forEach((tr) => tr.stop())
      setFeed({ kind: 'device', stream }); setNote('')
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
      setDevices(all); setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
    } catch (e) {
      const name = (e as DOMException).name
      setNote(name === 'NotAllowedError' ? t('cameraDenied') : t('cameraNone'))
      setFeed(view === 'cabin' ? { kind: 'sample' } : { kind: 'synthetic' })
    }
  }
  const stopDevice = () => { if (feed.kind === 'device') feed.stream.getTracks().forEach((tr) => tr.stop()); setFeed(view === 'cabin' ? { kind: 'sample' } : { kind: 'synthetic' }) }

  const blur = view === 'cabin' ? 'blur(10px)' : undefined
  const content = <>
      <div data-camera-toolbar className="flex min-h-[5.5rem] items-center gap-3 pl-6 pr-24">
        <div className="cx-seg" role="radiogroup" aria-label={t('camera')}>
          {VIEWS.map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => ui.set({ cameraView: v })}>{t(v)}</button>)}
        </div>
        <span className="grow" />
        {devices.length > 1 && feed.kind === 'device' && (
          <select value={deviceId} onChange={(e) => void startDevice(e.target.value)} className="h-14 rounded-lg bg-surface-2 px-3 text-sm" aria-label="Camera device">
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
          </select>
        )}
        {feed.kind === 'device'
          ? <button type="button" className="cx-btn h-14 gap-2 px-4 text-sm" onClick={stopDevice}><VideoOff size="1.5rem" />{t('sample')}</button>
          : <button type="button" className="cx-btn h-14 gap-2 bg-surface-2 px-4 text-sm" disabled={cabinBlocked} onClick={() => void startDevice()}><Video size="1.5rem" />{t('useDevice')}</button>}
      </div>
      <div data-camera-feed className="relative mx-4 mb-4 min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
        {cabinBlocked ? (
          <div className="grid h-full place-items-center p-8 text-center t-label text-white/80">{t('cabinParkOnly')}</div>
        ) : feed.kind === 'device' ? (
          <video ref={video} autoPlay muted playsInline className="h-full w-full object-contain" style={{ filter: blur }} />
        ) : feed.kind === 'sample' ? (
          <video key="sample" src={`${import.meta.env.BASE_URL}samples/${sample}`} autoPlay muted loop playsInline className="h-full w-full object-contain" style={{ filter: blur }} />
        ) : <SyntheticRoad view={view} />}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {feed.kind !== 'device' && !cabinBlocked && <span className="cx-chip bg-black/60 text-white">{feed.kind === 'synthetic' ? t('syntheticFeed') : t('sample')}</span>}
          {view === 'cabin' && !cabinBlocked && <span className="cx-chip bg-black/60 text-white">{t('cabinBlurred')}</span>}
        </div>
        {note && <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-4 py-1.5 text-sm text-white">{note}</div>}
      </div>
    </>
  if (presentation === 'vinfast') return (
    <motion.section role="region" aria-label="Camera" className="vf-panel vf-glass vf-camera" data-testid="vf-camera"
      initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0, transition: { duration: .26, ease: [.2, .8, .2, 1] } }} exit={{ opacity: 0, x: 32, transition: { duration: .2, ease: [.4, 0, 1, 1] } }}>
      <button type="button" className="vf-close vf-press" aria-label="Đóng camera" onClick={() => ui.setOverlay(null)}><X size={32} strokeWidth={1.6} /></button>
      <header><h2 className="vf-title">Camera</h2></header>
      {content}
      <aside className="vf-cam-top" aria-label="Xe nhìn từ trên (minh hoạ, chưa có dữ liệu cảm biến)"><img src={`${import.meta.env.BASE_URL}vinfast/car-top-mirrors.png`} alt="" draggable={false} /><span>Chưa có dữ liệu cảm biến 360°</span></aside>
    </motion.section>)
  return presentation === 'tesla' ? <motion.section role="region" aria-label="Tesla Camera" className="tesla-camera" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}>
    {content}<button type="button" className="tesla-camera-close" aria-label="Đóng camera" onClick={()=>ui.setOverlay(null)}><X/></button>
  </motion.section> : <Sheet label={t('camera')} onClose={() => ui.setOverlay(null)}>{content}</Sheet>
}
