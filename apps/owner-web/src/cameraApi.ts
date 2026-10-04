export type CameraOperation = 'camera_start' | 'camera_status' | 'camera_frame' | 'camera_stop' | 'camera_report'

export interface CameraDetection {
  class: string
  confidence: number
  bbox?: [number, number, number, number]
}

export interface PrivacyPreview {
  status: 'PROCESSED'
  method: 'YUNET_SOFT_OVAL'
  model_sha256: string
  data_url: string
  width: number
  height: number
  detected_faces: number
  masked_regions: number
  /** Pixel boxes (x1, y1, x2, y2) of the masked regions, in frame coordinates. */
  masked_boxes?: [number, number, number, number][]
  latency_ms: number
  sequence: number
  captured_at: string
}

export interface UnavailablePrivacyPreview {
  status: 'UNAVAILABLE'
  reason?: string
  sequence?: number
  captured_at?: string
}

export interface CameraSnapshot {
  session_id: string
  session_token?: string
  revision: number
  risk_level: 'SAFE' | 'NOTICE' | 'WARNING' | 'CRITICAL' | 'ERROR'
  rule_id: string
  reason: string
  occupancy_state: 'PRESENT' | 'SUSPECTED' | 'ABSENT' | 'UNKNOWN'
  camera_status: 'OK' | 'BLOCKED' | 'ERROR' | 'DISCONNECTED' | 'NO_FEED'
  decision_current: boolean
  camera: { requested: 'RUNNING' | 'STOPPED'; device_reported: string }
  frame: null | { sequence: number; captured_at: string; width: number; height: number; latency_ms?: number }
  vision_detections: CameraDetection[]
  preview?: PrivacyPreview | UnavailablePrivacyPreview
}

type CameraRecord = Record<string, unknown>

export class CameraApiError extends Error {
  constructor(message: string, readonly code = 'TRANSPORT_ERROR') {
    super(message)
    this.name = 'CameraApiError'
  }
}

function isRecord(value: unknown): value is CameraRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalidResponse(): never {
  throw new CameraApiError('Backend trả về dữ liệu camera không hợp lệ.', 'INVALID_RESPONSE')
}

export function validateCameraSnapshot(value: unknown): asserts value is CameraSnapshot {
  if (!isRecord(value) || typeof value.session_id !== 'string' || !value.session_id ||
    !Number.isInteger(value.revision) || typeof value.reason !== 'string' || typeof value.rule_id !== 'string' ||
    !['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR'].includes(String(value.risk_level)) ||
    !['PRESENT', 'SUSPECTED', 'ABSENT', 'UNKNOWN'].includes(String(value.occupancy_state)) ||
    !['OK', 'BLOCKED', 'ERROR', 'DISCONNECTED', 'NO_FEED'].includes(String(value.camera_status)) ||
    typeof value.decision_current !== 'boolean' || !isRecord(value.camera) ||
    !Array.isArray(value.vision_detections)) invalidResponse()
  if (!value.vision_detections.every(item => isRecord(item) && typeof item.class === 'string' &&
    typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1 &&
    (item.bbox == null || (Array.isArray(item.bbox) && item.bbox.length === 4 && item.bbox.every(Number.isFinite))))) invalidResponse()
  if (value.preview != null && !isRecord(value.preview)) invalidResponse()
}

const PRIVACY_MODEL_SHA256 = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'

export function getPrivacyPreview(snapshot: CameraSnapshot, now = Date.now()): PrivacyPreview | undefined {
  const { frame, preview } = snapshot
  if (!frame || !preview || preview.status !== 'PROCESSED' || preview.method !== 'YUNET_SOFT_OVAL' ||
    preview.model_sha256 !== PRIVACY_MODEL_SHA256 || typeof preview.data_url !== 'string' ||
    (preview.data_url !== '' && !preview.data_url.startsWith('data:image/jpeg;base64,')) || preview.sequence !== frame.sequence ||
    preview.captured_at !== frame.captured_at || preview.width !== frame.width || preview.height !== frame.height ||
    !Number.isInteger(preview.detected_faces) || preview.detected_faces < 0 ||
    !Number.isInteger(preview.masked_regions) || preview.masked_regions < 0 ||
    typeof preview.latency_ms !== 'number' || !Number.isFinite(preview.latency_ms)) return undefined
  const capturedAt = Date.parse(preview.captured_at)
  const age = now - capturedAt
  return Number.isFinite(capturedAt) && age >= 0 && age <= 3_000 ? preview : undefined
}

/** Face regions to blur on the full-rate local video. Faces move between backend previews, so boxes are only
 * trusted while recent; `undefined` means the caller must blur the whole frame instead of showing faces. */
