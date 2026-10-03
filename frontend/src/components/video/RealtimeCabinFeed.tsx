import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, RefreshCw } from 'lucide-react'
import { CameraAPI, CAMERA_BASE_URL, adaptCameraState, isStaleCameraResult, type CameraSnapshot } from '../../api/camera'
import { CameraStream, type StreamStatus } from '../../api/cameraStream'
import { getPrivacyPreview } from '../../api/privacyPreview'
import { useAgent } from '../../store/AgentContext'
import type { AgentState, DemoScenario } from '../../types/agent'
import { CabinFeed } from './CabinFeed'

export function RealtimeCabinFeed({ state }: { state: AgentState }) {
  const { setCameraTracking, receiveCameraState, invalidateCameraState, analysisPending, registerCameraStop, receiveCameraControlState, effectiveDataAgeMs } = useAgent()
  const [available, setAvailable] = useState<boolean | undefined>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<StreamStatus>('IDLE')
  const [consent, setConsent] = useState(false)
  const [scenario, setScenario] = useState<DemoScenario>('hot_locked')
  const [snapshot, setSnapshot] = useState<CameraSnapshot>()
  const video = useRef<HTMLVideoElement>(null), preview = useRef<HTMLCanvasElement>(null)
  const processed = useRef<{ image: HTMLImageElement; sessionId: string; sequence: number } | undefined>(undefined)
  const result = useRef<CameraSnapshot | undefined>(undefined)
  const controller = useRef<CameraStream | undefined>(undefined)
  const mounted = useRef(true)
  const active = status === 'STARTING' || status === 'RUNNING' || status === 'STOPPING'
  const discover = useCallback(async () => {
    try { const ok = await new CameraAPI().available(); if (mounted.current) setAvailable(ok) }
    catch { if (mounted.current) { setAvailable(false); setError('Không đọc được camera API. Kiểm tra kết nối/backend URL.') } }
  }, [])
  useEffect(() => { mounted.current = true; void Promise.resolve().then(discover); return () => { mounted.current = false } }, [discover])

  const stop = useCallback(async () => {
    const current = controller.current
    if (!current) return
    setCameraTracking(false); invalidateCameraState()
    result.current = undefined; processed.current = undefined
    if (mounted.current) setSnapshot(undefined)
    try {
      const response = await current.stop()
      if (response && mounted.current) receiveCameraControlState(adaptCameraState(response))
      if (mounted.current) setError(undefined)
    }
    catch { if (mounted.current) setError('Camera trên máy đã đóng; backend chưa xác nhận dừng. Kết quả hiện tại unavailable.') }
  }, [setCameraTracking, invalidateCameraState, receiveCameraControlState])
  useEffect(() => {
    registerCameraStop?.(stop)
    const hide = () => { void stop() }
    const visibility = () => { if (document.hidden) hide() }
    window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', visibility); registerCameraStop?.(undefined); void stop() }
  }, [stop, registerCameraStop])

  useEffect(() => {
    if (!active) return
    const canvasAtMount = preview.current
    let animation = 0
    const paint = () => {
      const canvas = preview.current
      if (canvas) {
        const frame = result.current?.frame
        const useInference = result.current?.decision_current === true && frame && processed.current?.sequence === frame.sequence && processed.current?.sessionId === result.current?.session_id &&
          Date.now() - Date.parse(frame.captured_at) >= 0 && Date.now() - Date.parse(frame.captured_at) <= 3000
        const width = useInference ? frame.width : 640
        const height = useInference ? frame.height : 480
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        if (context) {
          context.fillStyle = '#273b3e'; context.fillRect(0, 0, width, height)
          if (useInference) {
            context.drawImage(processed.current!.image, 0, 0, width, height)
            context.strokeStyle = '#5ce9d3'; context.fillStyle = '#5ce9d3'; context.lineWidth = 3; context.font = '16px sans-serif'
            for (const detection of result.current!.vision_detections) {
              if (!detection.bbox) continue
              const [x1, y1, x2, y2] = detection.bbox
              context.strokeRect(x1, y1, x2 - x1, y2 - y1)
              context.fillText(`${detection.class} ${Math.round(detection.confidence * 100)}%`, Math.max(2, x1), Math.max(20, y1))
            }
          } else {
            context.fillStyle = '#ffffff'; context.font = '18px sans-serif'
            context.fillText('Chờ frame đã xử lý che mặt…', 32, height / 2)
          }
        }
      }
      animation = requestAnimationFrame(paint)
    }
    animation = requestAnimationFrame(paint)
    return () => { cancelAnimationFrame(animation); canvasAtMount?.getContext('2d')?.clearRect(0, 0, canvasAtMount.width, canvasAtMount.height) }
  }, [active])

  const capture = async (camera: HTMLVideoElement): Promise<Blob> => {
    if (!camera.videoWidth || !camera.videoHeight) throw new Error('Camera chưa có frame; không tạo evidence trống.')
    const canvas = document.createElement('canvas'), scale = Math.min(1, 640 / camera.videoWidth)
    canvas.width = Math.round(camera.videoWidth * scale); canvas.height = Math.round(camera.videoHeight * scale)
    const drawing = canvas.getContext('2d'); if (!drawing) throw new Error('Không xử lý được frame camera.')
    drawing.drawImage(camera, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không mã hóa được frame.')), 'image/jpeg', .8))
  }
  const start = async () => {
    if (!consent || !available || active || analysisPending || !video.current) return
    setError(undefined); setCameraTracking(true)
    const camera = new CameraStream({ video: video.current, capture,
      onState: next => {
        if (mounted.current) setStatus(next)
        if (next !== 'RUNNING') { result.current = undefined; processed.current = undefined; invalidateCameraState() }
        if (['STOPPED', 'STOPPED_UNCONFIRMED', 'DISCONNECTED', 'ERROR'].includes(next)) setCameraTracking(false)
      },
      onResult: value => {
        if (!mounted.current || isStaleCameraResult(result.current, value)) return
        try {
          const current = adaptCameraState(value)
          result.current = { ...value, decision_current: current.decisionCurrent === true }
          const privacy = getPrivacyPreview(value)
          if (privacy) {
            const image = new Image()
            image.onload = () => {
              if (mounted.current && result.current?.session_id === value.session_id && result.current.frame?.sequence === privacy.sequence &&
                image.naturalWidth === privacy.width && image.naturalHeight === privacy.height) {
                processed.current = { image, sessionId: value.session_id, sequence: privacy.sequence }
              }
            }
            image.src = privacy.data_url
          } else if (value.preview !== undefined || value.frame?.sequence !== processed.current?.sequence || value.session_id !== processed.current?.sessionId) {
            processed.current = undefined
          }
          setSnapshot(previous => value.preview === undefined && previous?.session_id === value.session_id && previous.frame?.sequence === value.frame?.sequence
            ? { ...value, preview: previous.preview } : value)
          receiveCameraState(current); setError(undefined)
        }
        catch { result.current = undefined; processed.current = undefined; invalidateCameraState('Invalid camera response; current decision unavailable.'); setError('Response camera không hợp lệ.') }
      },
      onError: failure => { result.current = undefined; processed.current = undefined; invalidateCameraState(); if (mounted.current) setError(failure.message) },
    })
    controller.current = camera
    try { await camera.start(scenario) }
    catch (failure) { setCameraTracking(false); if (mounted.current) setError(failure instanceof Error ? failure.message : 'Không mở được camera.') }
  }

  const currentFrame = snapshot?.frame && state.decisionCurrent === true && effectiveDataAgeMs <= 3000
  const privacyPreview = getPrivacyPreview(snapshot)
  const content = <div className="realtime-preview">
    <video ref={video} hidden muted playsInline aria-hidden="true" />
    <canvas ref={preview} hidden={!active} aria-label="Preview camera đã xử lý che mặt YuNet" />
    {!active && <div className="feed-message"><CameraOff /><strong>Camera {status === 'IDLE' ? 'chưa bật' : status}</strong><span>Chưa có nguồn realtime hiện tại.</span></div>}
    <span className="live-chip"><span />{currentFrame ? `YOLO · frame ${snapshot?.frame?.sequence}` : active ? 'CHỜ FRAME YOLO + YUNET' : 'CAMERA CHƯA BẬT'}</span>
  </div>
  return <CabinFeed state={state} realtimeContent={content} realtimeControls={<>
    <div className="camera-controls">
      <label>Xe mô phỏng<select aria-label="Camera vehicle scenario" value={scenario} disabled={active} onChange={event => setScenario(event.target.value as DemoScenario)}>
        <option value="hot_locked">Hot & locked · 40°C</option><option value="parked_locked">Parked & locked · 25°C</option><option value="normal">Normal driving</option>
      </select></label>
      <button className="button" disabled={!available || !consent || active || analysisPending} onClick={() => void start()}><Camera />Bật camera</button>
      <button className="button secondary" disabled={!active} onClick={() => void stop()}><CameraOff />Tắt camera</button>
      <button className="button secondary" disabled={active} onClick={() => void discover()}><RefreshCw />Kiểm tra lại API</button>
    </div>
    <label className="camera-consent"><input type="checkbox" checked={consent} disabled={active} onChange={event => setConsent(event.target.checked)} /> Tôi đồng ý gửi frame gốc từ camera tới backend {new URL(CAMERA_BASE_URL, window.location.href).origin} để YOLO nhận diện liên tục.</label>
    <p className="privacy-note">YuNet làm mờ các khuôn mặt phát hiện được trên preview; có thể bỏ sót mặt nhỏ hoặc bị che. Frame gốc được gửi tới backend để YOLO nhận diện. UI không lưu ảnh vào disk/storage; preview sẽ ẩn khi chưa xử lý, lỗi hoặc cũ.</p>
    {snapshot?.preview && <p>Privacy: {privacyPreview ? `${privacyPreview.detected_faces} mặt phát hiện · ${privacyPreview.masked_regions} vùng làm mờ` : 'Preview chưa có hoặc không còn hiệu lực.'}</p>}
    <p className="camera-status" role="status">Camera: {status} · {available === undefined ? 'Đang kiểm tra API…' : available ? 'Contract camera phù hợp' : 'Backend này chưa có 5 endpoint camera. Cần triển khai contract camera; upload ảnh vẫn dùng được.'}</p>
    {snapshot?.frame && <p>Frame {snapshot.frame.sequence} · capture {snapshot.frame.captured_at} · YOLO {typeof snapshot.frame.latency_ms === 'number' ? Math.round(snapshot.frame.latency_ms) : '—'}ms · {currentFrame ? 'Current backend result' : 'Historical / unavailable'} · không cam kết FPS.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>} />
}
