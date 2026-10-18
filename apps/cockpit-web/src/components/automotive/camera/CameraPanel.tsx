import { useEffect, useRef } from 'react'
import { RefreshCw, SwitchCamera, Video, VideoOff, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT } from '../../../store/uiStore'
import type { CameraView } from '../../../types/vehicle'
import { Sheet } from '../ui'
import { useCabin } from '../../../store/cabinStore'
import { startDevice, stopSource, switchDeviceCamera } from '../../../e2e/capture'
import { attachStream, flipDeviceCamera, getDeviceStream, useDeviceCamera } from '../../../e2e/deviceCamera'

const VIEWS: CameraView[] = ['front', 'rear', 'left', 'right', 'cabin']

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

/** Layer 10. The device camera starts only after an explicit tap and is the SAME camera as the cabin monitor (one stream, one stop button).
 *  Here it is a local preview: nothing is sent anywhere. Failures say why and offer a retry; the sample / synthetic picture is only shown
 *  when no camera is on, and is labelled as such. No blur: the picture is either the user's own camera or a synthetic / sample clip. */
export function CameraPanel({ presentation = 'default' }: { presentation?: 'default' | 'tesla' | 'vinfast' }) {
  const t = useT()
  const ui = useUi()
  const gear = useVehicle((s) => s.gear), speed = useVehicle((s) => s.speed)
  const view = ui.cameraView
  const dev = useDeviceCamera()
  const video = useRef<HTMLVideoElement>(null)
  const live = dev.phase === 'live'
  const owns = useRef(false)   // this panel switched the camera on, so closing the panel switches it off (no camera left running unseen)
  const cabinBlocked = view === 'cabin' && (gear !== 'P' || speed > 0.5)
  // the cabin sample follows the simulated Cabin Monitoring scenario (AI-generated child clip, or the empty cabin)
  const sample = useCabin((s) => (s.scenario === 'child_alone' ? 'ai-child.mp4' : 'empty-cabin.mp4'))
  const facing = view === 'cabin' ? 'user' : 'environment'

  useEffect(() => {
    const v = video.current
    if (!v) return
    attachStream(v, live ? getDeviceStream() : null)
    return () => { v.srcObject = null }
  }, [live, dev.streamId])
  useEffect(() => () => { if (owns.current) stopSource() }, [])
  const begin = () => { owns.current = true; void startDevice({ previewOnly: true, facing }) }

  const content = <>
      <div data-camera-toolbar className="flex min-h-[5.5rem] items-center gap-3 pl-6 pr-24">
        <div className="cx-seg" role="radiogroup" aria-label={t('camera')}>
          {VIEWS.map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => ui.set({ cameraView: v })}>{t(v)}</button>)}
        </div>
        <span className="grow" />
        {live && dev.canFlip && <button type="button" className="cx-btn h-14 gap-2 bg-surface-2 px-4 text-sm" data-testid="camera-flip" onClick={() => void switchDeviceCamera(flipDeviceCamera)}><SwitchCamera size="1.5rem" />Đổi camera</button>}
        {live
          ? <button type="button" className="cx-btn h-14 gap-2 px-4 text-sm" data-testid="camera-stop" onClick={() => stopSource()}><VideoOff size="1.5rem" />Tắt camera</button>
          : <button type="button" className="cx-btn h-14 gap-2 bg-surface-2 px-4 text-sm" data-testid="camera-start" disabled={cabinBlocked || dev.phase === 'requesting'} onClick={begin}><Video size="1.5rem" />{dev.phase === 'requesting' ? 'Đang chờ cho phép…' : t('useDevice')}</button>}
      </div>
      <div data-camera-feed className="relative mx-4 mb-4 min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
        {cabinBlocked ? (
          <div className="grid h-full place-items-center p-8 text-center t-label text-white/80">{t('cabinParkOnly')}</div>
        ) : live ? (
          <video ref={video} autoPlay muted playsInline className="h-full w-full object-contain" data-testid="camera-live-video" />
        ) : view === 'cabin' ? (
          <video key="sample" src={`${import.meta.env.BASE_URL}samples/${sample}`} autoPlay muted loop playsInline className="h-full w-full object-contain" />
        ) : <SyntheticRoad view={view} />}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {live && <span className="cx-chip bg-red-600 text-white" data-testid="camera-live-chip">LIVE · camera của thiết bị</span>}
          {!live && !cabinBlocked && <span className="cx-chip bg-black/60 text-white">{view === 'cabin' ? `DEMO · ${t('sample')}` : t('syntheticFeed')}</span>}
        </div>
        {(dev.phase === 'requesting') && <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-4 py-1.5 text-sm text-white" role="status">Đang chờ bạn cho phép camera…</div>}
        {!live && dev.title && (
          <div className="absolute inset-x-4 bottom-3 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl bg-black/80 px-4 py-3 text-sm text-white" role="alert" data-testid="camera-error">
            <span className="min-w-0 flex-1"><b className="block">{dev.title}</b><span className="opacity-80">{dev.hint}</span></span>
            {dev.retry && <button type="button" className="cx-btn h-12 gap-2 bg-accent px-4 text-sm text-white" onClick={begin}><RefreshCw size="1.3rem" />Thử lại</button>}
          </div>)}
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
