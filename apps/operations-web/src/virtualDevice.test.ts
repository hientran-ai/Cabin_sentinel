import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { HEARTBEAT_MS, TELEMETRY_MS, VIRTUAL_FIRMWARE, VirtualDevice, buildSensorPayload, buildVisionPayload, scenarioTemperature, type VirtualDeviceApi } from './virtualDevice'

const TOKEN = 'secret-device-token-123'

type MockedApi = { [K in keyof VirtualDeviceApi]: Mock<VirtualDeviceApi[K]> }
function fakeApi(overrides: Partial<Record<keyof VirtualDeviceApi, Mock>> = {}): MockedApi {
  return {
    heartbeat: vi.fn().mockResolvedValue({ ok: true }),
    ingest: vi.fn().mockResolvedValue({ result: 'ACCEPTED', risk_level: 'SAFE' }),
    commands: vi.fn().mockResolvedValue({ commands: [] }),
    ack: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as MockedApi
}
const flush = async () => { await vi.advanceTimersByTimeAsync(0) }

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T03:00:00.000Z')) })
afterEach(() => { vi.useRealTimers() })

describe('heartbeat loop', () => {
  it('sends a real heartbeat at once and then every 5 seconds with the virtual firmware', async () => {
    const api = fakeApi()
    const device = new VirtualDevice(api, { random: () => 0.5 })
    device.start(TOKEN, 'VIRT-1')
    await flush()
    expect(api.heartbeat).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3)
    expect(api.heartbeat).toHaveBeenCalledTimes(4)
    const [token, payload] = api.heartbeat.mock.calls[0]!
    expect(token).toBe(TOKEN)
    expect(payload).toMatchObject({ firmware: VIRTUAL_FIRMWARE, status: 'OK' })
    expect(VIRTUAL_FIRMWARE).toBe('virtual-web-1.0')
    device.stop()
  })

  it('lets the battery fall on every heartbeat and keeps the rssi jittering inside a plausible range', async () => {
    const api = fakeApi()
    let n = 0
    const device = new VirtualDevice(api, { random: () => [0, 1, 0.25, 0.75][n++ % 4]! })
    device.start(TOKEN, 'VIRT-1')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 5)
    const payloads = api.heartbeat.mock.calls.map(call => call[1] as { battery_pct: number; rssi_dbm: number })
    const batteries = payloads.map(item => item.battery_pct)
    expect(batteries.every((value, index) => index === 0 || value < batteries[index - 1]!)).toBe(true)
    expect(batteries.every(value => value > 0 && value <= 100)).toBe(true)
    const rssi = payloads.map(item => item.rssi_dbm)
    expect(new Set(rssi).size).toBeGreaterThan(1)
    expect(rssi.every(value => value <= -30 && value >= -95)).toBe(true)
    expect(device.snapshot().heartbeats).toBe(payloads.length)
    device.stop()
  })

  it('does not stack requests when the backend is slow', async () => {
    let release: () => void = () => {}
    const api = fakeApi({ heartbeat: vi.fn().mockImplementation(() => new Promise<void>(resolve => { release = resolve })) })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3)
    expect(api.heartbeat).toHaveBeenCalledTimes(1)
    release()
    await flush()
    device.stop()
  })
})

describe('sensor and vision telemetry', () => {
  it('sends sensors then vision every 2 seconds with increasing sequence numbers', async () => {
    const api = fakeApi()
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1', 'WARNING')
    await vi.advanceTimersByTimeAsync(TELEMETRY_MS * 2)
    const calls = api.ingest.mock.calls
    expect(calls.map(call => call[2])).toEqual(['sensors', 'vision', 'sensors', 'vision', 'sensors', 'vision'])
    const sequences = calls.filter(call => call[2] === 'sensors').map(call => (call[3] as { sequence: number }).sequence)
    expect(sequences.every((value, index) => index === 0 || value > sequences[index - 1]!)).toBe(true)
    expect(calls.every(call => call[0] === TOKEN && call[1] === 'VIRT-1')).toBe(true)
    device.stop()
  })

  it('sends metadata only: no image, frame bytes or data URL in either payload', () => {
    const now = new Date('2026-10-12T03:00:00Z')
    const sensor = buildSensorPayload('CRITICAL', 'VIRT-1', now, 7, 0)!
    const vision = buildVisionPayload('CRITICAL', 'VIRT-1', now, 7)!
    const text = JSON.stringify([sensor, vision])
    expect(text).not.toMatch(/image|jpeg|jpg|png|base64|data:|frame_data|bytes/i)
    expect(Object.keys(vision).sort()).toEqual(['camera_status', 'detected_objects', 'frame_id', 'timestamp', 'vehicle_id'])
    expect(vision.detected_objects).toEqual([{ class_name: 'person', confidence: 0.91 }])
  })

  it('builds the scenarios the rules engine expects', () => {
    const now = new Date('2026-10-12T03:00:00Z')
    expect(buildSensorPayload('SAFE', 'V', now, 1, 0)).toMatchObject({ temperature: 24, radar_presence: false, engine_status: 'OFF', doors_locked: true })
    expect(buildVisionPayload('SAFE', 'V', now, 1)!.detected_objects).toEqual([])
    expect(buildSensorPayload('WARNING', 'V', now, 1, 0)).toMatchObject({ temperature: 28, radar_presence: true })
    expect(buildSensorPayload('CRITICAL', 'V', now, 1, 0)).toMatchObject({ temperature: 39.2 })
  })

  it('ramps RAMP from 28 up to a 41 degree cap', () => {
    expect(scenarioTemperature('RAMP', 0)).toBe(28)
    expect(scenarioTemperature('RAMP', 4)).toBe(30)
    expect(scenarioTemperature('RAMP', 100)).toBe(41)
  })

  it('OFFLINE sends no telemetry at all (never an empty cabin) but keeps the heartbeat', async () => {
    const api = fakeApi()
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1', 'OFFLINE')
    await vi.advanceTimersByTimeAsync(TELEMETRY_MS * 3)
    expect(buildSensorPayload('OFFLINE', 'V', new Date(), 1, 0)).toBeNull()
    expect(buildVisionPayload('OFFLINE', 'V', new Date(), 1)).toBeNull()
    expect(api.ingest).not.toHaveBeenCalled()
    expect(api.heartbeat).toHaveBeenCalled()
    device.stop()
  })

  it('switches scenario on the fly and sends the new data straight away', async () => {
    const api = fakeApi()
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1', 'SAFE')
    await flush()
    api.ingest.mockClear()
    device.setScenario('CRITICAL')
    await flush()
    const sensor = api.ingest.mock.calls.find(call => call[2] === 'sensors')![3] as { temperature: number }
    expect(sensor.temperature).toBe(39.2)
    expect(device.snapshot().scenario).toBe('CRITICAL')
    device.stop()
  })

  it('shows the risk the backend computed from the last vision ingest', async () => {
    const api = fakeApi({ ingest: vi.fn().mockResolvedValue({ result: 'ACCEPTED', risk_level: 'CRITICAL' }) })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1', 'CRITICAL')
    await flush()
    expect(device.snapshot().lastIngestRisk).toBe('CRITICAL')
    device.stop()
  })
})

