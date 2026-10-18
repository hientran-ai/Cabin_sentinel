import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { pollOnce, useE2e } from './store'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); useE2e.setState({ session: null }) })

it('marks the first invalid backend response unverified immediately', async () => {
  useE2e.setState({ session: { id: 's1', token: 'test' }, connection: 'ok', failures: 0 })
  vi.spyOn(api, 'state').mockRejectedValue(new ApiError(502, 'invalid data'))
  vi.spyOn(api, 'notifications').mockResolvedValue([])
  vi.spyOn(api, 'history').mockResolvedValue({ items: [], next_after: 0 })
  await pollOnce()
  expect(useE2e.getState().connection).toBe('lost')
})

it('coalesces repeated session-reset taps into one new session and preserves the model-status outage', async () => {
  useE2e.setState({ session: null, serviceError: 'Model status unavailable' })
  let finish!: (response: Response) => void
  let creates = 0
  vi.stubGlobal('fetch', () => { creates += 1; return new Promise<Response>((resolve) => { finish = resolve }) })
  const a = useE2e.getState().newSession()
  const b = useE2e.getState().newSession()
  expect(creates).toBe(1)
  finish(new Response(JSON.stringify({ session_id: 'new', session_token: 'test', vehicle_id: 'DEMO_new' })))
  await Promise.all([a, b])
  expect(useE2e.getState().session?.id).toBe('new')
  expect(useE2e.getState().serviceError).toBe('Model status unavailable')
})