export function getFaceMasks(preview: PrivacyPreview | undefined, now = Date.now(), maxAgeMs = 1_500): [number, number, number, number][] | undefined {
  if (!preview || !Array.isArray(preview.masked_boxes) || preview.masked_boxes.length !== preview.masked_regions) return undefined
  if (!preview.masked_boxes.every(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[2] > box[0] && box[3] > box[1])) return undefined
  const age = now - Date.parse(preview.captured_at)
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs ? preview.masked_boxes : undefined
}

interface CpuResult {
  session_id: string
  reasoning: { revision: number; risk_level: CameraSnapshot['risk_level']; rule_id: string; reason: string; occupancy_state: CameraSnapshot['occupancy_state']; decision_current: boolean }
  vision: { detections: CameraDetection[]; latency_ms?: number | null }
  frame?: { width: number; height: number } | null
  preview?: { status: string; method?: string; model_sha256?: string; width?: number; height?: number; detected_faces?: number; masked_regions?: number; masked_boxes?: unknown; latency_ms?: number; reason?: string } | null
}

function isCpuResult(value: unknown): value is CpuResult {
  if (!isRecord(value) || typeof value.session_id !== 'string' || !isRecord(value.reasoning) ||
    !isRecord(value.vision) || !Array.isArray(value.vision.detections)) return false
  const r = value.reasoning
  return Number.isInteger(r.revision) && typeof r.rule_id === 'string' && typeof r.reason === 'string' &&
    typeof r.decision_current === 'boolean' &&
    ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR'].includes(String(r.risk_level)) &&
    ['PRESENT', 'SUSPECTED', 'ABSENT', 'UNKNOWN'].includes(String(r.occupancy_state))
}

/** Face detection misses single frames (turned head, motion blur), and drawing only the newest frame makes the mask
 * blink off and expose the face. Every mask seen within `holdMs` before the newest preview stays applied (union).
 * Only previews of the same frame size are combined. Freshness of the newest preview is still enforced by getFaceMasks. */
export function holdFaceMasks(history: PrivacyPreview[], latest: PrivacyPreview | undefined, now = Date.now(), holdMs = 700): [number, number, number, number][] | undefined {
  const current = getFaceMasks(latest, now)
  if (!latest || !current) return undefined
  const latestAt = Date.parse(latest.captured_at)
  const held = history.filter(item => item !== latest && item.width === latest.width && item.height === latest.height &&
    latestAt - Date.parse(item.captured_at) >= 0 && latestAt - Date.parse(item.captured_at) <= holdMs)
    .flatMap(item => getFaceMasks(item, latestAt, holdMs) ?? [])
  // A face found in several recent frames must not stack several blurs: keep a held box only if it adds new area.
  const merged = [...current]
  for (const box of held) if (!merged.some(kept => overlap(kept, box) > 0.3)) merged.push(box)
  return merged
}

function overlap(a: [number, number, number, number], b: [number, number, number, number]) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  if (w <= 0 || h <= 0) return 0
  const smaller = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
  return w * h / smaller
}

/** Keep the last non-empty person boxes briefly so a single missed detection does not make the boxes blink. */
export function holdDetections<T extends { at: number }>(latest: T | undefined, lastSeen: T | undefined, now = Date.now(), holdMs = 500): T | undefined {
  if (latest) return latest
  return lastSeen && now - lastSeen.at <= holdMs ? lastSeen : undefined
}

function cameraBaseUrl() {
  const configured = import.meta.env.VITE_CAMERA_API_BASE_URL || import.meta.env.VITE_API_BASE_URL
  return (configured || (import.meta.env.DEV ? 'http://localhost:7860' : 'https://khanh3636-backend-p068.hf.space')).replace(/\/$/, '')
}

