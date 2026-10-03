import { useEffect, useRef, useState } from 'react'
import { CameraApi, CameraApiError, getPrivacyPreview, validateCameraSnapshot, type CameraSnapshot } from './cameraApi'
import type { Locale } from './model'

type Phase = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR'
type Credentials = { id: string; token: string }

function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

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
  const [error, setError] = useState<string>()
  const [apiReady, setApiReady] = useState<boolean>()
  const vi = locale === 'vi'
  const active = phase === 'STARTING' || phase === 'RUNNING' || phase === 'STOPPING'

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
    while (generation === generationRef.current && credentialsRef.current && videoRef.current) {
      try {
        const capturedAt = new Date().toISOString()
        const blob = await capture(videoRef.current)
        const image = await apiRef.current.upload(blob)
        if (generation !== generationRef.current || !credentialsRef.current) return
        const next = await apiRef.current.call('camera_frame', [
          credentialsRef.current.id, credentialsRef.current.token, image, ++sequence, capturedAt,
        ])
        validateCameraSnapshot(next)
        if (generation !== generationRef.current) return
        if (mountedRef.current) { setSnapshot(next); setError(undefined) }
      } catch (reason) {
        if (generation !== generationRef.current) return
        const message = reason instanceof Error ? reason.message : 'Không detect được frame camera.'
        if (mountedRef.current) {
          setError(message)
          setSnapshot(current => current ? { ...current, preview: undefined } : current)
        }
        if (reason instanceof CameraApiError && ['STOPPED', 'SESSION_NOT_FOUND', 'UNAUTHORIZED', 'INVALID_RESPONSE'].includes(reason.code)) {
          if (mountedRef.current) setPhase('ERROR')
          releaseLocalCamera()
          return
        }
      }
      await delay(800)
    }
  }

  const start = async () => {
    if (!consent || active) return
    setError(undefined)
    setSnapshot(undefined)
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
  return <section className="surface live-camera-card">
    <div className="live-camera-heading"><div><span className="eyebrow">Live camera · YOLO</span><h2>{vi ? 'Bật camera để detect' : 'Turn on camera detection'}</h2></div><span className={`camera-phase phase-${phase.toLowerCase()}`}><i />{phase}</span></div>
    <div className="live-camera-layout">
      <div className="raw-camera-stage">
        <video ref={videoRef} muted playsInline hidden aria-hidden="true" />
        {privacyPreview && <img className="privacy-camera-preview" src={privacyPreview.data_url} alt={vi ? 'Preview camera đã che mặt' : 'Face-masked camera preview'} />}
        {!privacyPreview && <div className="camera-empty"><strong>{!active ? (vi ? 'Camera chưa bật' : 'Camera is off') : (vi ? 'Đang chờ preview đã che mặt' : 'Waiting for masked preview')}</strong><span>{!active ? (vi ? 'Cho phép camera rồi nhấn Bật camera.' : 'Grant camera access, then start detection.') : (vi ? 'Ảnh gốc không được hiển thị khi backend chưa trả preview an toàn.' : 'Raw video stays hidden until the backend returns a safe preview.')}</span></div>}
        <span className={`raw-camera-warning ${privacyPreview ? 'privacy-preview-ready' : ''}`}>{privacyPreview ? (vi ? 'PREVIEW ĐÃ CHE MẶT' : 'FACE-MASKED PREVIEW') : (vi ? 'PREVIEW KHÔNG KHẢ DỤNG' : 'PREVIEW UNAVAILABLE')}</span>
        {phase === 'RUNNING' && <span className="detect-live"><i />LIVE DETECT</span>}
        {privacyPreview && frame && snapshot.vision_detections.map((detection, index) => detection.bbox && <span className="detection-box" key={`${frame.sequence}-${index}`} style={{ left: `${detection.bbox[0] / frame.width * 100}%`, top: `${detection.bbox[1] / frame.height * 100}%`, width: `${(detection.bbox[2] - detection.bbox[0]) / frame.width * 100}%`, height: `${(detection.bbox[3] - detection.bbox[1]) / frame.height * 100}%` }}><b>{detection.class} {Math.round(detection.confidence * 100)}%</b></span>)}
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
      <label className="camera-consent"><input type="checkbox" checked={consent} disabled={active} onChange={event => setConsent(event.target.checked)} /><span>{vi ? 'Tôi đồng ý bật camera và gửi frame lên backend để detect. Frontend chỉ hiển thị preview đã che mặt do backend trả về.' : 'I consent to sending camera frames to the backend for detection. The frontend only displays the face-masked preview returned by the backend.'}</span></label>
      <div><button className="primary-button" disabled={!consent || active || apiReady === false} onClick={() => void start()}>{vi ? 'Bật camera' : 'Start camera'}</button><button className="secondary-button" disabled={!active} onClick={() => void stop()}>{vi ? 'Tắt camera' : 'Stop camera'}</button></div>
    </div>
    <p className="camera-api-state">Camera API: {apiReady === undefined ? 'checking…' : apiReady ? 'ready' : 'unavailable'} · {vi ? 'Ảnh không được frontend lưu vào storage.' : 'Frames are not stored in frontend storage.'}</p>
    {error && <p className="camera-error" role="alert">{error}</p>}
  </section>
}
