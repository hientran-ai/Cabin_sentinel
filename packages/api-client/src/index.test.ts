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

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://example.test/api/v1/auth/demo-login')
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ role: 'admin' })
    expect(new Headers((fetcher.mock.calls[1]?.[1] as RequestInit).headers).get('Authorization')).toBe('Bearer demo-token')
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
