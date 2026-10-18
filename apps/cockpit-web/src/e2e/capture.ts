// Frame adapter: turns a playing clip, a still image or the device camera into JPEG observations and sends each
// one to the backend for real inference. Playing a clip on screen is not inference; only the frames posted here are.
import { api, ApiError } from './api'
import { DEVICE_UPLOAD_ENABLED } from './config'
import { attachStream, startDeviceCamera, stopDeviceCamera, useDeviceCamera } from './deviceCamera'
import { useE2e } from './store'
import { DEMO_SCENARIOS } from './demoCatalog'

export interface ClipDef { id: string; label: string; file: string; fallbackFile?: string; poster?: string; note: string }
export const CLIPS: ClipDef[] = [
  ...DEMO_SCENARIOS.map((s) => ({ id: s.id, label: `${s.id} ${s.title}`, file: s.file, fallbackFile: s.fallbackFile, poster: s.poster, note: s.objective })),
  { id: 'ai-child', label: 'Trẻ trong xe (clip mô phỏng AI)', file: 'ai-child.mp4', fallbackFile: 'ai-child.webm', note: 'Model gốc nhận ra "person"; không phân biệt trẻ em.' },
  { id: 'child-rear', label: 'Trẻ ngồi ghế an toàn quay lưng', file: 'child-rear.mp4', fallbackFile: 'child-rear.webm', note: 'Model gốc hay bỏ sót ca này (SR-01).' },
  { id: 'empty-cabin', label: 'Cabin trống', file: 'empty-cabin.mp4', fallbackFile: 'empty-cabin.webm', note: 'Không phát hiện chưa xác minh cabin trống.' },
]

const CAPTURE_HZ = 1
const MAX_WIDTH = 640
let video: HTMLVideoElement | null = null
let timer: ReturnType<typeof setInterval> | null = null
let inflight: number | null = null
let detachVideoEvents = () => {}
let lastMediaTime = -1
let counter = 0
let pausedUntil = 0
let noFeedSince = 0
let lastNoFeedPost = 0
let faultCounter = 0
/** Source-change counter. A reply for a frame captured under an older number is dropped, so a slow answer for the previous clip or
 *  camera can never overwrite what the newly chosen source shows ("old data over new camera"). */
let sourceEpoch = 0

/** The last frame this browser SENT and got an answer for: the exact picture the model analysed, with its geometry and source. */
/** masked: the picture is the backend's face-masked copy (YuNet + person fallback). false = the raw local frame (model without a masker). */
export interface ThumbInfo { url: string; kind: 'UPLOAD' | 'CLIP_FRAME' | 'DEVICE_CAMERA'; frameId: string; width: number; height: number; at: number; mediaTimeS?: number; masked: boolean; maskedRegions?: number; obscured?: boolean }
const thumbListeners = new Set<(url: string | null) => void>()
const infoListeners = new Set<(i: ThumbInfo | null) => void>()
let thumbInfo: ThumbInfo | null = null

export const getVideo = () => video
export const getThumbInfo = () => thumbInfo
export function onThumb(l: (u: string | null) => void) { thumbListeners.add(l); l(thumbInfo?.url ?? null); return () => { thumbListeners.delete(l) } }
export function onThumbInfo(l: (i: ThumbInfo | null) => void) { infoListeners.add(l); l(thumbInfo); return () => { infoListeners.delete(l) } }
function setThumb(blob: Blob | null, meta?: Omit<ThumbInfo, 'url'>) {
  if (thumbInfo) URL.revokeObjectURL(thumbInfo.url)
  thumbInfo = blob && meta ? { ...meta, url: URL.createObjectURL(blob) } : null
  thumbListeners.forEach((l) => l(thumbInfo?.url ?? null)); infoListeners.forEach((l) => l(thumbInfo))
}

/** The analysis video must stay IN the document: a detached <video> is paused by the browser, which silently stopped the analysis (and
 *  every result on screen) the moment the evidence dialog closed. When no dialog shows it, it lives in this off-screen host. */
