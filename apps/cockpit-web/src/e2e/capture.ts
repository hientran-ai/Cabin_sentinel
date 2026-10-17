// Frame adapter: turns a playing clip, a still image or the device camera into JPEG observations and sends each
// one to the backend for real inference. Playing a clip on screen is not inference; only the frames posted here are.
import { api, ApiError } from './api'
import { useE2e } from './store'

export interface ClipDef { id: string; label: string; file: string; note: string }
export const CLIPS: ClipDef[] = [
  { id: 'ai-child', label: 'Trẻ trong xe (clip mô phỏng AI)', file: 'ai-child.mp4', note: 'Model gốc nhận ra "person"; không phân biệt trẻ em.' },
  { id: 'child-rear', label: 'Trẻ ngồi ghế an toàn quay lưng', file: 'child-rear.mp4', note: 'Model gốc hay bỏ sót ca này (SR-01).' },
  { id: 'empty-cabin', label: 'Cabin trống', file: 'empty-cabin.mp4', note: 'Không có người hoặc thú.' },
]

const CAPTURE_HZ = 1
const MAX_WIDTH = 640
let video: HTMLVideoElement | null = null
let stream: MediaStream | null = null
let timer: ReturnType<typeof setInterval> | null = null
let inflight = false
let counter = 0
let pausedUntil = 0
let noFeedSince = 0
let lastNoFeedPost = 0
let faultCounter = 0
let thumbUrl: string | null = null
const thumbListeners = new Set<(url: string | null) => void>()

export const getVideo = () => video
export function onThumb(l: (u: string | null) => void) { thumbListeners.add(l); l(thumbUrl); return () => { thumbListeners.delete(l) } }
function setThumb(blob: Blob | null) {
  if (thumbUrl) URL.revokeObjectURL(thumbUrl)
  thumbUrl = blob ? URL.createObjectURL(blob) : null
  thumbListeners.forEach((l) => l(thumbUrl))
}

function ensureVideo(): HTMLVideoElement {
  if (!video) {
    video = document.createElement('video')
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'
    video.setAttribute('aria-hidden', 'true')
  }
  return video
}

export function stopSource() {
  if (timer) clearInterval(timer); timer = null
  if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null
  if (video) { video.pause(); video.removeAttribute('src'); video.srcObject = null; video.load() }
  setThumb(null)
  useE2e.getState().setSource({ kind: 'none', label: '', running: false, error: null })
}

function frameId(session: string): string { counter += 1; return `${session.slice(0, 8)}-${counter}-${Date.now().toString(36)}` }

function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_WIDTH / w)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

async function send(blob: Blob, capturedAtPerf: number, kind: 'UPLOAD' | 'CLIP_FRAME' | 'DEVICE_CAMERA', label: string, encodeMs: number) {
  const st = useE2e.getState(); const session = st.session
  if (!session) return
  const id = frameId(session.id)
  const age = performance.now() - capturedAtPerf
  const sentAt = performance.now()
  st.patchMetrics((m) => ({ sent: m.sent + 1, lastCaptureAgeMs: age, lastEncodeMs: encodeMs }))
  try {
    const reply = await api.observation(session, blob, { frameId: id, captureAgeMs: age, source: kind, label })
    const rtt = performance.now() - sentAt
    setThumb(blob)
    useE2e.getState().patchMetrics((m) => ({
      accepted: m.accepted + (reply.accepted ? 1 : 0), ignored: m.ignored + (reply.accepted ? 0 : 1), replayed: m.replayed + (reply.replayed ? 1 : 0),
      accTimes: reply.accepted ? [...m.accTimes.slice(-60), performance.now()] : m.accTimes, lastReply: reply, lastRttMs: rtt,
    }))
    useE2e.getState().setSource({ error: null })
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      pausedUntil = performance.now() + (e.retryAfterS ?? 1) * 1000
      useE2e.getState().patchMetrics((m) => ({ dropped: m.dropped + 1 }))
      useE2e.getState().setSource({ error: e.detail.includes('busy') ? 'Máy chủ đang bận, bỏ qua khung này.' : e.detail })
    } else {
      useE2e.getState().patchMetrics((m) => ({ errors: m.errors + 1 }))
      useE2e.getState().setSource({ error: e instanceof ApiError ? e.detail : 'Không gửi được khung hình (mất kết nối)' })
    }
  }
}

async function postStatus(status: 'BLOCKED' | 'DISCONNECTED' | 'NO_FEED' | 'ERROR', origin: 'REAL_ADAPTER' | 'SIMULATED_FAULT', reason: string) {
  const session = useE2e.getState().session
  if (!session) return
  faultCounter += 1
  try { await api.cameraStatus(session, { frame_id: `st-${session.id.slice(0, 8)}-${faultCounter}-${Date.now().toString(36)}`, status, origin, reason }) } catch { /* the poll shows the connection state */ }
}

