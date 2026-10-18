import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

const session = { id: 's1', token: 'test-token' }
const respond = (value: unknown, status = 200) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify(value), { status }))
afterEach(() => vi.unstubAllGlobals())

describe('API read model refuses unverified response shapes', () => {
  it.each([{}, null, { risk_level: 'SAFE' }, { freshness: null }, { risk_level: 'UNRECOGNIZED' }])('rejects malformed state %j rather than trusting it', async (value) => {
    respond(value)
    await expect(api.state(session)).rejects.toMatchObject({ status: 502 })
  })
  it('rejects malformed JSON with a recoverable error without logging response data', async () => {
    vi.stubGlobal('fetch', async () => new Response('{ not json'))
    await expect(api.state(session)).rejects.toMatchObject({ status: 502 })
  })
  it('refuses notifications without channel state before components read nested fields', async () => {
    respond([{ notification_id: 1, channels: null }])
    await expect(api.notifications(session)).rejects.toMatchObject({ status: 502 })
  })
  it('rejects missing readiness model and malformed session credentials', async () => {
    respond({})
    await expect(api.status()).rejects.toMatchObject({ status: 502 })
    await expect(api.createSession()).rejects.toMatchObject({ status: 502 })
  })
  it.each([500, 503, 401, 403])('keeps HTTP %i explicit', async (status) => {
    respond({ detail: 'Unavailable' }, status)
    await expect(api.state(session)).rejects.toMatchObject({ status })
  })
  it('accepts an empty notifications list', async () => {
    respond([])
    await expect(api.notifications(session)).resolves.toEqual([])
  })
})