export class CameraApi {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(baseUrl = cameraBaseUrl(), fetcher: typeof fetch = (...args) => globalThis.fetch(...args)) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetcher = fetcher
  }

  async available() {
    const response = await this.fetcher(`${this.baseUrl}/gradio_api/info`, {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new CameraApiError(`Không đọc được Camera API (${response.status}).`)
    const body: unknown = await response.json()
    const names: CameraOperation[] = ['camera_start', 'camera_status', 'camera_frame', 'camera_stop', 'camera_report']
    if (!isRecord(body) || !isRecord(body.named_endpoints)) invalidResponse()
    const endpoints = body.named_endpoints as CameraRecord
    return names.every(name => `/${name}` in endpoints)
  }

  async upload(blob: Blob) {
    const body = new FormData()
    body.append('files', blob, 'camera-frame.jpg')
    const response = await this.fetcher(`${this.baseUrl}/gradio_api/upload`, {
      method: 'POST', body, credentials: 'omit', signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new CameraApiError(`Không tải được frame camera (${response.status}).`)
    const paths: unknown = await response.json()
    if (!Array.isArray(paths) || typeof paths[0] !== 'string' || !paths[0]) invalidResponse()
    return { path: paths[0], meta: { _type: 'gradio.FileData' } }
  }

  /** REST path: one request per frame. `privacy=boxes` returns face-mask pixel boxes (no image), which the panel
   * applies to the local 30 fps video. The Worker proxies /api/*, so production calls the page origin. */
  async analyzeCpu(blob: Blob, sessionId: string, token: string, sequence: number, capturedAt: string): Promise<CameraSnapshot> {
    const body = new FormData()
    body.append('image', blob, 'camera-frame.jpg')
    body.append('scenario', 'hot_locked')
    body.append('session_id', sessionId)
    body.append('privacy', 'boxes')
    const restBase = import.meta.env.DEV || typeof window === 'undefined' ? this.baseUrl : window.location.origin
    const response = await this.fetcher(`${restBase}/api/v1/demo/analyze`, {
      method: 'POST', body, credentials: 'omit',
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new CameraApiError(`CPU Camera API lỗi (${response.status}).`, 'CPU_API_ERROR')
    const result: unknown = await response.json()
    if (!isCpuResult(result) || result.session_id !== sessionId) invalidResponse()
    const size = result.frame
    const frame = size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
      ? { sequence, captured_at: capturedAt, width: size.width, height: size.height, latency_ms: result.vision.latency_ms ?? undefined }
      : null
    const p = result.preview
    const boxes = p?.masked_boxes
    const preview: CameraSnapshot['preview'] = frame && p?.status === 'PROCESSED' && Array.isArray(boxes) &&
      p.method === 'YUNET_SOFT_OVAL' && typeof p.model_sha256 === 'string' && Number.isInteger(p.detected_faces) &&
      Number.isInteger(p.masked_regions) && typeof p.latency_ms === 'number'
      ? { status: 'PROCESSED', method: 'YUNET_SOFT_OVAL', model_sha256: p.model_sha256, data_url: '', width: frame.width,
          height: frame.height, detected_faces: p.detected_faces as number, masked_regions: p.masked_regions as number,
          masked_boxes: boxes as [number, number, number, number][], latency_ms: p.latency_ms, sequence, captured_at: capturedAt }
      : { status: 'UNAVAILABLE', reason: p?.reason ?? 'Backend không trả về vùng che mặt.', sequence, captured_at: capturedAt }
    const r = result.reasoning
    const snapshot: CameraSnapshot = {
      session_id: result.session_id, revision: r.revision, risk_level: r.risk_level, rule_id: r.rule_id, reason: r.reason,
      occupancy_state: r.occupancy_state, decision_current: r.decision_current, camera_status: 'OK',
      camera: { requested: 'RUNNING', device_reported: 'CAPTURING' }, frame, vision_detections: result.vision.detections, preview,
    }
    validateCameraSnapshot(snapshot)
    return snapshot
  }

  async call(name: CameraOperation, data: unknown[]): Promise<CameraRecord> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const url = `${this.baseUrl}/gradio_api/call/${name}`
      const started = await this.fetcher(url, {
        method: 'POST', credentials: 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
      })
      if (!started.ok) throw new CameraApiError(`Camera API lỗi (${started.status}).`)
      const event: unknown = await started.json()
      if (!isRecord(event) || typeof event.event_id !== 'string' || !event.event_id) invalidResponse()
      const response = await this.fetcher(`${url}/${encodeURIComponent(event.event_id)}`, {
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new CameraApiError(`Không đọc được kết quả detect (${response.status}).`)
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        let boundary: RegExpExecArray | null
        while ((boundary = /\r?\n\r?\n/.exec(buffer)) !== null) {
          const lines = buffer.slice(0, boundary.index).split(/\r?\n/)
          buffer = buffer.slice(boundary.index + boundary[0].length)
          const kind = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
          const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (kind === 'error') throw new CameraApiError('Backend không xử lý được frame.', 'SSE_ERROR')
          if (kind !== 'complete') continue
          const result: unknown = JSON.parse(raw)
          if (!Array.isArray(result) || !isRecord(result[0])) invalidResponse()
          if (typeof result[0].error === 'string') {
            throw new CameraApiError(result[0].error, typeof result[0].code === 'string' ? result[0].code : 'BACKEND_ERROR')
          }
          return result[0]
        }
      }
      throw new CameraApiError('Luồng kết quả detect kết thúc sớm.', 'INCOMPLETE_RESULT')
    } catch (error) {
      if (error instanceof CameraApiError) throw error
      throw new CameraApiError(controller.signal.aborted ? 'Detect quá thời gian chờ.' : 'Không kết nối được Camera API.')
    } finally {
      clearTimeout(timer)
      await reader?.cancel().catch(() => undefined)
    }
  }
}