function videoHost(): HTMLElement {
  let host = document.getElementById('cs-video-host')
  if (!host) {
    host = document.createElement('div'); host.id = 'cs-video-host'; host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;overflow:hidden;pointer-events:none'
    document.body.append(host)
  }
  return host
}
export function parkVideo(v: HTMLVideoElement) { const host = videoHost(); if (v.parentElement !== host) host.append(v) }

function ensureVideo(): HTMLVideoElement {
  if (!video) {
    video = document.createElement('video')
    // demo clips are ~10 s: loop them so the feed and the analysis keep going until the judge stops or changes the source
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'
    video.setAttribute('aria-hidden', 'true')
  }
  if (!video.isConnected) parkVideo(video)
  return video
}

export function stopSource() {
  sourceEpoch += 1; inflight = null
  pausedUntil = 0; noFeedSince = 0; lastNoFeedPost = 0
  detachVideoEvents(); detachVideoEvents = () => {}; lastMediaTime = -1
  if (timer) clearInterval(timer); timer = null
  stopDeviceCamera()
  if (video) { video.pause(); video.removeAttribute('src'); video.srcObject = null; video.load() }
  setThumb(null)
  useE2e.getState().setSource({ kind: 'none', label: '', running: false, localOnly: false, error: null, playerPhase: 'IDLE', runId: `r${sourceEpoch.toString(36)}`, scenarioId: undefined })
}

function frameId(session: string): string { counter += 1; return `${session.slice(0, 8)}-r${sourceEpoch.toString(36)}-${counter}-${Date.now().toString(36)}` }

/** Keep API metadata inside the existing source_label contract; the full display label stays in the UI. */
export function normalizeSourceLabel(label: string): string {
  return label.replace(/[^\p{L}\p{N}_. ()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 64)
}

function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_WIDTH / w)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
  const context = canvas.getContext('2d')
  if (!context || !w || !h) return Promise.resolve(null)
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

/** Backend without a face masker: never show the raw frame. Pixelate the whole picture on this device (no canvas filter, so it works on iOS Safari too). */
export async function obscure(blob: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(blob)
    const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(bmp.width / 26)); small.height = Math.max(1, Math.round(bmp.height / 26))
    small.getContext('2d')?.drawImage(bmp, 0, 0, small.width, small.height)
    const big = document.createElement('canvas'); big.width = bmp.width; big.height = bmp.height
    const ctx = big.getContext('2d'); if (!ctx) return null
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'
    ctx.drawImage(small, 0, 0, big.width, big.height)
    bmp.close()
    return await new Promise((r) => big.toBlob(r, 'image/jpeg', 0.7))
  } catch { return null }
}

