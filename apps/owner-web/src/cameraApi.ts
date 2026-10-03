export type CameraOperation = 'camera_start' | 'camera_status' | 'camera_frame' | 'camera_stop' | 'camera_report'

export interface CameraDetection {
  class: string
  confidence: number
  bbox?: [number, number, number, number]
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
}

function cameraBaseUrl() {
  const configured = import.meta.env.VITE_CAMERA_API_BASE_URL || import.meta.env.VITE_API_BASE_URL
  return (configured || (import.meta.env.DEV ? 'http://localhost:7860' : 'https://khanh3636-backend-p068.hf.space')).replace(/\/$/, '')
}

export class CameraApi {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(baseUrl = cameraBaseUrl(), fetcher: typeof fetch = globalThis.fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetcher = fetcher
  }

  async available() {
    const response = await this.fetcher(`${this.baseUrl}/gradio_api/info`, {
      credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15_000),
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
      method: 'POST', body, credentials: 'include', signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new CameraApiError(`Không tải được frame camera (${response.status}).`)
    const paths: unknown = await response.json()
    if (!Array.isArray(paths) || typeof paths[0] !== 'string' || !paths[0]) invalidResponse()
    return { path: paths[0], meta: { _type: 'gradio.FileData' } }
  }

  async call(name: CameraOperation, data: unknown[]): Promise<CameraRecord> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const url = `${this.baseUrl}/gradio_api/call/${name}`
      const started = await this.fetcher(url, {
        method: 'POST', credentials: 'include', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
      })
      if (!started.ok) throw new CameraApiError(`Camera API lỗi (${started.status}).`)
      const event: unknown = await started.json()
      if (!isRecord(event) || typeof event.event_id !== 'string' || !event.event_id) invalidResponse()
      const response = await this.fetcher(`${url}/${encodeURIComponent(event.event_id)}`, {
        credentials: 'include', cache: 'no-store', signal: controller.signal,
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
