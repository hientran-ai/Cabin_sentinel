import { describe, expect, it, vi } from 'vitest'
import { ApiError, CabinSentinelClient, applyRevisionedEvent } from './index'

describe('CabinSentinelClient', () => {
  it('normalizes API errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'DENIED', message: 'Not allowed', correlationId: 'c-1' }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher })
    await expect(client.me()).rejects.toMatchObject({ status: 403, code: 'DENIED', correlationId: 'c-1' } satisfies Partial<ApiError>)
  })

  it('adds auth and idempotency without retrying mutations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'i-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test/', getAccessToken: async () => 'token', fetch: fetcher })
    await client.acknowledgeIncident('i-1', 8, 'CABIN_CHECKED', 'key-1')
    const init = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token')
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('key-1')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('uses the merged V1 demo auth and protected fleet routes', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'demo-token', role: 'admin', subject: 'fleet-admin', expires_at: '2026-01-01T00:00:00Z', owners: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ role: 'admin', subject: 'fleet-admin', trip_id: null, vehicle_ids: ['VF8-DEMO-01'] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    let token: string | undefined
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher, getAccessToken: async () => token })

    token = (await client.v1DemoLogin('admin')).access_token
    await client.v1Me()

    const [loginUrl, loginInit] = fetcher.mock.calls[0] as [string, RequestInit]
    const [, meInit] = fetcher.mock.calls[1] as [string, RequestInit]
    expect(loginUrl).toBe('https://example.test/api/v1/auth/demo-login')
    expect(JSON.parse(String(loginInit.body))).toEqual({ role: 'admin' })
    expect(new Headers(meInit.headers).get('Authorization')).toBe('Bearer demo-token')
  })

  it('uses production session endpoints without attaching a stale access token', async () => {
    const session = {
      access_token: 'fresh-token',
      token_type: 'bearer',
      expires_at: '2026-10-03T10:00:00Z',
      user: { id: 'user-1', email: 'owner@example.com', full_name: 'Owner', role: 'owner', is_active: true },
    }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const getAccessToken = vi.fn().mockResolvedValue('stale-token')
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher, getAccessToken, credentials: 'include' })

    await client.v1PlatformLogin('owner@example.com', 'secret')

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.test/api/v1/auth/login')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'owner@example.com', password: 'secret', use_cookie: true })
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
    expect(init.credentials).toBe('include')
    expect(getAccessToken).not.toHaveBeenCalled()
  })
})

describe('demo studio and device channel', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('talks to the demo endpoints with the admin session', async () => {
    const fetcher = vi.fn().mockImplementation(async () => json({ ok: true }))
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher, getAccessToken: async () => 'admin-token' })
    await client.v1AdminDemoStatus()
    await client.v1AdminDemoRun('VF8-DEMO-01', 'CRITICAL')
    await client.v1AdminDemoReset()
    await client.v1AdminDemoNotifyTest()
    const calls = fetcher.mock.calls as Array<[string, RequestInit]>
    expect(calls.map(([url, init]) => `${init.method ?? 'GET'} ${new URL(url).pathname}`)).toEqual([
      'GET /api/v1/admin/demo/status', 'POST /api/v1/admin/demo/run', 'POST /api/v1/admin/demo/reset', 'POST /api/v1/admin/demo/notify-test',
    ])
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({ vehicle_id: 'VF8-DEMO-01', scenario: 'CRITICAL' })
    expect(new Headers(calls[0]![1].headers).get('Authorization')).toBe('Bearer admin-token')
  })

  it('does not retry the status probe, so a disabled studio (404) is reported at once', async () => {
    const fetcher = vi.fn().mockImplementation(async () => json({ detail: 'Demo studio is disabled' }, 404))
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher })
    await expect(client.v1AdminDemoStatus()).rejects.toMatchObject({ status: 404 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sends device calls with the device token only: no user bearer, no cookies', async () => {
    const fetcher = vi.fn().mockImplementation(async () => json({ commands: [] }))
    const getAccessToken = vi.fn().mockResolvedValue('user-token')
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher, getAccessToken, credentials: 'include' })
    await client.v1DeviceHeartbeat('dev-token', { firmware: 'virtual-web-1.0', battery_pct: 90, rssi_dbm: -60, status: 'OK' })
    await client.v1DeviceIngest('dev-token', 'VIRT-1', 'sensors', { sequence: 1 })
    await client.v1DeviceCommands('dev-token')
    await client.v1DeviceAck('dev-token', 'c-1', true, 'done')
    const calls = fetcher.mock.calls as Array<[string, RequestInit]>
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/v1/device/heartbeat', '/api/v1/vehicles/VIRT-1/sensors', '/api/v1/device/commands', '/api/v1/device/commands/c-1/ack',
    ])
    for (const [, init] of calls) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer dev-token')
      expect(init.credentials).toBe('omit')
    }
    expect(getAccessToken).not.toHaveBeenCalled()
  })

  it('pairs without any Authorization header', async () => {
    const fetcher = vi.fn().mockImplementation(async () => json({ device_id: 'd', vehicle_id: 'VIRT-1', device_token: 't' }, 201))
    const client = new CabinSentinelClient({ baseUrl: 'https://example.test', fetch: fetcher, getAccessToken: async () => 'user-token' })
    const paired = await client.v1DevicePair('ABCD1234', 'virtual-web-x', 'virtual-web-1.0')
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/api/v1/devices/pair')
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
    expect(JSON.parse(String(init.body))).toEqual({ pairing_code: 'ABCD1234', serial: 'virtual-web-x', firmware: 'virtual-web-1.0' })
    expect(paired.device_token).toBe('t')
  })
})

describe('revision updates', () => {
  const event = (revision: number) => ({ id: String(revision), type: 'incident.updated' as const, revision, occurredAt: '', data: { revision } })
  it('never replaces newer cached data', () => {
    const cache = { revision: 5, value: { revision: 5 } }
    expect(applyRevisionedEvent(cache, event(5))).toBe(cache)
    expect(applyRevisionedEvent(cache, event(4))).toBe(cache)
    expect(applyRevisionedEvent(cache, event(6)).revision).toBe(6)
  })
})