async function tick() {
  const st = useE2e.getState(); const { source } = st
  if (!source.running || !st.session) return
  if (source.cameraFault) { void postStatus(source.cameraFault, 'SIMULATED_FAULT', 'camera fault switched on in the simulator'); return }
  if (inflight || performance.now() < pausedUntil) { if (inflight) st.patchMetrics((m) => ({ dropped: m.dropped + 1 })); return }
  const v = ensureVideo()
  if (v.readyState < 2 || v.videoWidth === 0 || v.paused && source.kind === 'clip') {
    noFeedSince ||= performance.now()
    if (performance.now() - noFeedSince > 2500 && performance.now() - lastNoFeedPost > 4000) { lastNoFeedPost = performance.now(); void postStatus('NO_FEED', 'REAL_ADAPTER', 'video element produced no frame') }
    if (v.paused && source.kind === 'clip') void v.play().catch(() => undefined)
    return
  }
  noFeedSince = 0
  inflight = true
  try {
    const t0 = performance.now()
    st.patchMetrics((m) => ({ captured: m.captured + 1, capTimes: [...m.capTimes.slice(-60), t0] }))
    const blob = await toJpeg(v, v.videoWidth, v.videoHeight)
    if (!blob) { st.patchMetrics((m) => ({ errors: m.errors + 1 })); return }
    await send(blob, t0, source.kind === 'device' ? 'DEVICE_CAMERA' : 'CLIP_FRAME', source.label, performance.now() - t0)
  } finally { inflight = false }
}

function begin(kind: 'clip' | 'device', label: string) {
  if (timer) clearInterval(timer)
  noFeedSince = 0
  useE2e.getState().setSource({ kind, label, running: true, error: null })
  timer = setInterval(() => void tick(), 1000 / CAPTURE_HZ)
  void tick()
}

export async function startClip(clip: ClipDef) {
  stopSource()
  const v = ensureVideo()
  v.srcObject = null; v.src = `${import.meta.env.BASE_URL}samples/${clip.file}`
  try { await v.play() } catch { /* autoplay may need a gesture; tick() retries */ }
  begin('clip', clip.label)
}

export async function startDevice(): Promise<void> {
  stopSource()
  if (!useE2e.getState().source.consent) { useE2e.getState().setSource({ error: 'Cần đồng ý gửi khung hình tới máy chủ demo trước.' }); return }
  if (!navigator.mediaDevices?.getUserMedia) { useE2e.getState().setSource({ error: 'Trình duyệt này không có camera.' }); void postStatus('NO_FEED', 'REAL_ADAPTER', 'getUserMedia unavailable'); return }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
  } catch (e) {
    useE2e.getState().setSource({ error: `Không mở được camera: ${(e as DOMException).name}` })
    void postStatus('NO_FEED', 'REAL_ADAPTER', `camera ${(e as DOMException).name}`)
    return
  }
  const v = ensureVideo(); v.srcObject = stream; await v.play().catch(() => undefined)
  begin('device', 'Camera của thiết bị')
}

/** One still image = one observation. It cannot be re-sent as "new": a still has no later moment to capture. */
export async function sendStill(file: File) {
  stopSource()
  const st = useE2e.getState()
  if (!st.session) return
  if (!/^image\/(jpeg|png)$/.test(file.type)) { st.setSource({ error: 'Chỉ nhận ảnh JPEG hoặc PNG.' }); return }
  try {
    const bmp = await createImageBitmap(file)
    const t0 = performance.now()
    const blob = await toJpeg(bmp, bmp.width, bmp.height)
    if (!blob) { st.setSource({ error: 'Không đọc được ảnh.' }); return }
    st.setSource({ kind: 'upload', label: file.name.slice(0, 48), running: false, error: null })
    st.patchMetrics((m) => ({ captured: m.captured + 1, capTimes: [...m.capTimes.slice(-60), t0] }))
    await send(blob, t0, 'UPLOAD', file.name.replace(/[^\w .()-]/g, '_').slice(0, 48), performance.now() - t0)
  } catch { st.setSource({ error: 'Ảnh hỏng hoặc không giải mã được.' }) }
}

export function setCameraFault(fault: null | 'BLOCKED' | 'DISCONNECTED') {
  const st = useE2e.getState()
  st.setSource({ cameraFault: fault })
  if (fault && !st.source.running) { st.setSource({ running: true, kind: st.source.kind === 'none' ? 'clip' : st.source.kind }); if (!timer) timer = setInterval(() => void tick(), 1000 / CAPTURE_HZ) }
}
