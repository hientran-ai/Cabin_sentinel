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
