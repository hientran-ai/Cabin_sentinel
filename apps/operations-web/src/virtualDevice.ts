import type { JsonRecord } from '@cabinsentinel/api-client'
import type { V1DemoScenarioId, V1DeviceCommand, V1DeviceHeartbeat } from '@cabinsentinel/contracts'

/** A software stand-in for the in-car edge unit. Everything it sends is SIMULATED metadata: never an image. */
export const VIRTUAL_FIRMWARE = 'virtual-web-1.0'
export const HEARTBEAT_MS = 5_000
export const TELEMETRY_MS = 2_000

export interface VirtualDeviceApi {
  heartbeat(token: string, payload: V1DeviceHeartbeat): Promise<unknown>
  ingest(token: string, vehicleId: string, kind: 'sensors' | 'vision', payload: JsonRecord): Promise<unknown>
  commands(token: string): Promise<{ commands: V1DeviceCommand[] }>
  ack(token: string, commandId: string, ok: boolean, detail: string): Promise<unknown>
}

export interface HandledCommand { commandId: string; type: string; ok: boolean; at: string }

export interface VirtualDeviceSnapshot {
  running: boolean
  /** Set when the backend rejected the device token (revoked): the loops stop and never retry. */
  revoked: boolean
  vehicleId?: string
  scenario: V1DemoScenarioId
  batteryPct: number
  rssiDbm: number
  heartbeats: number
  telemetry: number
  lastHeartbeatAt?: string
  lastTelemetryAt?: string
  lastIngestRisk?: string
  commands: HandledCommand[]
  error?: string
}

interface Scenario { temperature: number | null; radar: boolean; person: boolean; ramp?: number; max?: number }
/** Same inputs as the backend demo studio uses, so the rules engine (not this file) decides every risk level. */
const SCENARIOS: Record<V1DemoScenarioId, Scenario> = {
  SAFE: { temperature: 24, radar: false, person: false },
  WARNING: { temperature: 28, radar: true, person: true },
  CRITICAL: { temperature: 39.2, radar: true, person: true },
  RAMP: { temperature: 28, radar: true, person: true, ramp: 0.5, max: 41 },
  OFFLINE: { temperature: null, radar: false, person: false },
  VIDEO: { temperature: null, radar: false, person: false }, // never offered here: a video camera runs in the Camera simulator
}

export function scenarioTemperature(scenario: V1DemoScenarioId, tick: number): number | null {
  const spec = SCENARIOS[scenario]
  if (spec.temperature === null) return null
  const value = spec.ramp ? Math.min(spec.max ?? spec.temperature, spec.temperature + spec.ramp * tick) : spec.temperature
  return Math.round(value * 10) / 10
}

/** Sensor snapshot for the backend SensorPayload. `null` means the scenario sends nothing (OFFLINE). */
export function buildSensorPayload(scenario: V1DemoScenarioId, vehicleId: string, now: Date, sequence: number, tick: number): JsonRecord | null {
  const temperature = scenarioTemperature(scenario, tick)
  if (temperature === null) return null
  return {
    schema_version: 1, vehicle_id: vehicleId, timestamp: now.toISOString(), sequence, temperature,
    engine_status: 'OFF', doors_locked: true, radar_presence: SCENARIOS[scenario].radar, driver_present: false,
    gear: 'P', vehicle_speed_kph: 0, hvac_status: 'INACTIVE', window_status: 'CLOSED', powertrain_type: 'EV', operation_mode: 'NONE',
  }
}

/** Vision metadata only: class names and confidences. There is deliberately no image field. */
export function buildVisionPayload(scenario: V1DemoScenarioId, vehicleId: string, now: Date, sequence: number): JsonRecord | null {
  if (SCENARIOS[scenario].temperature === null) return null
  return {
    vehicle_id: vehicleId, timestamp: now.toISOString(), frame_id: `virtual-web-${sequence}`, camera_status: 'OK',
    detected_objects: SCENARIOS[scenario].person ? [{ class_name: 'person', confidence: 0.91 }] : [],
  }
}

export interface VirtualDeviceOptions {
  now?: () => Date
  random?: () => number
  heartbeatMs?: number
  telemetryMs?: number
}

