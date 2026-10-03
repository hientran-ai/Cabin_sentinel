import { afterEach, describe, expect, it, vi } from 'vitest'

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response

describe('backend API client', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('uploads multipart demo input and follows the backend vehicle for history', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false')
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000/')
    vi.stubEnv('VITE_VEHICLE_ID', 'CAR_1')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        session_id: 'demo-1', session_token: 'test-token',
        vision: { source: 'MODEL_INFERENCE', detections: [], latency_ms: 12 },
        vehicle_state: { vehicle_id: 'DEMO_demo-1', timestamp: '2026-09-30T01:00:00Z', temperature: 40, engine_status: 'OFF', doors_locked: true, scenario: 'hot_locked' },
        reasoning: { revision: 1, risk_level: 'SAFE', rule_id: 'NONE', reason: 'No occupant', occupancy_state: 'ABSENT', decision_current: true, freshness: {} },
        actions: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        vehicle_id: 'DEMO_demo-1', revision: 2, previous_risk_level: 'ERROR',
        risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', reason: 'No occupant or radar presence detected',
        occupancy_state: 'ABSENT', occupancy_reason_code: 'NO_OCCUPANT_EVIDENCE',
        radar_presence: false, detected_objects: [], action_results: [],
        evaluated_at: '2026-09-30T01:00:01Z', decision_current: true,
        freshness: { vision: { status: 'FRESH', age_s: 0.1 }, sensor: { status: 'FRESH', age_s: 0.2 } },
      }))
      .mockResolvedValueOnce(jsonResponse([]))
    const { analyzeDemo, fetchEventHistory, updateDemoIncident, USE_MOCKS } = await import('../api/client')
    const image = new File(['image-bytes'], 'cabin.png', { type: 'image/png' })

    const state = await analyzeDemo(image, 'hot_locked')
    const [, uploadInit] = fetchMock.mock.calls[0]
    expect(USE_MOCKS).toBe(false)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/demo/analyze')
    expect(uploadInit).toMatchObject({ method: 'POST', credentials: 'omit' })
    const body = uploadInit?.body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('scenario')).toBe('hot_locked')
    expect(body.get('image')).toBe(image)
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/v1/demo/sessions/demo-1')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer test-token')
    expect(state).toMatchObject({ revision: 2, previousRiskState: 'ERROR', occupancyState: 'ABSENT', radarPresence: false })

    await fetchEventHistory()
    expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:8000/api/v1/demo/sessions/demo-1/events?limit=50')
    // The public API binds physical cabin verification to this exact incident/revision.
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'State changed; inspect the current revision' }, 409))
    await expect(updateDemoIncident('resolve', 'incident-1', 2)).rejects.toThrow(/State changed/)
    expect(fetchMock.mock.calls[3][0]).toBe('http://localhost:8000/api/v1/demo/sessions/demo-1/resolve')
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({ incident_id: 'incident-1', revision: 2, cabin_checked: true })
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('Authorization')).toBe('Bearer test-token')
    // Repeated analysis reuses the owned session rather than dropping the incident.
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Vision model unavailable' }, 503))
    await expect(analyzeDemo(image, 'normal')).rejects.toThrow(/Vision model unavailable/)
    expect((fetchMock.mock.calls[4]?.[1]?.body as FormData)?.get('session_id')).toBe('demo-1')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
