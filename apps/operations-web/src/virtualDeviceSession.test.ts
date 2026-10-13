import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { VirtualDevice } from './virtualDevice'
import { VirtualDeviceSession, type SessionAdminApi } from './virtualDeviceSession'

const TOKEN = 'secret-device-token-xyz'

type MockedAdmin = { [K in keyof SessionAdminApi]: Mock<SessionAdminApi[K]> }
function setup(overrides: Partial<Record<keyof SessionAdminApi, Mock>> = {}) {
  const deviceApi = {
    heartbeat: vi.fn().mockResolvedValue({}),
    ingest: vi.fn().mockResolvedValue({ risk_level: 'SAFE' }),
    commands: vi.fn().mockResolvedValue({ commands: [] }),
    ack: vi.fn().mockResolvedValue({}),
  }
  const admin = ({
    createVehicle: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => ({ vehicle_id: payload.vehicle_id })),
    issuePairingCode: vi.fn().mockResolvedValue({ pairing_code: 'ABCD1234', expires_at: '2026-10-12T03:10:00Z' }),
    pair: vi.fn().mockResolvedValue({ device_id: 'dev-1', vehicle_id: 'VIRT-AAAA', device_token: TOKEN }),
    revokeDevice: vi.fn().mockResolvedValue({}),
    retireVehicle: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown) as MockedAdmin
  const device = new VirtualDevice(deviceApi)
  return { session: new VirtualDeviceSession(admin, device, () => 0), device, admin, deviceApi }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('virtual device session', () => {
  it('creates a VIRT vehicle for the chosen owner, then issues a code, pairs and starts the device', async () => {
    const { session, admin, deviceApi } = setup()
    await session.createVehicle('demo-owner')
    expect(admin.createVehicle).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: 'VIRT-AAAA', owner_id: 'demo-owner' }))
    expect(session.snapshot()).toMatchObject({ phase: 'vehicle', vehicleId: 'VIRT-AAAA' })
    await session.issueCode()
    expect(admin.issuePairingCode).toHaveBeenCalledWith('VIRT-AAAA')
    expect(session.snapshot()).toMatchObject({ phase: 'code', pairingCode: 'ABCD1234' })
    await session.pairAndStart('SAFE')
    expect(admin.pair).toHaveBeenCalledWith('ABCD1234', expect.stringMatching(/^virtual-web-/), 'virtual-web-1.0')
    expect(session.snapshot()).toMatchObject({ phase: 'running', deviceId: 'dev-1', pairingCode: undefined })
    await vi.advanceTimersByTimeAsync(0)
    expect(deviceApi.heartbeat).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ firmware: 'virtual-web-1.0' }))
    await session.stop()
  })

  it('keeps the device token out of the session state', async () => {
    const { session } = setup()
    await session.createVehicle()
    await session.issueCode()
    await session.pairAndStart('SAFE')
    await vi.advanceTimersByTimeAsync(0)
    expect(JSON.stringify(session.snapshot())).not.toContain(TOKEN)
    await session.stop()
  })

  it('revokes the device token when stopped, and only once if stopped twice', async () => {
    const { session, admin, deviceApi } = setup()
    await session.createVehicle()
    await session.issueCode()
    await session.pairAndStart('SAFE')
    await Promise.all([session.stop(), session.stop()])
    expect(admin.revokeDevice).toHaveBeenCalledTimes(1)
    expect(admin.revokeDevice).toHaveBeenCalledWith('dev-1')
    expect(session.snapshot()).toMatchObject({ phase: 'stopped', deviceId: undefined })
    const beats = deviceApi.heartbeat.mock.calls.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(deviceApi.heartbeat).toHaveBeenCalledTimes(beats)
  })

  it('does not call revoke when nothing was paired', async () => {
    const { session, admin } = setup()
    await session.stop()
    await session.createVehicle()
    await session.stop()
    expect(admin.revokeDevice).not.toHaveBeenCalled()
  })

  it('still stops sending when the revoke call fails, and says so', async () => {
    const { session, deviceApi } = setup({ revokeDevice: vi.fn().mockRejectedValue(new Error('offline')) })
    await session.createVehicle()
    await session.issueCode()
    await session.pairAndStart('SAFE')
    await session.stop()
    expect(session.snapshot().error).toContain('thu hồi')
    const beats = deviceApi.heartbeat.mock.calls.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(deviceApi.heartbeat).toHaveBeenCalledTimes(beats)
  })

  it('reports a pairing failure and stays on the code step', async () => {
    const { session } = setup({ pair: vi.fn().mockRejectedValue(new Error('Pairing code is invalid or expired')) })
    await session.createVehicle()
    await session.issueCode()
    await session.pairAndStart('SAFE')
    expect(session.snapshot()).toMatchObject({ phase: 'code', busy: false, error: 'Pairing code is invalid or expired' })
  })

  it('retires the VIRT vehicle after revoking the device', async () => {
    const { session, admin } = setup()
    await session.createVehicle()
    await session.issueCode()
    await session.pairAndStart('SAFE')
    await session.retire()
    expect(admin.revokeDevice).toHaveBeenCalledBefore(admin.retireVehicle)
    expect(admin.retireVehicle).toHaveBeenCalledWith('VIRT-AAAA')
    expect(session.snapshot()).toMatchObject({ phase: 'idle', vehicleId: undefined })
  })
})
