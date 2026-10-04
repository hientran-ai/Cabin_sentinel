import { useEffect, useRef, useState } from 'react'
import { CameraApi, CameraApiError, holdDetections, holdFaceMasks, getPrivacyPreview, validateCameraSnapshot, type CameraSnapshot, type PrivacyPreview } from './cameraApi'
import type { Locale } from './model'

type Phase = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR'
type Credentials = { id: string; token: string }

function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

// Face boxes come from a backend frame that is already a little old; widen each mask so a moving head stays covered.
const MASK_MARGIN = 0.35
type ShownDetections = { at: number; frame: NonNullable<CameraSnapshot['frame']>; detections: CameraSnapshot['vision_detections'] }
// Each frame needs three sequential round trips to the backend (upload, call, result): about 1.2 s from Vietnam to
// the Hugging Face Space, while inference itself is ~50 ms. Keeping several frames in flight brings box updates
// close to the capture rate instead of ~1 per second. The video itself always plays at the camera's own rate.
const CAPTURE_INTERVAL_MS = 140 // ~7 box updates per second
// 'rest' = one POST /api/v1/demo/analyze per frame (privacy=boxes); 'gradio' = upload + camera_frame SSE.
const CAMERA_TRANSPORT = import.meta.env.VITE_CAMERA_TRANSPORT === 'gradio' ? 'gradio' : 'rest'

const MAX_IN_FLIGHT = 8

async function capture(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) throw new CameraApiError('Camera chưa có hình ảnh.', 'NO_FRAME')
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 640 / video.videoWidth)
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new CameraApiError('Trình duyệt không tạo được frame camera.', 'CAPTURE_FAILED')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new CameraApiError('Không mã hóa được frame camera.', 'CAPTURE_FAILED')),
    'image/jpeg', 0.8,
  ))
}

