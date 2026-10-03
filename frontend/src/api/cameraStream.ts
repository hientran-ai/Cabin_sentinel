import { CameraAPI, CameraError, validateCameraSnapshot, type CameraRecord, type CameraSnapshot } from './camera'
import type { DemoScenario } from '../types/agent'

export type StreamStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'STOPPED_UNCONFIRMED' | 'DISCONNECTED' | 'ERROR'
export interface CaptureContext { capturedAt: string; sequence: number }
interface Options {
  api?: Pick<CameraAPI, 'available' | 'call' | 'upload'>; video: HTMLVideoElement; mediaDevices?: MediaDevices
  capture: (video: HTMLVideoElement, context: CaptureContext) => Promise<Blob>
  onResult: (value: CameraSnapshot) => void; onError: (error: Error) => void; onState: (status: StreamStatus) => void; intervalMs?: number
}
export class CameraStream {
  private readonly options: Options
  private readonly api: Pick<CameraAPI, 'available' | 'call' | 'upload'>
  private readonly media: MediaDevices | undefined
  private stream?: MediaStream
  private credentials?: { id: string; token: string }
  private generation = 0
  private running = false
  private starting = false
  finished: Promise<void> = Promise.resolve()
  constructor(options: Options) { this.options = options; this.api = options.api || new CameraAPI(); this.media = options.mediaDevices || navigator.mediaDevices }
  private release() {
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined
    this.options.video.pause(); this.options.video.srcObject = null
  }
  async start(scenario: DemoScenario) {
    if (this.running || this.starting) throw new CameraError('Camera is already starting or running.')
    if (this.credentials) await this.stop()
    const generation = ++this.generation; this.starting = true; this.options.onState('STARTING')
    try {
      if (!await this.api.available()) throw new CameraError('Camera endpoints are not deployed on this backend.', 'UNSUPPORTED_DEPLOYMENT')
      if (generation !== this.generation) return
      if (!this.media?.getUserMedia) throw new CameraError('Camera requires HTTPS or localhost and browser camera support.', 'CAMERA_UNAVAILABLE')
      const stream = await this.media.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream
      stream.getTracks().forEach(track => track.addEventListener?.('ended', () => {
        if (generation === this.generation) void this.disconnect()
      }, { once: true }))
      this.options.video.srcObject = stream; await this.options.video.play()
      if (generation !== this.generation) return
      const created = await this.api.call('camera_start', [scenario, 'browser'])
      validateCameraSnapshot(created)
      if (typeof created.session_token !== 'string' || !created.session_token) throw new CameraError('Camera session did not provide a credential.', 'INVALID_RESPONSE')
      const credentials = { id: created.session_id, token: created.session_token }
      if (generation !== this.generation) { await this.close(credentials); return }
      this.credentials = credentials; this.running = true
      this.options.onResult(created); this.options.onState('RUNNING')
      this.finished = this.loop(generation)
    } catch (error) {
      if (generation === this.generation) { this.release(); this.running = false; this.options.onState('ERROR') }
      throw error
    } finally { this.starting = false }
  }
  private async close(credentials: { id: string; token: string }): Promise<CameraRecord> {
    const data = [credentials.id, credentials.token]; let stopError: unknown
    try { await this.api.call('camera_stop', data) } catch (error) { stopError = error }
    try { return await this.api.call('camera_report', [...data, 'STOPPED']) }
    catch (error) { throw stopError || error }
  }
  async stop() {
    const generation = ++this.generation; this.running = false; this.release(); this.options.onState('STOPPING')
    const credentials = this.credentials
    if (!credentials) { this.options.onState('STOPPED'); return }
    try {
      const result = await this.close(credentials)
      if (this.credentials === credentials) this.credentials = undefined
      if (generation === this.generation) this.options.onState('STOPPED')
      return result
    } catch (error) { if (generation === this.generation) this.options.onState('STOPPED_UNCONFIRMED'); throw error }
  }
  private async disconnect() {
    ++this.generation; this.running = false; this.release(); this.options.onState('DISCONNECTED')
    const credentials = this.credentials
    if (!credentials) return
    try { await this.api.call('camera_report', [credentials.id, credentials.token, 'DISCONNECTED']); await this.close(credentials) }
    catch (error) { this.options.onError(error instanceof Error ? error : new CameraError('Camera disconnected; backend result unknown.')) }
    finally { if (this.credentials === credentials) this.credentials = undefined }
  }
  private async loop(generation: number) {
    let sequence = 0
    while (this.running && generation === this.generation) {
      try {
        const credentials = this.credentials!
        const data = [credentials.id, credentials.token]
        const status = await this.api.call('camera_status', data)
        if (generation !== this.generation) return
        validateCameraSnapshot(status)
        if (status.session_id !== credentials.id) throw new CameraError('Camera session response mismatch.', 'INVALID_RESPONSE')
        if (status.camera.requested === 'STOPPED') { await this.stop(); return }
        this.options.onResult(status)
        const capturedAt = new Date().toISOString(); const frameSequence = ++sequence
        const blob = await this.options.capture(this.options.video, { capturedAt, sequence: frameSequence })
        if (generation !== this.generation) return
        const image = await this.api.upload(blob)
        if (generation !== this.generation) return
        const result = await this.api.call('camera_frame', [...data, image, frameSequence, capturedAt])
        if (generation !== this.generation) return
        validateCameraSnapshot(result)
        if (result.session_id !== credentials.id) throw new CameraError('Camera frame response mismatch.', 'INVALID_RESPONSE')
        this.options.onResult(result)
      } catch (error) {
        if (generation !== this.generation) return
        this.options.onError(error instanceof Error ? error : new CameraError('Camera frame unavailable.'))
        if (error instanceof CameraError && ['STOPPED', 'SESSION_NOT_FOUND', 'UNAUTHORIZED', 'STORAGE_UNAVAILABLE', 'INVALID_RESPONSE'].includes(error.code)) {
          try { await this.stop() } catch { /* Tracks are already released; UI remains unavailable. */ }
          return
        }
      }
      if (this.running && generation === this.generation) await new Promise(resolve => window.setTimeout(resolve, this.options.intervalMs ?? 1000))
    }
  }
}
