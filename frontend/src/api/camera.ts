import { adaptBackendState } from './adapter'
import type { AgentState } from '../types/agent'

export type CameraOperation = 'camera_start' | 'camera_status' | 'camera_frame' | 'camera_stop' | 'camera_report'
export type CameraRecord = Record<string, unknown>
export const CAMERA_BASE_URL = (import.meta.env.VITE_CAMERA_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const operations: CameraOperation[] = ['camera_start', 'camera_status', 'camera_frame', 'camera_stop', 'camera_report']
export class CameraError extends Error {
  readonly code: string
  constructor(message: string, code = 'TRANSPORT_ERROR') { super(message); this.name = 'CameraError'; this.code = code }
}
export function isRecord(value: unknown): value is CameraRecord { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function invalid(): never { throw new CameraError('Invalid camera response; current decision unavailable.', 'INVALID_RESPONSE') }

export class CameraAPI {
  readonly base: string
  private readonly fetcher: typeof fetch
  constructor(base = CAMERA_BASE_URL, fetcher = globalThis.fetch) { this.base = base.replace(/\/$/, ''); this.fetcher = fetcher.bind(globalThis) }
  async available(): Promise<boolean> {
    const response = await this.fetcher(`${this.base}/gradio_api/info`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new CameraError(`Camera API discovery failed (${response.status}).`)
    const value: unknown = await response.json()
    if (!isRecord(value) || !isRecord(value.named_endpoints)) invalid()
    return operations.every(op => isRecord(value.named_endpoints) && `/${op}` in value.named_endpoints)
  }
  async upload(blob: Blob): Promise<CameraRecord> {
    const data = new FormData(); data.append('files', blob, 'camera-frame.jpg')
    const response = await this.fetcher(`${this.base}/gradio_api/upload`, { method: 'POST', body: data, credentials: 'omit', signal: AbortSignal.timeout(90_000) })
    if (!response.ok) throw new CameraError(`Camera upload failed (${response.status}).`)
    const paths: unknown = await response.json()
    if (!Array.isArray(paths) || typeof paths[0] !== 'string' || !paths[0]) invalid()
    return { path: paths[0], meta: { _type: 'gradio.FileData' } }
  }
  async call(name: CameraOperation, data: unknown[]): Promise<CameraRecord> {
    const abort = new AbortController(); const timer = window.setTimeout(() => abort.abort(), 90_000)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const url = `${this.base}/gradio_api/call/${name}`
      const started = await this.fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }), credentials: 'omit', signal: abort.signal })
      if (!started.ok) throw new CameraError(`Camera API failed (${started.status}).`)
      const event: unknown = await started.json()
      if (!isRecord(event) || typeof event.event_id !== 'string' || !event.event_id) invalid()
      const response = await this.fetcher(`${url}/${encodeURIComponent(event.event_id)}`, { credentials: 'omit', cache: 'no-store', signal: abort.signal })
      if (!response.ok || !response.body) throw new CameraError(`Camera result stream failed (${response.status}).`)
      reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary: RegExpExecArray | null
        while ((boundary = /\r?\n\r?\n/.exec(buffer)) !== null) {
          const lines = buffer.slice(0, boundary.index).split(/\r?\n/); buffer = buffer.slice(boundary.index + boundary[0].length)
          const kind = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
          const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (kind === 'error') throw new CameraError('Backend camera inference returned an error; current result unavailable.', 'SSE_ERROR')
          if (kind !== 'complete') continue
          const result: unknown = JSON.parse(raw)
          if (!Array.isArray(result) || !isRecord(result[0])) invalid()
          if (typeof result[0].error === 'string') throw new CameraError(result[0].error, typeof result[0].code === 'string' ? result[0].code : 'BACKEND_ERROR')
          return result[0]
        }
      }
      throw new CameraError('Camera result stream ended before completion.', 'INCOMPLETE_RESULT')
    } catch (error) {
      if (error instanceof CameraError) throw error
      throw new CameraError(abort.signal.aborted ? 'Camera request timed out; result unknown.' : 'Camera network or response error; result unavailable.')
    } finally { window.clearTimeout(timer); await reader?.cancel().catch(() => {}) }
  }
}