export function LiveCameraPanel({ locale }: { locale: Locale }) {
  const apiRef = useRef(new CameraApi())
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const credentialsRef = useRef<Credentials | undefined>(undefined)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  const [phase, setPhase] = useState<Phase>('IDLE')
  const [consent, setConsent] = useState(false)
  const [snapshot, setSnapshot] = useState<CameraSnapshot>()
  // Recent previews/boxes, so one frame where the detector misses a face or person does not make overlays blink.
  const maskHistoryRef = useRef<PrivacyPreview[]>([])
  const lastDetectionsRef = useRef<ShownDetections | undefined>(undefined)
  const [error, setError] = useState<string>()
  const [apiReady, setApiReady] = useState<boolean>()
  // Re-renders the overlays as data ages. The tick itself is not used as the clock: a frame that arrives between
  // ticks would look captured in the future, fail the freshness check and flash the full-frame blur.
  const [, setTick] = useState(0)
  const vi = locale === 'vi'
  const active = phase === 'STARTING' || phase === 'RUNNING' || phase === 'STOPPING'

  // Re-evaluate mask freshness between backend results so stale face boxes fall back to a full blur.
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick(value => value + 1), 250)
    return () => clearInterval(timer)
  }, [active])

  const releaseLocalCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = undefined
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void apiRef.current.available().then(setApiReady).catch(() => setApiReady(false))
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      releaseLocalCamera()
      const credentials = credentialsRef.current
      credentialsRef.current = undefined
      if (credentials) {
        void apiRef.current.call('camera_stop', [credentials.id, credentials.token])
          .then(() => apiRef.current.call('camera_report', [credentials.id, credentials.token, 'STOPPED']))
          .catch(() => undefined)
      }
    }
  }, [])

  const runFrames = async (generation: number) => {
    let sequence = 0
    let applied = 0
    let inFlight = 0
    let fatal = false
    let pausedUntil = 0
    const alive = () => !fatal && generation === generationRef.current && Boolean(credentialsRef.current) && Boolean(videoRef.current)
    const sendFrame = async (seq: number, capturedAt: string) => {
      try {
        const video = videoRef.current
        if (!video) return
        const blob = await capture(video)
        let credentials = credentialsRef.current
        let next: CameraSnapshot
        if (CAMERA_TRANSPORT === 'rest') {
          if (!alive() || !credentials) return
          next = await apiRef.current.analyzeCpu(blob, credentials.id, credentials.token, seq, capturedAt)
        } else {
          const image = await apiRef.current.upload(blob)
          credentials = credentialsRef.current
          if (!alive() || !credentials) return
          next = await apiRef.current.call('camera_frame', [credentials.id, credentials.token, image, seq, capturedAt]) as unknown as CameraSnapshot
        }
        validateCameraSnapshot(next)
        if (!alive() || seq <= applied) return // a newer frame already landed
        applied = seq
        const preview = getPrivacyPreview(next)
        if (preview) {
          const latestAt = Date.parse(preview.captured_at)
          maskHistoryRef.current = [...maskHistoryRef.current.filter(item => latestAt - Date.parse(item.captured_at) <= 2_000), preview]
        }
        if (next.frame && next.vision_detections.some(detection => detection.bbox)) {
          lastDetectionsRef.current = { at: Date.now(), frame: next.frame, detections: next.vision_detections }
        }
        if (mountedRef.current) { setSnapshot(next); setError(undefined) }
      } catch (reason) {
        if (!alive()) return
        // With several frames in flight, one can reach the backend after a newer one; that frame is just dropped.
        if (reason instanceof CameraApiError && reason.code === 'OUT_OF_ORDER') return
        const message = reason instanceof Error ? reason.message : 'Không detect được frame camera.'
        pausedUntil = Date.now() + 800
        if (mountedRef.current) {
          setError(message)
        }
        if (reason instanceof CameraApiError && ['STOPPED', 'SESSION_NOT_FOUND', 'UNAUTHORIZED', 'INVALID_RESPONSE'].includes(reason.code)) {
          fatal = true
          if (mountedRef.current) setPhase('ERROR')
          releaseLocalCamera()
        }
      } finally {
        inFlight -= 1
      }
    }
    while (alive()) {
      if (inFlight < MAX_IN_FLIGHT && Date.now() >= pausedUntil) {
        inFlight += 1
        void sendFrame(++sequence, new Date().toISOString())
      }
      await delay(CAPTURE_INTERVAL_MS)
    }
  }

  const start = async () => {
    if (!consent || active) return
    setError(undefined)
    setSnapshot(undefined)
    maskHistoryRef.current = []
    lastDetectionsRef.current = undefined
    setPhase('STARTING')
    const generation = ++generationRef.current
    try {
      if (!await apiRef.current.available()) throw new CameraApiError('Backend chưa có đủ Camera API.')
      if (!navigator.mediaDevices?.getUserMedia) throw new CameraApiError('Trình duyệt không hỗ trợ camera hoặc trang chưa dùng HTTPS.')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
      })
      if (generation !== generationRef.current) { stream.getTracks().forEach(track => track.stop()); return }
      streamRef.current = stream
      if (!videoRef.current) throw new CameraApiError('Không tìm thấy vùng hiển thị camera.')
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      const created = await apiRef.current.call('camera_start', ['hot_locked', 'browser'])
      validateCameraSnapshot(created)
      if (typeof created.session_token !== 'string' || !created.session_token) throw new CameraApiError('Backend không cấp camera session token.')
      if (generation !== generationRef.current) {
        void apiRef.current.call('camera_stop', [created.session_id, created.session_token]).catch(() => undefined)
        return
      }
      credentialsRef.current = { id: created.session_id, token: created.session_token }
      const current = await apiRef.current.call('camera_status', [created.session_id, created.session_token])
      validateCameraSnapshot(current)
      setSnapshot(current)
      setPhase('RUNNING')
      void runFrames(generation)
    } catch (reason) {
      releaseLocalCamera()
      if (mountedRef.current) { setPhase('ERROR'); setError(reason instanceof Error ? reason.message : 'Không bật được camera.') }
    }
  }

  const stop = async () => {
    if (phase === 'STOPPING') return
    ++generationRef.current
    releaseLocalCamera()
    setPhase('STOPPING')
    const credentials = credentialsRef.current
    credentialsRef.current = undefined
    try {
      if (credentials) {
        await apiRef.current.call('camera_stop', [credentials.id, credentials.token])
        await apiRef.current.call('camera_report', [credentials.id, credentials.token, 'STOPPED'])
      }
      setPhase('STOPPED')
    } catch {
      setPhase('STOPPED')
      setError(vi ? 'Camera trên máy đã tắt nhưng backend chưa xác nhận dừng.' : 'The local camera stopped, but the backend did not confirm it.')
    }
  }

  const frame = snapshot?.frame
  const privacyPreview = snapshot ? getPrivacyPreview(snapshot) : undefined
  const previewUnavailable = snapshot?.preview?.status === 'UNAVAILABLE' ? snapshot.preview : undefined
  const now = Date.now()
  const faceMasks = active ? holdFaceMasks(maskHistoryRef.current, privacyPreview, now) : undefined
  const latestDetections = frame && snapshot?.vision_detections.some(detection => detection.bbox)
    ? { at: now, frame, detections: snapshot.vision_detections } : undefined
  const shownDetections = active ? holdDetections(latestDetections, lastDetectionsRef.current, now) : undefined
  const mirrored = (box: [number, number, number, number], width: number, height: number, margin = 0) => {
    const padX = (box[2] - box[0]) * margin, padY = (box[3] - box[1]) * margin
    const x1 = Math.max(0, box[0] - padX), x2 = Math.min(width, box[2] + padX)
    const y1 = Math.max(0, box[1] - padY), y2 = Math.min(height, box[3] + padY)
    // The local video is mirrored (selfie view), so x is flipped against the frame the backend saw.
    return { left: `${(width - x2) / width * 100}%`, top: `${y1 / height * 100}%`, width: `${(x2 - x1) / width * 100}%`, height: `${(y2 - y1) / height * 100}%` }
  }
  return <section className="surface live-camera-card">
    <div className="live-camera-heading"><div><span className="eyebrow">Live camera · YOLO</span><h2>{vi ? 'Bật camera để detect' : 'Turn on camera detection'}</h2></div><span className={`camera-phase phase-${phase.toLowerCase()}`}><i />{phase}</span></div>
    <div className="live-camera-layout">
      <div className="raw-camera-stage">
        <video ref={videoRef} muted playsInline className="camera-raw-preview" aria-label={vi ? 'Camera trực tiếp' : 'Live camera'} />
        {active && (faceMasks && privacyPreview
          ? faceMasks.map((box, index) => <span className="face-mask" key={`mask-${index}`} style={mirrored(box, privacyPreview.width, privacyPreview.height, MASK_MARGIN)} />)
          : <span className="privacy-full-blur" />)}
        {!active && <div className="camera-empty"><strong>{vi ? 'Camera chưa bật' : 'Camera is off'}</strong><span>{vi ? 'Cho phép camera rồi nhấn Bật camera.' : 'Grant camera access, then start detection.'}</span></div>}
        <span className={`raw-camera-warning ${faceMasks ? 'privacy-preview-ready' : ''}`}>{faceMasks ? (vi ? 'VIDEO TRỰC TIẾP · MẶT ĐÃ CHE' : 'LIVE VIDEO · FACES MASKED') : active ? (vi ? 'ĐANG LÀM MỜ TOÀN KHUNG · CHỜ DỮ LIỆU CHE MẶT' : 'FULL-FRAME BLUR · WAITING FOR FACE DATA') : (vi ? 'CAMERA ĐANG TẮT' : 'CAMERA OFF')}</span>
        {phase === 'RUNNING' && <span className="detect-live"><i />LIVE DETECT</span>}
        {shownDetections?.detections.map((detection, index) => detection.bbox && <span className="detection-box" key={`box-${index}`} style={mirrored(detection.bbox, shownDetections.frame.width, shownDetections.frame.height)}><b>{detection.class} {Math.round(detection.confidence * 100)}%</b></span>)}
      </div>
      <aside className="camera-result-panel">
        <div><small>Backend verdict</small><strong className={`camera-risk risk-text-${snapshot?.risk_level.toLowerCase() ?? 'error'}`}>{snapshot?.risk_level ?? 'NO DATA'}</strong></div>
        <dl><div><dt>{vi ? 'Phát hiện' : 'Detections'}</dt><dd>{snapshot?.vision_detections.length ?? 0}</dd></div><div><dt>Occupancy</dt><dd>{snapshot?.occupancy_state ?? 'UNKNOWN'}</dd></div><div><dt>{vi ? 'Mặt đã che' : 'Masked faces'}</dt><dd>{privacyPreview?.masked_regions ?? '—'}</dd></div><div><dt>YOLO / Privacy</dt><dd>{frame?.latency_ms == null ? '—' : `${Math.round(frame.latency_ms)} ms`}{privacyPreview ? ` / ${Math.round(privacyPreview.latency_ms)} ms` : ''}</dd></div></dl>
        <div className="camera-detections">{snapshot?.vision_detections.length ? snapshot.vision_detections.map((item, index) => <span key={`${item.class}-${index}`}>{item.class} · {Math.round(item.confidence * 100)}%</span>) : <span>NO DETECTION</span>}</div>
        {snapshot?.reason && <p>{snapshot.reason}</p>}
        {previewUnavailable && <p className="privacy-unavailable">{previewUnavailable.reason ?? (vi ? 'Backend chưa tạo được preview che mặt.' : 'The backend could not create a face-masked preview.')}</p>}
      </aside>
    </div>
    <div className="camera-controls-row">
      <label className="camera-consent"><input type="checkbox" checked={consent} disabled={active} onChange={event => setConsent(event.target.checked)} /><span>{vi ? 'Tôi đồng ý bật camera, hiển thị hình trực tiếp và gửi frame lên backend để detect. Camera sẽ hiện cảnh báo nếu backend chưa che được mặt.' : 'I consent to showing the live camera and sending frames to the backend for detection. A warning is shown while face masking is unavailable.'}</span></label>
      <div><button className="primary-button" disabled={!consent || active} onClick={() => void start()}>{vi ? 'Bật camera' : 'Start camera'}</button><button className="secondary-button" disabled={!active} onClick={() => void stop()}>{vi ? 'Tắt camera' : 'Stop camera'}</button></div>
    </div>
    <p className="camera-api-state">Camera API: {apiReady === undefined ? 'checking…' : apiReady ? 'ready' : (vi ? 'sẽ thử lại khi bật camera' : 'will retry on start')} · {vi ? 'Ảnh không được frontend lưu vào storage.' : 'Frames are not stored in frontend storage.'}</p>
    {error && <p className="camera-error" role="alert">{error}</p>}
  </section>
}
