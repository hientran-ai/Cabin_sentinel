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

describe('revision updates', () => {
  const event = (revision: number) => ({ id: String(revision), type: 'incident.updated' as const, revision, occurredAt: '', data: { revision } })
  it('never replaces newer cached data', () => {
    const cache = { revision: 5, value: { revision: 5 } }
    expect(applyRevisionedEvent(cache, event(5))).toBe(cache)
    expect(applyRevisionedEvent(cache, event(4))).toBe(cache)
    expect(applyRevisionedEvent(cache, event(6)).revision).toBe(6)
  })
})