export interface CameraFrame { sequence: number; captured_at: string; width: number; height: number; latency_ms?: number }
export interface CameraSnapshot extends CameraRecord {
  session_id: string; revision: number; risk_level: string; rule_id: string; reason: string; occupancy_state: string; camera_status: string; decision_current: boolean
  camera: { source: string; requested: string; device_reported: string; last_sequence: number }
  frame: CameraFrame | null
  vision_detections: Array<{ class: string; confidence: number; bbox?: [number, number, number, number] }>
}
export function validateCameraSnapshot(value: unknown): asserts value is CameraSnapshot {
  if (!isRecord(value) || typeof value.session_id !== 'string' || !value.session_id || !Number.isInteger(value.revision) ||
    !['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR'].includes(String(value.risk_level)) || typeof value.rule_id !== 'string' || typeof value.reason !== 'string' ||
    !['PRESENT', 'SUSPECTED', 'ABSENT', 'UNKNOWN'].includes(String(value.occupancy_state)) || !['OK', 'BLOCKED', 'ERROR', 'DISCONNECTED', 'NO_FEED'].includes(String(value.camera_status)) || typeof value.decision_current !== 'boolean' ||
    !isRecord(value.camera) || !['browser', 'raspberry_pi'].includes(String(value.camera.source)) ||
    !['RUNNING', 'STOPPED'].includes(String(value.camera.requested)) || typeof value.camera.device_reported !== 'string' ||
    !Array.isArray(value.vision_detections) || !Array.isArray(value.actions) || !value.actions.every(isRecord)) invalid()
  if (!value.vision_detections.every(d => isRecord(d) && typeof d.class === 'string' && typeof d.confidence === 'number' && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1 &&
    (d.bbox == null || (Array.isArray(d.bbox) && d.bbox.length === 4 && d.bbox.every(n => typeof n === 'number' && Number.isFinite(n)))))) invalid()
  if (value.frame != null && (!isRecord(value.frame) || !Number.isInteger(value.frame.sequence) ||
    typeof value.frame.captured_at !== 'string' || !Number.isFinite(Date.parse(value.frame.captured_at)) ||
    typeof value.frame.width !== 'number' || value.frame.width <= 0 || typeof value.frame.height !== 'number' || value.frame.height <= 0)) invalid()
}
/** Defense in depth: frames are sent single-flight, but an older frame never replaces a newer one. */
export function isStaleCameraResult(current: CameraSnapshot | undefined, next: CameraSnapshot): boolean {
  return Boolean(current?.frame && next.frame && next.session_id === current.session_id && next.frame.sequence < current.frame.sequence)
}
export function adaptCameraState(value: unknown): AgentState {
  validateCameraSnapshot(value)
  const freshness = isRecord(value.freshness) ? value.freshness : {}
  const sources = [freshness.sensor, freshness.vision]
  const fresh = sources.every(s => isRecord(s) && s.status === 'FRESH' && typeof s.age_s === 'number' && Number.isFinite(s.age_s) && s.age_s >= 0)
  const captureAge = value.frame ? Date.now() - Date.parse(value.frame.captured_at) : 3001
  const state = adaptBackendState({ vehicle_id: `DEMO_${value.session_id}`, revision: value.revision, risk_level: value.risk_level,
    reason: value.reason, rule_id: value.rule_id, occupancy_state: value.occupancy_state, camera_status: value.camera_status,
    detected_objects: value.vision_detections, action_results: value.actions as NonNullable<Parameters<typeof adaptBackendState>[0]['action_results']>,
    // Additive camera fields: durable receipts survive frames that (correctly) do not replay actions.
    action_ledger: Array.isArray(value.action_ledger) && value.action_ledger.every(isRecord) ? value.action_ledger as NonNullable<Parameters<typeof adaptBackendState>[0]['action_ledger']> : undefined,
    unlock_request: isRecord(value.unlock_request) ? value.unlock_request as Parameters<typeof adaptBackendState>[0]['unlock_request'] : undefined,
    incident_id: typeof value.incident_id === 'string' ? value.incident_id : null,
    evaluated_at: value.frame?.captured_at || (typeof freshness.as_of === 'string' ? freshness.as_of : new Date(0).toISOString()),
    freshness: freshness as Parameters<typeof adaptBackendState>[0]['freshness'], decision_current: false,
    data_quality: isRecord(value.data_quality) && typeof value.data_quality.status === 'string' && Array.isArray(value.data_quality.issues) && value.data_quality.issues.every(x => typeof x === 'string')
      ? value.data_quality as Parameters<typeof adaptBackendState>[0]['data_quality'] : undefined,
  })
  // The approved camera contract reports sensor freshness but omits telemetry values.
  // Never synthesize temperatures from a scenario. Its backend verdict is independent of UI telemetry availability.
  const current = value.decision_current && value.camera.requested === 'RUNNING' && value.camera.device_reported === 'CAPTURING' && value.camera_status === 'OK' &&
    value.frame !== null && fresh && captureAge >= 0 && captureAge <= 3000 && state.dataQuality?.status === 'CURRENT'
  const age = Math.max(captureAge, ...sources.map(s => isRecord(s) && typeof s.age_s === 'number' ? s.age_s * 1000 : 3001))
  return { ...state, dataAgeMs: current ? age : Math.max(3001, age), decisionCurrent: current, simulation: true }
}
