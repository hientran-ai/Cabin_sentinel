import { afterEach, expect, it, vi } from 'vitest'
import { api } from './api'
import type { SensorInput } from './types'

afterEach(() => vi.unstubAllGlobals())

it('retries a sensor update without trip_ended when an older backend rejects the field, and stops sending it', async () => {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)); bodies.push(b)
    return 'trip_ended' in b ? new Response(JSON.stringify({ detail: [{ type: 'extra_forbidden', loc: ['body', 'trip_ended'] }] }), { status: 422 }) : new Response(JSON.stringify({ committed: { revision: 3 } }))
  })
  const body = { temperature: 30, engine_status: 'OFF', doors_locked: true, radar_presence: false, trip_ended: false } as unknown as SensorInput
  await expect(api.sensor({ id: 's', token: 't' }, body)).resolves.toMatchObject({ committed: { revision: 3 } })
  expect(bodies.map((b) => 'trip_ended' in b)).toEqual([true, false])
  await api.sensor({ id: 's', token: 't' }, body)
  expect(bodies.map((b) => 'trip_ended' in b)).toEqual([true, false, false])   // remembered: no further rejected round trip
})