const isRejected = (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && [401, 403].includes((error as { status: number }).status)
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Request failed'

export class VirtualDevice {
  private token?: string
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private telemetryTimer?: ReturnType<typeof setInterval>
  private heartbeatBusy = false
  private telemetryBusy = false
  private sequence = 0
  private tick = 0
  private acked = new Set<string>()
  private errors: Record<'heartbeat' | 'telemetry', string | undefined> = { heartbeat: undefined, telemetry: undefined }
  private listeners = new Set<() => void>()
  private readonly now: () => Date
  private readonly random: () => number
  private readonly heartbeatMs: number
  private readonly telemetryMs: number
  private current: VirtualDeviceSnapshot = { running: false, revoked: false, scenario: 'SAFE', batteryPct: 100, rssiDbm: -58, heartbeats: 0, telemetry: 0, commands: [] }

  constructor(private readonly api: VirtualDeviceApi, options: VirtualDeviceOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.random = options.random ?? Math.random
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
    this.telemetryMs = options.telemetryMs ?? TELEMETRY_MS
  }

  /** The token stays in this object's memory only: it is not part of the snapshot and is dropped on stop(). */
  snapshot = (): VirtualDeviceSnapshot => this.current
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  private update(patch: Partial<VirtualDeviceSnapshot>) {
    this.current = { ...this.current, ...patch }
    this.listeners.forEach(listener => listener())
  }

  start(token: string, vehicleId: string, scenario: V1DemoScenarioId = 'SAFE') {
    this.stop()
    this.token = token
    this.sequence = Math.max(this.sequence, this.now().getTime())
    this.tick = 0
    this.acked.clear()
    this.errors = { heartbeat: undefined, telemetry: undefined }
    this.update({ running: true, revoked: false, vehicleId, scenario, batteryPct: 100, rssiDbm: -58, heartbeats: 0, telemetry: 0, commands: [], error: undefined, lastHeartbeatAt: undefined, lastTelemetryAt: undefined, lastIngestRisk: undefined })
    void this.sendHeartbeat()
    void this.sendTelemetry()
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), this.heartbeatMs)
    this.telemetryTimer = setInterval(() => void this.sendTelemetry(), this.telemetryMs)
  }

  setScenario(scenario: V1DemoScenarioId) {
    this.tick = 0
    this.update({ scenario })
    if (this.token) void this.sendTelemetry()
  }

  stop() {
    clearInterval(this.heartbeatTimer)
    clearInterval(this.telemetryTimer)
    this.heartbeatTimer = this.telemetryTimer = undefined
    this.token = undefined
    if (this.current.running) this.update({ running: false })
  }

  /** Each loop owns its own error so one loop succeeding never hides the other one failing. */
  private setError(source: 'heartbeat' | 'telemetry', message: string | undefined) {
    this.errors[source] = message
    this.update({ error: this.errors.heartbeat ?? this.errors.telemetry })
  }

  private reject(error: unknown) {
    this.stop()
    this.update({ revoked: true, error: messageOf(error) })
  }

  private async sendHeartbeat() {
    const token = this.token
    if (!token || this.heartbeatBusy) return
    this.heartbeatBusy = true
    try {
      const batteryPct = Math.max(1, Math.round((this.current.batteryPct - 0.2) * 10) / 10)
      const rssiDbm = Math.min(-30, Math.max(-95, Math.round(-58 + (this.random() - 0.5) * 14)))
      await this.api.heartbeat(token, { firmware: VIRTUAL_FIRMWARE, battery_pct: batteryPct, rssi_dbm: rssiDbm, status: 'OK' })
      if (this.token !== token) return
      this.update({ batteryPct, rssiDbm, heartbeats: this.current.heartbeats + 1, lastHeartbeatAt: this.now().toISOString() })
      this.setError('heartbeat', undefined)
    } catch (error) {
      if (isRejected(error)) this.reject(error)
      else if (this.token === token) this.setError('heartbeat', messageOf(error))
    } finally {
      this.heartbeatBusy = false
    }
  }

  private async sendTelemetry() {
    const token = this.token
    const vehicleId = this.current.vehicleId
    if (!token || !vehicleId || this.telemetryBusy) return
    this.telemetryBusy = true
    try {
      const now = this.now()
      this.sequence = Math.max(this.sequence + 1, now.getTime())
      const scenario = this.current.scenario
      const sensors = buildSensorPayload(scenario, vehicleId, now, this.sequence, this.tick)
      const vision = buildVisionPayload(scenario, vehicleId, now, this.sequence)
      this.tick += 1
      if (sensors && vision) {
        await this.api.ingest(token, vehicleId, 'sensors', sensors)
        const result = await this.api.ingest(token, vehicleId, 'vision', vision) as { risk_level?: string } | undefined
        if (this.token !== token) return
        this.update({ telemetry: this.current.telemetry + 1, lastTelemetryAt: now.toISOString(), lastIngestRisk: result?.risk_level ?? this.current.lastIngestRisk })
        this.setError('telemetry', undefined)
      }
      await this.pollCommands(token)
    } catch (error) {
      if (isRejected(error)) this.reject(error)
      else if (this.token === token) this.setError('telemetry', messageOf(error))
    } finally {
      this.telemetryBusy = false
    }
  }

  private async pollCommands(token: string) {
    const { commands } = await this.api.commands(token)
    for (const command of commands) {
      if (this.token !== token || this.acked.has(command.command_id)) continue
      this.acked.add(command.command_id)
      let ok = true
      try {
        // Nothing physical happens: the horn is a ledger entry on the virtual device.
        await this.api.ack(token, command.command_id, true, `virtual-web: simulated ${command.type}`)
      } catch (error) {
        if (isRejected(error)) throw error
        ok = false
        this.acked.delete(command.command_id)
        this.setError('telemetry', messageOf(error))
      }
      if (ok) this.update({ commands: [{ commandId: command.command_id, type: command.type, ok, at: this.now().toISOString() }, ...this.current.commands].slice(0, 8) })
    }
  }
}
