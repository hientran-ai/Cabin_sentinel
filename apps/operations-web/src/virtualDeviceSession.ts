import type { JsonRecord } from '@cabinsentinel/api-client'
import type { V1DemoScenarioId, V1DevicePairing } from '@cabinsentinel/contracts'
import { VIRTUAL_FIRMWARE, type VirtualDevice, type VirtualDeviceSnapshot } from './virtualDevice'

export type SessionPhase = 'idle' | 'vehicle' | 'code' | 'running' | 'stopped'

export interface SessionAdminApi {
  createVehicle(payload: JsonRecord): Promise<JsonRecord>
  issuePairingCode(vehicleId: string): Promise<JsonRecord>
  pair(pairingCode: string, serial: string, firmware: string): Promise<V1DevicePairing>
  revokeDevice(deviceId: string): Promise<unknown>
  retireVehicle(vehicleId: string): Promise<unknown>
}

export interface SessionSnapshot {
  phase: SessionPhase
  busy: boolean
  vehicleId?: string
  deviceId?: string
  pairingCode?: string
  pairingExpiresAt?: string
  error?: string
  device: VirtualDeviceSnapshot
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomId = (length: number, random: () => number) => Array.from({ length }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('')
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Request failed'

/**
 * The browser-side life of one virtual device: create a VIRT vehicle, issue a pairing code, pair, run, then revoke.
 * The device token goes straight from pair() into the device and is never stored here.
 */
export class VirtualDeviceSession {
  private state: SessionSnapshot
  private listeners = new Set<() => void>()
  private revoking?: Promise<void>

  constructor(private readonly admin: SessionAdminApi, private readonly device: VirtualDevice, private readonly random: () => number = Math.random) {
    this.state = { phase: 'idle', busy: false, device: device.snapshot() }
    device.subscribe(() => this.set({ device: device.snapshot() }))
  }

  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(patch: Partial<SessionSnapshot>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }

  private async run(action: () => Promise<Partial<SessionSnapshot>>) {
    if (this.state.busy) return
    this.set({ busy: true, error: undefined })
    try {
      this.set({ ...(await action()), busy: false })
    } catch (error) {
      this.set({ busy: false, error: messageOf(error) })
    }
  }

  createVehicle(ownerId?: string) {
    return this.run(async () => {
      const vehicleId = `VIRT-${randomId(4, this.random)}`
      const created = await this.admin.createVehicle({ vehicle_id: vehicleId, name: `Xe ảo ${vehicleId}`, model: 'Virtual device (SIMULATED)', ...(ownerId ? { owner_id: ownerId } : {}) })
      return { phase: 'vehicle' as const, vehicleId: String(created.vehicle_id ?? vehicleId), deviceId: undefined, pairingCode: undefined, pairingExpiresAt: undefined }
    })
  }

  issueCode() {
    return this.run(async () => {
      if (!this.state.vehicleId) throw new Error('Chưa có xe ảo')
      const issued = await this.admin.issuePairingCode(this.state.vehicleId)
      return { phase: 'code' as const, pairingCode: String(issued.pairing_code), pairingExpiresAt: typeof issued.expires_at === 'string' ? issued.expires_at : undefined }
    })
  }

  pairAndStart(scenario: V1DemoScenarioId) {
    return this.run(async () => {
      const { pairingCode } = this.state
      if (!pairingCode || !this.state.vehicleId) throw new Error('Chưa có mã ghép')
      const paired = await this.admin.pair(pairingCode, `virtual-web-${randomId(8, this.random).toLowerCase()}`, VIRTUAL_FIRMWARE)
      this.device.start(paired.device_token, paired.vehicle_id, scenario)
      return { phase: 'running' as const, deviceId: paired.device_id, pairingCode: undefined, pairingExpiresAt: undefined }
    })
  }

  setScenario(scenario: V1DemoScenarioId) { this.device.setScenario(scenario) }

  /** Synchronous half of stop(): halts every timer and drops the token without any network call. */
  stopSending() { this.device.stop() }

  /** Stop sending and revoke the device token on the backend. Safe to call twice; never rejects. */
  stop(): Promise<void> {
    this.device.stop()
    const { deviceId } = this.state
    if (!deviceId) return Promise.resolve()
    this.revoking ??= this.admin.revokeDevice(deviceId)
      .then(() => { this.set({ phase: 'stopped', deviceId: undefined, error: undefined }) })
      .catch((error: unknown) => { this.set({ phase: 'stopped', error: `Không thu hồi được token: ${messageOf(error)}` }) })
      .finally(() => { this.revoking = undefined })
    return this.revoking
  }

  /** Remove the VIRT vehicle (soft retire) once the device is stopped. */
  async retire() {
    await this.stop()
    const { vehicleId } = this.state
    if (!vehicleId) return
    await this.run(async () => {
      await this.admin.retireVehicle(vehicleId)
      return { phase: 'idle' as const, vehicleId: undefined, deviceId: undefined, pairingCode: undefined, pairingExpiresAt: undefined }
    })
  }
}