describe('commands', () => {
  it('polls for commands and acknowledges each one exactly once', async () => {
    const command = { command_id: 'c-1', vehicle_id: 'VIRT-1', type: 'horn' as const, status: 'sent' }
    const api = fakeApi({ commands: vi.fn().mockResolvedValue({ commands: [command] }) })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await vi.advanceTimersByTimeAsync(TELEMETRY_MS * 3)
    expect(api.commands).toHaveBeenCalled()
    expect(api.ack).toHaveBeenCalledTimes(1)
    expect(api.ack).toHaveBeenCalledWith(TOKEN, 'c-1', true, expect.stringContaining('simulated horn'))
    expect(device.snapshot().commands).toEqual([expect.objectContaining({ commandId: 'c-1', type: 'horn', ok: true })])
    device.stop()
  })

  it('retries an acknowledgement that failed with a transient error', async () => {
    const command = { command_id: 'c-2', vehicle_id: 'VIRT-1', type: 'horn' as const, status: 'sent' }
    const ack = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({})
    const api = fakeApi({ commands: vi.fn().mockResolvedValue({ commands: [command] }), ack })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await vi.advanceTimersByTimeAsync(TELEMETRY_MS * 2)
    expect(ack).toHaveBeenCalledTimes(2)
    expect(device.snapshot().commands).toHaveLength(1)
    device.stop()
  })
})

describe('lifecycle and token handling', () => {
  it('stops every timer on stop() and forgets the token', async () => {
    const api = fakeApi()
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await flush()
    device.stop()
    const heartbeats = api.heartbeat.mock.calls.length
    const ingests = api.ingest.mock.calls.length
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 4)
    expect(api.heartbeat).toHaveBeenCalledTimes(heartbeats)
    expect(api.ingest).toHaveBeenCalledTimes(ingests)
    expect(device.snapshot().running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never exposes the token in its observable state', async () => {
    const api = fakeApi({ heartbeat: vi.fn().mockRejectedValue(new Error('boom')) })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await flush()
    expect(JSON.stringify(device.snapshot())).not.toContain(TOKEN)
    device.stop()
    expect(JSON.stringify(device.snapshot())).not.toContain(TOKEN)
  })

  it('stops for good when the backend rejects the token (device revoked) instead of hammering it', async () => {
    const rejected = Object.assign(new Error('Device credential revoked'), { status: 401 })
    const api = fakeApi({ heartbeat: vi.fn().mockRejectedValue(rejected) })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3)
    expect(device.snapshot()).toMatchObject({ running: false, revoked: true })
    expect(api.heartbeat).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps running and reports the error on a transient failure', async () => {
    const api = fakeApi({ heartbeat: vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({}) })
    const device = new VirtualDevice(api)
    device.start(TOKEN, 'VIRT-1')
    await flush()
    expect(device.snapshot()).toMatchObject({ running: true, revoked: false, error: 'timeout' })
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(device.snapshot().error).toBeUndefined()
    device.stop()
  })

  it('notifies subscribers when its state changes', async () => {
    const device = new VirtualDevice(fakeApi())
    const listener = vi.fn()
    const unsubscribe = device.subscribe(listener)
    device.start(TOKEN, 'VIRT-1')
    await flush()
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    device.stop()
  })
})
