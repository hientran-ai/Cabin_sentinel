import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { V1CabinZone, V1DemoVehicle, V1VideoFrameResult } from '@cabinsentinel/contracts'
import { Link } from 'react-router-dom'
import { platformClient } from './data'
import { FRAME_INTERVAL_MS, MAX_IN_FLIGHT, SAMPLES, SEAT_STATE, boxFromDrag, expectation, isAlert, ms, nextZoneName, sampleUrl, summarize, type FrameRecord } from './cameraSim'
import { riskTone } from './demoStudio'
import { useLocale } from './i18n'

type Source = { kind: 'sample'; id: string } | { kind: 'upload'; url: string; name: string }
type Fault = 'none' | 'covered' | 'frozen'
const DEMO_STATUS_KEY = ['demo-status'] as const

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`
const boxStyle = (box: readonly number[]) => ({ left: pct(box[0]!), top: pct(box[1]!), width: pct(box[2]! - box[0]!), height: pct(box[3]! - box[1]!) })

function grab(video: HTMLVideoElement, fault: Fault, previous: Blob | undefined): Promise<Blob> {
  if (fault === 'frozen' && previous) return Promise.resolve(previous)
  const canvas = document.createElement('canvas')
  // Up to 1280 px wide: the backend's detail scan crops seats out of this frame, so it needs the pixels.
  const scale = Math.min(1, 1280 / (video.videoWidth || 1280))
  canvas.width = Math.round((video.videoWidth || 640) * scale)
  canvas.height = Math.round((video.videoHeight || 360) * scale)
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas unavailable'))
  if (fault === 'covered') { context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height) }
  else context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encode failed')), 'image/jpeg', 0.75))
}

/**
 * Camera simulator. A recorded video (a sample or the visitor's own) replaces the in-cabin camera of one demo vehicle.
 * Frames go to the backend, which detects, places them in the vehicle's calibrated cabin zones, smooths per seat and
 * ingests them exactly like a device uplink; the same rules then open incidents and send notifications.
 */
export function CameraSimulator({ vehicles }: { vehicles: V1DemoVehicle[] }) {
  const { bi } = useLocale()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const runRef = useRef(0)
  const faultRef = useRef<Fault>('none')
  const lastBlobRef = useRef<Blob | undefined>(undefined)
  const recordsRef = useRef<FrameRecord[]>([])
  const [vehicleId, setVehicleId] = useState('')
  const [source, setSource] = useState<Source>({ kind: 'sample', id: SAMPLES[0]!.id })
  const [uploadConsent, setUploadConsent] = useState(false)
  const [temperature, setTemperature] = useState(30)
  const [zones, setZones] = useState<V1CabinZone[]>(SAMPLES[0]!.zones)
  const [zoneOrigin, setZoneOrigin] = useState<'sample' | 'saved' | 'edited' | 'none'>('sample')
  const [drawKind, setDrawKind] = useState<V1CabinZone['kind'] | null>(null)
  const [draft, setDraft] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<Fault>('none')
  const [result, setResult] = useState<V1VideoFrameResult>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [firstAlertAt, setFirstAlertAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const [useSampleReference, setUseSampleReference] = useState(true)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [referenceFile, setReferenceFile] = useState<File>()
  const [referenceFileConfirmed, setReferenceFileConfirmed] = useState(false)
  const [alertPhoto, setAlertPhoto] = useState<boolean>()
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoSent, setPhotoSent] = useState(0)

  const vehicle = vehicleId || vehicles[0]?.vehicle_id || ''
  useEffect(() => {
    if (!vehicle) return
    let live = true
    platformClient.v1AdminDemoAlertPhoto(vehicle).then(pref => { if (live) setAlertPhoto(pref.enabled) }).catch(() => { if (live) setAlertPhoto(undefined) })
    return () => { live = false }
  }, [vehicle])
  const sample = source.kind === 'sample' ? SAMPLES.find(item => item.id === source.id) : undefined
  const videoUrl = source.kind === 'sample' ? sampleUrl(sample?.video ?? source.id) : source.url
  faultRef.current = fault

  // Leaving the page stops the frames and hands the vehicle back to its scenario.
  const activeRef = useRef<string | null>(null)
  useEffect(() => () => {
    runRef.current += 1
    if (activeRef.current) void platformClient.v1AdminDemoVideoStop(activeRef.current).catch(() => undefined)
  }, [])
  useEffect(() => () => { if (source.kind === 'upload') URL.revokeObjectURL(source.url) }, [source])
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(value => value + 1), 1_000)
    return () => clearInterval(id)
  }, [running])

  const chooseSample = (id: string) => {
    const next = SAMPLES.find(item => item.id === id)
    if (!next || running) return
    setSource({ kind: 'sample', id })
    setZones(next.zones)
    setZoneOrigin('sample')
    setResult(undefined)
  }

  const chooseUpload = async (file: File | undefined) => {
    if (!file || running) return
    setSource({ kind: 'upload', url: URL.createObjectURL(file), name: file.name })
    setResult(undefined)
    // An uploaded video is a camera we know nothing about: start from the vehicle's saved calibration, if any.
    try {
      const saved = await platformClient.v1AdminDemoCalibration(vehicle)
      setZones(saved.calibration?.zones ?? [])
      setZoneOrigin(saved.calibration ? 'saved' : 'none')
    } catch {
      setZones([])
      setZoneOrigin('none')
    }
  }

  const point = (event: React.PointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }
  const onPointerDown = (event: React.PointerEvent) => {
    if (!drawKind) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = point(event)
    setDraft({ a: p, b: p })
  }
  const onPointerMove = (event: React.PointerEvent) => { if (draft) setDraft({ ...draft, b: point(event) }) }
  const onPointerUp = () => {
    if (!draft || !drawKind) return
    const box = boxFromDrag(draft.a, draft.b)
    setDraft(null)
    if (!box) return
    setZones(current => [...current, { name: nextZoneName(current, drawKind), kind: drawKind, box }])
    setZoneOrigin('edited')
  }

  const saveCalibration = async () => {
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      const saved = await platformClient.v1AdminDemoSaveCalibration(vehicle, zones)
      setZoneOrigin('saved')
      setNotice(bi(`Đã lưu hiệu chỉnh v${saved.calibration.version} cho ${vehicle} (ghi nhật ký kiểm toán).`, `Saved calibration v${saved.calibration.version} for ${vehicle} (audited).`))
    } catch (reason) {
      setError(errorText(reason, bi('Backend từ chối hiệu chỉnh.', 'The backend rejected the calibration.')))
    } finally { setBusy(false) }
  }

  const loop = async (run: number) => {
    let sequence = 0
    let inFlight = 0
    let pausedUntil = 0
    let applied = 0
    const alive = () => run === runRef.current
    const send = async (seq: number) => {
      const sentAt = Date.now()
      try {
        const video = videoRef.current
        if (!video) return
        const blob = await grab(video, faultRef.current, lastBlobRef.current)
        lastBlobRef.current = blob
        const out = await platformClient.v1AdminDemoVideoFrame(vehicle, seq, blob)
        if (!alive()) return
        recordsRef.current.push({ sentAt, doneAt: Date.now(), outcome: 'ok', serverMs: out.timing.server_ms, inferenceMs: out.timing.inference_ms })
        if (seq > applied) {
          applied = seq
          setResult(out)
          setError(undefined)
          if (out.alert_photo === 'queued') setPhotoSent(count => count + 1)
          if (isAlert(out.risk_level)) setFirstAlertAt(current => current ?? Date.now())
        }
      } catch (reason) {
        if (!alive()) return
        const status = (reason as { status?: number }).status
        recordsRef.current.push({ sentAt, doneAt: Date.now(), outcome: status === 409 ? 'late' : 'failed' })
        if (status !== 409) { setError(errorText(reason, bi('Không gửi được khung hình.', 'Could not send the frame.'))); pausedUntil = Date.now() + 1_000 }
      } finally {
        inFlight -= 1
        if (recordsRef.current.length > 600) recordsRef.current = recordsRef.current.slice(-600)
      }
    }
    while (alive()) {
      const video = videoRef.current
      if (video && video.readyState >= 2 && inFlight < MAX_IN_FLIGHT && Date.now() >= pausedUntil) {
        inFlight += 1
        void send(++sequence)
      }
      await new Promise(resolve => setTimeout(resolve, FRAME_INTERVAL_MS))
    }
  }

  const start = async () => {
    if (running || busy || !vehicle) return
    setBusy(true); setError(undefined); setNotice(undefined); setResult(undefined)
    recordsRef.current = []
    lastBlobRef.current = undefined
    try {
      const body = { vehicle_id: vehicle, temperature, sample: sample?.id ?? 'upload', zones }
      await platformClient.v1AdminDemoVideoStart(body)
      if (sample?.reference && useSampleReference) {
        // The empty-cabin picture this car's installer confirmed (SR-09); the backend audits who used it.
        const picture = await fetch(sampleUrl(sample.reference)).then(response => response.blob())
        await platformClient.v1AdminDemoVideoReference(vehicle, picture, 'sample')
      } else if (source.kind === 'upload' && referenceFile && referenceFileConfirmed) {
        // An empty-cabin picture from the same camera position (e.g. the first clip of a trial session).
        await platformClient.v1AdminDemoVideoReference(vehicle, referenceFile, 'frame')
      }
      const video = videoRef.current
      if (video) { video.currentTime = 0; await video.play().catch(() => undefined) }
      const run = ++runRef.current
      activeRef.current = vehicle
      setStartedAt(Date.now()); setFirstAlertAt(null); setRunning(true); setDrawKind(null)
      void queryClient.invalidateQueries({ queryKey: DEMO_STATUS_KEY })
      void loop(run)
    } catch (reason) {
      setError(errorText(reason, bi('Không bắt đầu được camera mô phỏng.', 'Could not start the simulated camera.')))
    } finally { setBusy(false) }
  }

  const takeReference = async () => {
    const video = videoRef.current
    if (!video || !confirmEmpty) return
    setBusy(true); setError(undefined)
    try {
      await platformClient.v1AdminDemoVideoReference(vehicle, await grab(video, 'none', undefined), 'frame')
      setConfirmEmpty(false)
      setNotice(bi('Đã lấy ảnh tham chiếu cabin trống (ghi nhật ký người xác nhận).', 'Empty-cabin reference taken (the confirming person is audited).'))
    } catch (reason) {
      setError(errorText(reason, bi('Backend từ chối ảnh tham chiếu.', 'The backend rejected the reference.')))
    } finally { setBusy(false) }
  }

  const toggleAlertPhoto = async (enabled: boolean) => {
    setBusy(true); setError(undefined)
    try {
      const pref = await platformClient.v1AdminDemoSetAlertPhoto(vehicle, enabled, enabled && photoConsent)
      setAlertPhoto(pref.enabled); setPhotoConsent(false)
    } catch (reason) {
      setError(errorText(reason, bi('Backend từ chối thay đổi.', 'The backend rejected the change.')))
    } finally { setBusy(false) }
  }

  const updateZone = (name: string, patch: Partial<V1CabinZone>) => {
    setZones(current => current.map(zone => zone.name === name ? { ...zone, ...patch } : zone))
    setZoneOrigin('edited')
  }

  const stop = async () => {
    runRef.current += 1
    activeRef.current = null
    setRunning(false); setFault('none')
    videoRef.current?.pause()
    try { await platformClient.v1AdminDemoVideoStop(vehicle) } catch { /* the vehicle falls back on its own when frames stop */ }
    void queryClient.invalidateQueries({ queryKey: DEMO_STATUS_KEY })
  }

  const metrics = summarize(recordsRef.current, startedAt, firstAlertAt, Date.now())
  const check = sample ? expectation(sample.occupant, result) : 'pending'
  const frame = result?.frame
  const canUpload = uploadConsent
  const seats = Object.entries(result?.seats ?? {})

  return <section className="surface studio-card" id="camera-simulator" aria-labelledby="studio-sim">
    <div className="section-heading"><div><span className="section-kicker">{bi('Simulation mode', 'Simulation mode')}</span><h2 id="studio-sim">{bi('Camera mô phỏng', 'Camera simulator')}</h2>
      <p>{bi('Video thay cho camera trong xe. Mỗi khung đi đúng đường của thiết bị thật: phát hiện → vùng cabin đã hiệu chỉnh → theo dõi từng ghế → rules → sự cố → thông báo → dashboard. Chỉ khác nơi chạy AI (máy chủ thay cho Pi 5).', 'A video replaces the in-car camera. Each frame takes the real device path: detection → calibrated cabin zones → per-seat tracking → rules → incident → notification → dashboard. Only where the AI runs differs (server instead of Pi 5).')}</p></div><span className="data-pill studio-pill studio-pill-neutral">SIMULATED</span></div>

    <div className="sim-controls">
      <label><span>{bi('Xe demo', 'Demo vehicle')}</span><select value={vehicle} disabled={running} onChange={event => setVehicleId(event.target.value)}>{vehicles.map(item => <option key={item.vehicle_id} value={item.vehicle_id}>{item.name} · {item.vehicle_id}</option>)}</select></label>
      <label><span>{bi('Nhiệt độ cabin (cảm biến mô phỏng)', 'Cabin temperature (simulated sensor)')}</span><select value={temperature} disabled={running} onChange={event => setTemperature(Number(event.target.value))}><option value={30}>30 °C · {bi('đỗ, khóa cửa', 'parked, locked')}</option><option value={38}>38 °C · {bi('nóng, nguy hiểm', 'hot, dangerous')}</option></select></label>
    </div>

    <div className="sim-samples" role="radiogroup" aria-label={bi('Video mẫu', 'Sample videos')}>
      {SAMPLES.map(item => <button key={item.id} type="button" role="radio" aria-checked={source.kind === 'sample' && source.id === item.id} className={source.kind === 'sample' && source.id === item.id ? 'is-active' : ''} disabled={running} onClick={() => chooseSample(item.id)}>
        <strong>{bi(...item.title)}</strong><small>{bi(...item.source)}</small></button>)}
      <div className={`sim-upload ${source.kind === 'upload' ? 'is-active' : ''}`}>
        <strong>{bi('Tải video của bạn', 'Upload your video')}</strong>
        <label className="sim-consent"><input type="checkbox" checked={uploadConsent} disabled={running} onChange={event => setUploadConsent(event.target.checked)}/><span>{bi('Tôi có quyền dùng video này. Video phát trên máy tôi; chỉ từng khung ảnh được gửi lên backend để nhận diện, xử lý trong bộ nhớ và không lưu.', 'I may use this video. It plays on my device; only single frames go to the backend for detection, in memory, never stored.')}</span></label>
        <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={!canUpload || running} onChange={event => void chooseUpload(event.target.files?.[0])} aria-label={bi('Chọn video', 'Choose a video')}/>
        <small>{bi('Ảnh cabin trống cùng vị trí camera (tùy chọn)', 'Empty-cabin picture from the same camera position (optional)')}</small>
        <input type="file" accept="image/jpeg,image/png" disabled={!canUpload || running} onChange={event => { setReferenceFile(event.target.files?.[0]); setReferenceFileConfirmed(false) }} aria-label={bi('Chọn ảnh cabin trống', 'Choose an empty-cabin picture')}/>
        {referenceFile && <label className="sim-consent"><input type="checkbox" checked={referenceFileConfirmed} disabled={running} onChange={event => setReferenceFileConfirmed(event.target.checked)}/><span>{bi('Tôi xác nhận ảnh này chụp lúc cabin trống', 'I confirm this picture shows an empty cabin')}</span></label>}
      </div>
    </div>

    <div className="sim-layout">
      <div>
        <div ref={stageRef} className={`sim-stage ${drawKind ? 'is-drawing' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <video ref={videoRef} key={videoUrl} src={videoUrl} muted loop playsInline preload="auto" aria-label={bi('Video đóng vai camera', 'Video acting as the camera')}/>
          {fault === 'covered' && <div className="sim-covered">{bi('ỐNG KÍNH BỊ CHE', 'LENS COVERED')}</div>}
          {zones.map(zone => <span key={zone.name} className={`sim-zone is-${zone.kind} ${zone.child_seat ? `is-${zone.child_seat}` : ''}`} style={boxStyle(zone.box)}><b>{zone.kind === 'exclude' ? bi('kính · loại trừ', 'glass · excluded') : `${zone.name}${zone.child_seat === 'rear_facing' ? bi(' · ghế quay ngược', ' · rear-facing') : zone.child_seat === 'forward_facing' ? bi(' · ghế trẻ em', ' · child seat') : ''}`}</b></span>)}
          {draft && <span className={`sim-zone is-${drawKind} is-draft`} style={boxStyle(boxFromDrag(draft.a, draft.b) ?? [draft.a.x, draft.a.y, draft.a.x, draft.a.y])}/>}
          {running && frame && result?.detections.map((item, index) => item.bbox && <span key={index} className={`sim-box ${item.counted ? '' : 'is-outside'}`} style={boxStyle([item.bbox[0] / frame.width, item.bbox[1] / frame.height, item.bbox[2] / frame.width, item.bbox[3] / frame.height])}>
            <b>{item.class} {Math.round(item.confidence * 100)}%{item.detail ? bi(' · quét chi tiết', ' · detail') : ''}{item.counted ? '' : bi(' · ngoài xe', ' · outside')}</b></span>)}
          {running && <span className="detect-live sim-live"><i/>SIMULATED</span>}
        </div>
        <div className="sim-row">
          {!running ? <button className="primary-button" disabled={busy || !vehicle || (source.kind === 'upload' && !canUpload)} onClick={() => void start()}>{bi('Bắt đầu mô phỏng', 'Start simulation')}</button>
            : <button className="secondary-button" onClick={() => void stop()}>{bi('Dừng', 'Stop')}</button>}
          <span className="sim-faults" role="group" aria-label={bi('Giả lập sự cố camera', 'Simulate a camera fault')}>
            <button type="button" disabled={!running} aria-pressed={fault === 'covered'} onClick={() => setFault(fault === 'covered' ? 'none' : 'covered')}>{bi('Che ống kính', 'Cover lens')}</button>
            <button type="button" disabled={!running} aria-pressed={fault === 'frozen'} onClick={() => setFault(fault === 'frozen' ? 'none' : 'frozen')}>{bi('Đứng hình', 'Freeze picture')}</button>
          </span>
        </div>

        <div className="sim-reference">
          <strong>{bi('Ảnh tham chiếu cabin trống', 'Empty-cabin reference')}</strong>
          <p className="studio-muted">{bi('Chụp khi lắp, lúc có người xác nhận cabin trống. Mỗi ghế được so với ảnh này: ghế khác đi 3 khung liên tiếp được coi là có thể có người, kể cả khi detector không thấy ai. Ảnh chỉ nằm trong bộ nhớ của lượt chạy.', 'Taken at installation while a person confirms the cabin is empty. Every seat is compared with it: a seat that differs for 3 frames in a row is a possible occupant even when the detector sees nobody. Kept in memory for the run only.')}</p>
          {result?.reference ? <p><span className="data-pill studio-pill studio-pill-ok">{bi('Đang dùng', 'In use')}</span> {result.reference.source === 'sample' ? bi('ảnh lúc lắp của xe mẫu', 'installation picture of the sample car') : bi('khung chụp từ video', 'frame from the video')} · {result.reference.confirmed_by}</p>
            : running ? <p className="studio-muted">{bi('Chưa có: ghế trống chỉ là "không thấy", chưa được xác minh.', 'None: an empty seat is only "nothing seen", not verified.')}</p> : null}
          {sample?.reference && <label className="sim-consent"><input type="checkbox" checked={useSampleReference} disabled={running} onChange={event => setUseSampleReference(event.target.checked)}/><span>{bi('Dùng ảnh cabin trống mà nhóm đã xác nhận khi lắp xe mẫu này', 'Use the empty-cabin picture the team confirmed when fitting this sample car')}</span></label>}
          {running && <div className="sim-row"><label className="sim-consent"><input type="checkbox" checked={confirmEmpty} onChange={event => setConfirmEmpty(event.target.checked)}/><span>{bi('Tôi xác nhận lúc này cabin trống', 'I confirm the cabin is empty right now')}</span></label>
            <button type="button" disabled={!confirmEmpty || busy} onClick={() => void takeReference()}>{bi('Chụp khung hiện tại làm tham chiếu', 'Use the current frame as the reference')}</button></div>}
        </div>

        <div className="sim-reference">
          <strong>{bi('Cảnh báo Telegram', 'Telegram alerts')}</strong>
          <p className="studio-muted">{bi('Mỗi sự cố gửi một thẻ vẽ từ dữ liệu (mức rủi ro, ghế, nhiệt độ), không có ảnh camera. Ảnh camera chỉ gửi khi bật bên dưới: một ảnh mỗi sự cố, người và mọi ghế chưa xác minh trống đã được làm mờ.', 'Each incident sends a card drawn from data (risk, seats, temperature), no camera image. A camera photo is sent only when turned on below: one per incident, with people and every seat not verified empty pixelated.')}</p>
          {alertPhoto ? <p><span className="data-pill studio-pill studio-pill-warn">{bi('Ảnh kèm cảnh báo: BẬT', 'Alert photo: ON')}</span> {photoSent > 0 && bi(`· đã gửi ${photoSent} ảnh`, `· ${photoSent} sent`)} <button type="button" disabled={busy} onClick={() => void toggleAlertPhoto(false)}>{bi('Tắt', 'Turn off')}</button></p>
            : <div className="sim-row"><label className="sim-consent"><input type="checkbox" checked={photoConsent} onChange={event => setPhotoConsent(event.target.checked)}/><span>{bi('Tôi đồng ý gửi ảnh đã làm mờ lên Telegram; Telegram tự lưu một bản mà hệ thống không xóa được. Người mà mô hình không nhận ra vẫn được che nếu nằm trên ghế chưa xác minh trống.', 'I agree to send pixelated photos to Telegram; Telegram keeps its own copy the system cannot delete. People the model misses are still hidden when they sit on a seat not verified empty.')}</span></label>
              <button type="button" disabled={!photoConsent || busy || alertPhoto === undefined} onClick={() => void toggleAlertPhoto(true)}>{bi('Bật ảnh kèm cảnh báo', 'Turn on alert photos')}</button></div>}
        </div>

        <details className="sim-calibration" open={drawKind !== null || zoneOrigin === 'none'}>
          <summary>{bi('Hiệu chỉnh vùng cabin (ROI) cho xe này', 'Calibrate cabin zones (ROI) for this vehicle')} · {zones.filter(z => z.kind === 'seat').length} {bi('ghế', 'seats')}, {zones.filter(z => z.kind === 'exclude').length} {bi('vùng kính', 'glass zones')}</summary>
          <p className="studio-muted">{bi('Mỗi dòng xe có khoang sau và vị trí camera khác nhau, nên khi lắp thiết bị cần đánh dấu ghế và cửa kính. Người đứng ngoài kính chỉ bị loại khi tâm khung nằm trong vùng kính và không nằm trên ghế nào; vùng chưa đánh dấu vẫn tính. Vùng kính không được che quá nửa ghế.', 'Every model has a different rear cabin and camera position, so the seats and the glass are marked when the unit is fitted. Someone outside the glass is left out only when the box centre is in a glass zone and on no seat; unmarked areas still count. Glass zones may not hide more than half a seat.')}</p>
          <div className="sim-row">
            <button type="button" className={drawKind === 'seat' ? 'is-active' : ''} disabled={running} onClick={() => setDrawKind(drawKind === 'seat' ? null : 'seat')}>{bi('Vẽ ghế', 'Draw seat')}</button>
            <button type="button" className={drawKind === 'exclude' ? 'is-active' : ''} disabled={running} onClick={() => setDrawKind(drawKind === 'exclude' ? null : 'exclude')}>{bi('Vẽ vùng kính', 'Draw glass')}</button>
            {sample && <button type="button" disabled={running} onClick={() => { setZones(sample.zones); setZoneOrigin('sample') }}>{bi('Dùng vùng của video mẫu', 'Use the sample zones')}</button>}
            <button type="button" disabled={running || zones.length === 0} onClick={() => { setZones([]); setZoneOrigin('edited') }}>{bi('Xóa hết', 'Clear')}</button>
            <button type="button" className="primary-button" disabled={running || busy} onClick={() => void saveCalibration()}>{bi(`Lưu cho ${vehicle}`, `Save for ${vehicle}`)}</button>
          </div>
          {drawKind && <p className="studio-muted">{bi('Kéo chuột trên video để vẽ.', 'Drag on the video to draw.')}</p>}
          <ul className="sim-zone-list">{zones.map(zone => <li key={zone.name}><span className={`sim-dot is-${zone.kind}`}/>{zone.name}<small>{zone.box.map(v => v.toFixed(2)).join(', ')}</small>
            {zone.kind === 'seat' && <>
              <select value={zone.child_seat ?? ''} disabled={running} aria-label={bi(`Ghế trẻ em ở ${zone.name}`, `Child seat on ${zone.name}`)} onChange={event => updateZone(zone.name, { child_seat: (event.target.value || null) as V1CabinZone['child_seat'] })}>
                <option value="">{bi('không có ghế trẻ em', 'no child seat')}</option><option value="forward_facing">{bi('ghế trẻ em quay xuôi', 'forward-facing child seat')}</option><option value="rear_facing">{bi('ghế trẻ em quay ngược', 'rear-facing child seat')}</option>
              </select>
              <label className="sim-inline"><input type="checkbox" checked={Boolean(zone.detail)} disabled={running} onChange={event => updateZone(zone.name, { detail: event.target.checked })}/>{bi('quét chi tiết', 'detail scan')}</label>
            </>}
            <button type="button" disabled={running} aria-label={bi(`Xóa ${zone.name}`, `Remove ${zone.name}`)} onClick={() => { setZones(current => current.filter(z => z.name !== zone.name)); setZoneOrigin('edited') }}>×</button></li>)}</ul>
        </details>
      </div>

      <aside className="sim-result" aria-live="polite">
        <div><small>{bi('Backend đánh giá', 'Backend verdict')}</small><span className={`data-pill studio-pill studio-pill-${riskTone(result?.risk_level)}`}>{result?.risk_level ?? '—'}</span>
          {result?.rule_id && <code>{result.rule_id}</code>}</div>
        {result?.camera_status && result.camera_status !== 'OK' && <p className="action-notice is-error">{bi(`Camera ${result.camera_status}: ảnh tối hoặc đứng hình. Hệ thống báo lỗi camera, không bao giờ coi là xe trống.`, `Camera ${result.camera_status}: picture dark or frozen. Reported as a camera fault, never as an empty cabin.`)}</p>}
        {sample && <div className={`sim-expect is-${check}`}><small>{bi('Kỳ vọng (người xem video)', 'Expected (by eye)')}</small><strong>{bi(...sample.truth)}</strong>
          <span>{check === 'pass' ? bi('Khớp với backend', 'Backend agrees') : check === 'fail' ? bi('Không khớp: xem khung và vùng', 'Mismatch: check the boxes and zones') : check === 'camera' ? bi('Đang lỗi camera', 'Camera fault') : bi('Chờ khung đầu tiên…', 'Waiting for the first frame…')}</span>
          {!sample.occupant && <em>{bi('SAFE ở đây chỉ nghĩa là không thấy bằng chứng có người, không phải đã xác minh cabin trống (SR-01).', 'SAFE here only means no evidence of an occupant, not a verified empty cabin (SR-01).')}</em>}</div>}
        <dl className="sim-metrics">
          <div><dt>{bi('Khứ hồi / khung (p50 · p95)', 'Round trip / frame (p50 · p95)')}</dt><dd>{ms(metrics.roundTrip.p50)} · {ms(metrics.roundTrip.p95)}</dd></div>
          <div><dt>{bi('Thời gian model (p50 · p95)', 'Model time (p50 · p95)')}</dt><dd>{ms(metrics.inference.p50)} · {ms(metrics.inference.p95)}</dd></div>
          <div><dt>{bi('Xử lý ở máy chủ (p50)', 'Server processing (p50)')}</dt><dd>{ms(metrics.server.p50)}</dd></div>
          <div><dt>{bi('Khung đã xử lý', 'Frames processed')}</dt><dd>{metrics.ok}/{metrics.sent} · {metrics.fps} fps</dd></div>
          <div><dt>{bi('Bỏ (đến muộn) · lỗi', 'Dropped (late) · failed')}</dt><dd>{metrics.late} · {metrics.failed}</dd></div>
          <div><dt>{bi('Từ lúc bắt đầu đến cảnh báo', 'Start to first alert')}</dt><dd>{metrics.firstAlertMs === null ? '—' : `${(metrics.firstAlertMs / 1000).toFixed(1)} s`}</dd></div>
        </dl>
        {seats.length > 0 && <table className="sim-seats"><thead><tr><th>{bi('Ghế', 'Seat')}</th><th>{bi('Trạng thái', 'State')}</th></tr></thead><tbody>
          {seats.map(([name, value]) => <tr key={name} className={`seat-${value.state.toLowerCase()}`}><td>{name}</td><td>{value.state === 'OCCUPIED' ? `${value.label} ${Math.round((value.confidence ?? 0) * 100)}%` : bi(...(SEAT_STATE[value.state] ?? [value.state, value.state]))}
            {value.releases_in_s !== null ? bi(` · nhả sau ${Math.ceil(value.releases_in_s)} s`, ` · releases in ${Math.ceil(value.releases_in_s)} s`) : ''}
            {value.reference_similarity !== null && <small> · {bi('giống ảnh trống', 'match')} {value.reference_similarity.toFixed(2)}</small>}</td></tr>)}
        </tbody></table>}
        {result?.active_incident && <p><Link to="/admin/incidents">{bi('Sự cố đang mở →', 'Open incident →')}</Link> <code>{result.active_incident}</code></p>}
        <p className="studio-muted">{bi('Số đo trên đây là của môi trường mô phỏng (trình duyệt → máy chủ). Số đo trên Pi 5 nằm trong tài liệu E2E.', 'These numbers are for the simulated setup (browser → server). Pi 5 figures are in the E2E document.')}</p>
      </aside>
    </div>
    {notice && <p className="action-notice is-success">{notice}</p>}
    {error && <p className="action-notice is-error" role="alert">{error}</p>}
  </section>
}
