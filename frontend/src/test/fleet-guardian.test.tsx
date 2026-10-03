import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStaleCameraResult, type CameraSnapshot } from '../api/camera'
import { displayRisk, getVehicleState } from '../api/fleet'
import { FleetView } from '../pages/FleetView'
import { GuardianView } from '../pages/GuardianView'
import { viewFromHash } from '../routing'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function summary(id: string, risk = 'CRITICAL', extra: Record<string, unknown> = {}) {
  return { vehicle_id: id, vehicle_name: `Name ${id}`, data_source: 'SIMULATED', online: true, last_seen: new Date().toISOString(),
    risk_level: risk, decision_current: true, rule_id: 'R', revision: 2, occupancy: { state: 'PRESENT', counts: { person: 1 } },
    temperature_c: 39.2, doors_locked: true, alert_count: 1, active_incident: null, ...extra }
}
function state(id: string, risk = 'CRITICAL') {
  return { ...summary(id, risk), timestamp: new Date().toISOString(), as_of: new Date().toISOString(), explanation: `Explanation for ${id}`,
    sensors: { temperature_c: 39.2, doors_locked: true, door: 'locked', radar_presence: true, ignition: 'off', status: 'FRESH', age_s: 0.2, observed_at: null },
    vision: { camera_status: 'OK', detections: [{ class: 'person', confidence: 0.9 }], status: 'FRESH', age_s: 0.2, observed_at: null },
    risk: { risk_level: risk, rule_id: 'HOT_OCCUPANT', reason: 'r', occupancy_state: 'PRESENT', revision: 2, decision_current: true },
    incident: null, alert: null, unlock_request: { request_id: 'u', status: 'pending' },
    actions: [{ tool: 'trigger_horn', status: 'simulated' }, { tool: 'request_unlock', status: 'pending_human_confirmation' }],
    action_ledger: [], data_quality: { status: 'CURRENT', issues: [] } }
}
const login = { access_token: 'tok', role: 'admin', subject: 'fleet-admin', expires_at: '2026-10-04T00:00:00Z', owners: ['demo-owner'] }

describe('fleet API safety', () => {
  it('maps missing, non-current or disconnected verdicts to UNKNOWN, never SAFE', () => {
    expect(displayRisk(null, true)).toBe('UNKNOWN')
    expect(displayRisk('SAFE', false)).toBe('UNKNOWN')
    expect(displayRisk('SAFE', true, false)).toBe('UNKNOWN')
    expect(displayRisk('CRITICAL', true)).toBe('CRITICAL')
  })
  it('rejects a state response that belongs to another vehicle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(state('B'))))
    await expect(getVehicleState({ token: 't', role: 'admin', subject: 's', expiresAt: '', owners: [] }, 'A')).rejects.toThrow(/Invalid backend response/)
  })
  it('routes hashes to views without breaking owner in-page anchors', () => {
    expect(viewFromHash('#fleet')).toBe('fleet')
    expect(viewFromHash('#guardian')).toBe('guardian')
    expect(viewFromHash('#live-cabin')).toBe('owner')
    expect(viewFromHash('')).toBe('owner')
  })
  it('never lets an older camera frame replace a newer one in the same session', () => {
    const snap = (sequence: number, session = 's1') => ({ session_id: session, frame: { sequence, captured_at: '', width: 1, height: 1 } }) as unknown as CameraSnapshot
    expect(isStaleCameraResult(snap(11), snap(10))).toBe(true)
    expect(isStaleCameraResult(snap(10), snap(11))).toBe(false)
    expect(isStaleCameraResult(snap(11), snap(1, 's2'))).toBe(false)
    expect(isStaleCameraResult(undefined, snap(1))).toBe(false)
  })
})