async function send(blob: Blob, capturedAtPerf: number, kind: 'UPLOAD' | 'CLIP_FRAME' | 'DEVICE_CAMERA', label: string, encodeMs: number, size: { width: number; height: number; mediaTimeS?: number }) {
  const st = useE2e.getState(); const session = st.session
  if (!session) return
  if (blob.size > (st.service?.upload_limit_bytes ?? 5 * 1024 * 1024)) { st.setSource({ error: 'Khung vượt giới hạn 5 MB; không gửi vào AI.', playerPhase: 'ERROR' }); return }
  const mine = sourceEpoch
  const id = frameId(session.id)
  const age = performance.now() - capturedAtPerf
  const sentAt = performance.now()
  st.patchMetrics((m) => ({ sent: m.sent + 1, lastCaptureAgeMs: age, lastEncodeMs: encodeMs }))
  try {
    const reply = await api.observation(session, blob, { frameId: id, captureAgeMs: age, source: kind, label: normalizeSourceLabel(label), mediaTimeS: size.mediaTimeS })
    const rtt = performance.now() - sentAt
    if (mine !== sourceEpoch) return   // the source changed while this frame was in flight: its answer belongs to the old source
    if (reply.accepted) {
      // show the face-masked copy the backend made of this exact frame; only without a masker does the raw local frame stay on screen
      let shown: Blob | null = null, masked = false
      const pv = reply.preview
      if (pv?.status === 'PROCESSED' && pv.data_url) { try { shown = await (await fetch(pv.data_url)).blob(); masked = true } catch { shown = null } }
      if (!shown) shown = await obscure(blob)   // no masker (or it failed): the raw frame is never displayed, only a pixelated copy
      if (mine !== sourceEpoch) return
      if (shown) setThumb(shown, { kind, frameId: id, width: size.width, height: size.height, at: Date.now(), mediaTimeS: size.mediaTimeS, masked, maskedRegions: pv?.masked_regions, obscured: !masked })
    }
    useE2e.getState().patchMetrics((m) => ({
      accepted: m.accepted + (reply.accepted ? 1 : 0), ignored: m.ignored + (reply.accepted ? 0 : 1), replayed: m.replayed + (reply.replayed ? 1 : 0),
      accTimes: reply.accepted ? [...m.accTimes.slice(-60), performance.now()] : m.accTimes, lastReply: reply, lastRttMs: rtt,
    }))
    useE2e.getState().setSource({ error: null })
  } catch (e) {
    if (mine !== sourceEpoch) return
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
  if (!source.running || !st.session || source.localOnly || st.vehicleDown) return   // an offline vehicle sends no frames and no status
  if (source.cameraFault) { void postStatus(source.cameraFault, 'SIMULATED_FAULT', 'camera fault switched on in the simulator'); return }
  if (inflight !== null || performance.now() < pausedUntil) { if (inflight !== null) st.patchMetrics((m) => ({ dropped: m.dropped + 1 })); return }
  const v = ensureVideo()
  if (v.readyState < 2 || v.videoWidth === 0 || v.paused && source.kind === 'clip') {
    noFeedSince ||= performance.now()
    if (performance.now() - noFeedSince > 2500 && performance.now() - lastNoFeedPost > 4000) { lastNoFeedPost = performance.now(); void postStatus('NO_FEED', 'REAL_ADAPTER', 'video element produced no frame') }
    return
  }
  noFeedSince = 0
  if (source.kind === 'clip' && v.currentTime === lastMediaTime) return
  lastMediaTime = v.currentTime
  const capturedMediaTime = v.currentTime
  const activeEpoch = sourceEpoch
  inflight = activeEpoch
  st.setSource({ playerPhase: 'PROCESSING' })
  try {
    const t0 = performance.now()
    st.patchMetrics((m) => ({ captured: m.captured + 1, capTimes: [...m.capTimes.slice(-60), t0] }))
    const mineEpoch = sourceEpoch
    const blob = await toJpeg(v, v.videoWidth, v.videoHeight)
    if (!blob) { st.patchMetrics((m) => ({ errors: m.errors + 1 })); return }
    if (mineEpoch !== sourceEpoch) return
    const scale = Math.min(1, MAX_WIDTH / v.videoWidth)
    await send(blob, t0, source.kind === 'device' ? 'DEVICE_CAMERA' : 'CLIP_FRAME', source.label, performance.now() - t0, { width: Math.round(v.videoWidth * scale), height: Math.round(v.videoHeight * scale), ...(source.kind === 'clip' ? { mediaTimeS: capturedMediaTime } : {}) })
  } finally {
    if (inflight === activeEpoch) inflight = null
    if (sourceEpoch === activeEpoch && useE2e.getState().source.running) useE2e.getState().setSource({ playerPhase: 'PLAYING' })
  }
}

function begin(kind: 'clip' | 'device', label: string) {
  if (timer) clearInterval(timer)
  noFeedSince = 0
  useE2e.getState().setSource({ kind, label, running: true, localOnly: false, error: null, runId: `r${sourceEpoch.toString(36)}` })
  timer = setInterval(() => void tick(), 1000 / CAPTURE_HZ)
  void tick()
}

export async function startClip(clip: ClipDef) {
  stopSource()
  const mine = sourceEpoch
  const v = ensureVideo()
  begin('clip', clip.label)
  useE2e.getState().setSource({ playerPhase: 'LOADING', scenarioId: clip.id.startsWith('DEMO-') ? clip.id : undefined })
  const choices = [
    ...(v.canPlayType('video/mp4; codecs="avc1.42E01E"') ? [clip.file] : []),
    ...(clip.fallbackFile && v.canPlayType('video/webm; codecs="vp9"') ? [clip.fallbackFile] : []),
  ]
  let index = 0
  let failed = false
  let watchdog: ReturnType<typeof setTimeout> | null = null
  const fail = (phase: 'ERROR' | 'UNSUPPORTED_CODEC' | 'SOURCE_UNAVAILABLE', message: string) => {
    if (mine !== sourceEpoch || failed) return
    failed = true
    if (watchdog) clearTimeout(watchdog)
    if (timer) clearInterval(timer); timer = null
    useE2e.getState().setSource({ running: false, playerPhase: phase, error: message })
    void postStatus('ERROR', 'REAL_ADAPTER', 'sample media could not produce a decoded frame')
  }
  const load = () => {
    if (mine !== sourceEpoch) return
    v.srcObject = null; v.src = `${import.meta.env.BASE_URL}samples/${choices[index]}`; v.load()
    if (watchdog) clearTimeout(watchdog)
    watchdog = setTimeout(() => fail('SOURCE_UNAVAILABLE', 'Không tải được nguồn video. Thử lại hoặc chọn tình huống khác.'), 15000)
    void v.play().catch((e: DOMException) => {
      if (mine !== sourceEpoch) return
      if (e.name === 'NotAllowedError') useE2e.getState().setSource({ playerPhase: 'READY', error: 'Trình duyệt cần bạn bấm Phát lại để phát video.' })
    })
  }
  const ready = () => {
    if (mine !== sourceEpoch || failed) return
    if (watchdog) clearTimeout(watchdog)
    useE2e.getState().setSource({ running: !v.paused, playerPhase: v.paused ? 'READY' : 'PLAYING' })
    if (!v.paused && !timer) timer = setInterval(() => void tick(), 1000 / CAPTURE_HZ)
  }
  const pause = () => {
    if (mine !== sourceEpoch || v.ended || failed || !v.paused) return
    if (timer) clearInterval(timer); timer = null
    useE2e.getState().setSource({ running: false, playerPhase: 'READY' })
    void postStatus('DISCONNECTED', 'REAL_ADAPTER', 'demo clip paused; observations stopped')
  }
  const error = () => { if (mine !== sourceEpoch) return; if (index + 1 < choices.length) { index += 1; load() } else fail(v.error?.code === 2 ? 'SOURCE_UNAVAILABLE' : 'ERROR', 'Không giải mã được clip; không có frame nào được coi là cabin trống.') }
  const ended = () => {
    if (mine !== sourceEpoch) return
    if (timer) clearInterval(timer); timer = null
    useE2e.getState().setSource({ running: false, playerPhase: 'ENDED' })
    void postStatus('DISCONNECTED', 'REAL_ADAPTER', 'demo clip ended; observations stopped')
  }
  v.addEventListener('loadeddata', ready); v.addEventListener('playing', ready); v.addEventListener('pause', pause); v.addEventListener('error', error); v.addEventListener('ended', ended)
  detachVideoEvents = () => { if (watchdog) clearTimeout(watchdog); v.removeEventListener('loadeddata', ready); v.removeEventListener('playing', ready); v.removeEventListener('pause', pause); v.removeEventListener('error', error); v.removeEventListener('ended', ended) }
  if (!choices.length) { fail('UNSUPPORTED_CODEC', 'Trình duyệt không hỗ trợ H.264 hoặc WebM/VP9. Chọn nguồn khác.'); return }
  load()
}

/** Reparenting a native video into the evidence panel can pause playback in some browser engines. Resume it there. */
export async function resumeManagedClip(): Promise<void> {
  const v = video, source = useE2e.getState().source
  if (!v || source.kind !== 'clip' || !v.paused || !v.currentSrc || !['READY', 'PLAYING'].includes(source.playerPhase ?? '')) return
  const mine = sourceEpoch
  try {
    await v.play()
    if (mine !== sourceEpoch) return
    useE2e.getState().setSource({ running: true, error: null, playerPhase: 'PLAYING' })
    if (!timer) timer = setInterval(() => void tick(), 1000 / CAPTURE_HZ)
    void tick()
  } catch (error) {
    if (mine === sourceEpoch && error instanceof DOMException && error.name === 'NotAllowedError') {
      useE2e.getState().setSource({ running: false, playerPhase: 'READY', error: 'Trình duyệt cần bạn bấm Phát lại để tiếp tục phân tích.' })
    }
  }
}

/** Starts the camera of this device from a user gesture. The picture is always shown locally. Frames go to the backend only when the
 *  build allows it (DEVICE_UPLOAD_ENABLED: localhost or an explicit opt-in, with the user's consent); on the hosted site they do not. */
export async function startDevice(opts: { previewOnly?: boolean; facing?: 'user' | 'environment' } = {}): Promise<void> {
  stopSource()
  const mine = sourceEpoch
  const st = useE2e.getState()
  const upload = DEVICE_UPLOAD_ENABLED && !opts.previewOnly
  if (upload && !st.source.consent) { st.setSource({ error: 'Cần đồng ý gửi khung hình tới máy chủ demo trước.' }); return }
  const s = await startDeviceCamera(opts.facing)
  if (mine !== sourceEpoch) return          // stopped, or another source chosen, while the permission prompt was open
  if (!s) {
    const cam = useDeviceCamera.getState()
    useE2e.getState().setSource({ kind: 'none', label: '', running: false, error: cam.title })
    if (upload) void postStatus('NO_FEED', 'REAL_ADAPTER', `camera ${cam.phase}`)
    return
  }
  if (!upload) { useE2e.getState().setSource({ kind: 'device', label: 'Camera của thiết bị', running: true, localOnly: true, error: null }); return }
  const v = ensureVideo(); v.srcObject = null; v.removeAttribute('src'); attachStream(v, s)
  begin('device', 'Camera của thiết bị')
}

/** Front/back switch while the camera is on. The analysis timer keeps running on the new stream when frames are being sent. */
export async function switchDeviceCamera(flip: () => Promise<MediaStream | null>): Promise<void> {
  const mine = sourceEpoch
  const s = await flip()
  if (mine !== sourceEpoch) return
  if (!s) { stopSource(); useE2e.getState().setSource({ error: useDeviceCamera.getState().title }); return }
  if (!DEVICE_UPLOAD_ENABLED) return
  const v = ensureVideo(); attachStream(v, s)
}

/** One still image = one observation. It cannot be re-sent as "new": a still has no later moment to capture. */
export async function sendStill(file: File) {
  stopSource()
  const mine = sourceEpoch
  const st = useE2e.getState()
  if (!st.session) return
  if (file.size > (st.service?.upload_limit_bytes ?? 5 * 1024 * 1024)) { st.setSource({ error: 'Ảnh vượt giới hạn 5 MB.' }); return }
  if (!/^image\/(jpeg|png)$/.test(file.type)) { st.setSource({ error: 'Chỉ nhận ảnh JPEG hoặc PNG.' }); return }
  try {
    const bmp = await createImageBitmap(file)
    try {
    const t0 = performance.now()
    if (bmp.width * bmp.height > 20_000_000) throw new Error('Image too large')
    const blob = await toJpeg(bmp, bmp.width, bmp.height)
    if (!blob) { st.setSource({ error: 'Không đọc được ảnh.' }); return }
    if (mine !== sourceEpoch) return
    st.setSource({ kind: 'upload', label: file.name.slice(0, 48), running: false, localOnly: false, error: null })
    st.patchMetrics((m) => ({ captured: m.captured + 1, capTimes: [...m.capTimes.slice(-60), t0] }))
    const sc = Math.min(1, MAX_WIDTH / bmp.width)
    await send(blob, t0, 'UPLOAD', file.name.replace(/[^\w .()-]/g, '_').slice(0, 48), performance.now() - t0, { width: Math.round(bmp.width * sc), height: Math.round(bmp.height * sc) })
    } finally { bmp.close() }
  } catch { st.setSource({ error: 'Ảnh hỏng hoặc không giải mã được.' }) }
}

export function setCameraFault(fault: null | 'BLOCKED' | 'DISCONNECTED') {
  const st = useE2e.getState()
  st.setSource({ cameraFault: fault })
  if (fault && !st.source.running) { st.setSource({ running: true, kind: st.source.kind === 'none' ? 'clip' : st.source.kind }); if (!timer) timer = setInterval(() => void tick(), 1000 / CAPTURE_HZ) }
}
