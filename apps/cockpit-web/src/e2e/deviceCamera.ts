// The camera of the device that opened this page. The browser owns it: a Cloudflare Worker cannot reach it, so the chain is
//   getUserMedia -> MediaStream -> <video> (preview) -> [optional: JPEG frames -> backend, see capture.ts]
// This module only owns the stream and its lifecycle. It never uploads anything.
import { create } from 'zustand'
import { classifyCameraError, type DevicePhase } from './sourceModel'

export type Facing = 'user' | 'environment'

interface DeviceCameraState {
  phase: DevicePhase
  facing: Facing
  /** more than one camera is available, so "switch camera" can do something */
  canFlip: boolean
  title: string | null
  hint: string | null
  retry: boolean
  /** bumps on every new stream so a <video> knows to rebind */
  streamId: number
}

const IDLE = { phase: 'idle' as DevicePhase, title: null, hint: null, retry: false }
export const useDeviceCamera = create<DeviceCameraState>(() => ({ ...IDLE, facing: 'user', canFlip: false, streamId: 0 }))

let stream: MediaStream | null = null
/** Every start/stop bumps this. A getUserMedia answer that arrives for an older number is discarded and its tracks stopped,
 *  which is what keeps "tap camera, tap sample, permission granted late" from leaving a live camera behind. */
let epoch = 0

export const getDeviceStream = () => stream

function release() {
  if (stream) { stream.getTracks().forEach((t) => { t.onended = null; t.stop() }); stream = null }
}

/** Binds a stream to a <video>: muted + playsInline are what let iOS Safari and autoplay policies show it, play() covers the rest. */
export function attachStream(video: HTMLVideoElement, s: MediaStream | null) {
  if (video.srcObject !== s) video.srcObject = s
  if (!s) return
  video.muted = true; video.playsInline = true; video.autoplay = true
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '')
  void video.play().catch(() => { /* autoplay refusal: the element has autoplay + muted and starts on its own once visible */ })
}

function nameOf(e: unknown): string { return typeof e === 'object' && e && 'name' in e ? String((e as { name: unknown }).name) : 'Error' }

async function open(facing: Facing): Promise<MediaStream> {
  const md = navigator.mediaDevices
  try {
    return await md.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
  } catch (e) {
    // a camera that cannot satisfy the hints (some desktops, some Android) still works with no constraints at all
    if (nameOf(e) === 'OverconstrainedError' || nameOf(e) === 'ConstraintNotSatisfiedError') return md.getUserMedia({ video: true, audio: false })
    throw e
  }
}

/** Must be called from a user gesture (a tap). Returns the stream, or null when it failed or was cancelled by a newer call. */
export async function startDeviceCamera(facing?: Facing): Promise<MediaStream | null> {
  const want = facing ?? useDeviceCamera.getState().facing
  release()
  const mine = ++epoch
  if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) { fail('InsecureContext', want); return null }
  if (!navigator.mediaDevices?.getUserMedia) { fail('Unsupported', want); return null }
  useDeviceCamera.setState({ ...IDLE, phase: 'requesting', facing: want })
  let s: MediaStream
  try { s = await open(want) } catch (e) {
    if (mine !== epoch) return null
    fail(nameOf(e), want); return null
  }
  if (mine !== epoch) { s.getTracks().forEach((t) => t.stop()); return null }   // stopped or replaced while the permission prompt was open
  stream = s
  const track = s.getVideoTracks()[0]
  if (track) track.onended = () => {   // unplugged, revoked in browser settings, or taken by another app
    if (stream !== s) return
    release(); epoch += 1
    useDeviceCamera.setState({ phase: 'error', title: 'Camera đã ngắt', hint: 'Camera bị rút ra, bị thu hồi quyền hoặc ứng dụng khác đã chiếm. Bấm Thử lại.', retry: true, streamId: useDeviceCamera.getState().streamId + 1 })
  }
  const actual = track?.getSettings?.().facingMode
  useDeviceCamera.setState((st) => ({ ...IDLE, phase: 'live', facing: actual === 'user' || actual === 'environment' ? actual : want, streamId: st.streamId + 1 }))
  void countCameras().then((n) => { if (mine === epoch) useDeviceCamera.setState({ canFlip: n > 1 }) })
  return s
}

async function countCameras(): Promise<number> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length } catch { return 0 }
}

function fail(name: string, facing: Facing) {
  const f = classifyCameraError(name)
  useDeviceCamera.setState((st) => ({ phase: f.phase, title: f.title, hint: f.hint, retry: f.retry, facing, canFlip: false, streamId: st.streamId + 1 }))
}

/** Stops every track and returns to idle. Safe to call any time, including while the permission prompt is still open. */
export function stopDeviceCamera() {
  epoch += 1
  release()
  useDeviceCamera.setState((st) => ({ ...IDLE, canFlip: false, streamId: st.streamId + 1 }))
}

/** Front <-> back. On failure the previous camera is NOT silently kept: the screen says what happened. */
export async function flipDeviceCamera(): Promise<MediaStream | null> {
  const next: Facing = useDeviceCamera.getState().facing === 'user' ? 'environment' : 'user'
  return startDeviceCamera(next)
}

// iOS Safari keeps the camera light on for a page that is only hidden; leave nothing running when the page goes away.
if (typeof addEventListener === 'function') addEventListener('pagehide', () => { if (stream) stopDeviceCamera() })