describe('FleetView', () => {
  it('switching vehicles never shows the previous vehicle state, even when its response arrives late', async () => {
    let releaseA: (() => void) | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/demo-login')) return json(login)
      if (url.endsWith('/api/v1/vehicles')) return json({ vehicles: [summary('A'), summary('B', 'SAFE')] })
      if (url.includes('/vehicles/A/state')) { await new Promise<void>(resolve => { releaseA = resolve }); return json(state('A')) }
      if (url.includes('/vehicles/B/state')) return json(state('B', 'SAFE'))
      const id = url.includes('/vehicles/A/') ? 'A' : 'B'
      return json({ vehicle_id: id, events: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<FleetView />)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('button', { name: 'Select B' })
    await waitFor(() => expect(releaseA).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Select B' }))
    expect(await screen.findByText('Explanation for B')).toBeInTheDocument()
    await act(async () => { releaseA?.() })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByText('Explanation for A')).not.toBeInTheDocument()
    expect(document.querySelector('.vehicle-detail')?.getAttribute('data-vehicle-id')).toBe('B')
  })

  it('shows UNKNOWN on backend outage and recovers when the backend returns', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let down = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/demo-login')) return json(login)
      if (down) throw new TypeError('Failed to fetch')
      if (url.endsWith('/api/v1/vehicles')) return json({ vehicles: [summary('A')] })
      if (url.includes('/state')) return json(state('A'))
      return json({ vehicle_id: 'A', events: [] })
    }))
    render(<FleetView />)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Explanation for A')).toBeInTheDocument()
    expect(screen.getAllByText('CRITICAL').length).toBeGreaterThan(0)
    down = true
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    await waitFor(() => expect(screen.getByText(/Vehicle state unavailable/)).toBeInTheDocument())
    expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument()
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0)
    expect(screen.queryByText('SAFE')).not.toBeInTheDocument()
    expect(screen.queryByText(/sensor FRESH/)).not.toBeInTheDocument()
    expect(screen.getAllByText('last received · not current').length).toBe(4)
    down = false
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    await waitFor(() => expect(screen.queryByText(/Vehicle state unavailable/)).not.toBeInTheDocument())
    expect(screen.queryByText(/Fleet API unavailable/)).not.toBeInTheDocument()
    expect(screen.getByText('Explanation for A')).toBeInTheDocument()
  })

  it('records one check-in per click even when double-clicked', async () => {
    const posts: string[] = []
    let finish: (() => void) | undefined
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/demo-login')) return json(login)
      if (url.endsWith('/api/v1/vehicles')) return json({ vehicles: [summary('A')] })
      if (url.includes('/state')) return json(state('A'))
      if (url.endsWith('/vehicles/A/trips')) return json({ trip_id: 't1', vehicle_id: 'A', label: 'School pickup', created_at: '', guardian_token: 'g' })
      if (url.endsWith('/trips/t1/events')) { posts.push(String(init?.body)); await new Promise<void>(r => { finish = r }); return json({ trip_id: 't1', result: 'ACCEPTED', event: 'entered_vehicle' }) }
      return json({ vehicle_id: 'A', events: [] })
    }))
    render(<FleetView />)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(await screen.findByRole('button', { name: /Create trip/ }))
    const entered = await screen.findByRole('button', { name: /Child entered/ })
    fireEvent.click(entered); fireEvent.click(entered)
    await waitFor(() => expect(posts).toHaveLength(1))
    await act(async () => { finish?.() })
    expect(await screen.findByText('ACCEPTED: entered vehicle')).toBeInTheDocument()
    expect(posts).toHaveLength(1)
  })
})

describe('FleetView session expiry', () => {
  it('returns to sign-in with a clear message when the backend no longer accepts the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/demo-login')
      ? json(login) : json({ detail: 'Invalid or expired access token' }, 403)))
    render(<FleetView />)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Session expired or backend restarted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('GuardianView', () => {
  it('shows recorded child status, keeps the token out of the URL, and fails to UNKNOWN', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let down = false
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input))
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-guardian')
      if (down) throw new TypeError('Failed to fetch')
      return json({ trip_id: 't1', vehicle_id: 'A', vehicle_name: 'Family SUV', label: 'School pickup', child_status: 'INSIDE',
        last_event: 'entered_vehicle', timestamp: new Date().toISOString(), source: 'MANUAL_CHECKIN', confidence: null,
        identity_verified: false, event_count: 1, vehicle_safety: { risk_level: 'SAFE', decision_current: false, occupancy_state: 'UNKNOWN', evaluated_at: '' } })
    }))
    render(<GuardianView />)
    fireEvent.change(screen.getByLabelText('Trip ID'), { target: { value: 't1' } })
    fireEvent.change(screen.getByLabelText('Guardian token'), { target: { value: 'secret-guardian' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }))
    await waitFor(() => expect(screen.getByTestId('child-status')).toHaveTextContent('INSIDE'))
    expect(screen.queryByText('SAFE')).not.toBeInTheDocument()  // non-current vehicle verdict
    expect(urls.every(url => !url.includes('secret-guardian'))).toBe(true)
    down = true
    await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
    await waitFor(() => expect(screen.getByTestId('child-status')).toHaveTextContent('UNKNOWN'))
    expect(screen.getByText(/Last known \(historical\): INSIDE/)).toBeInTheDocument()
  })
})
