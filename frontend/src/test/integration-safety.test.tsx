import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adaptBackendState } from '../api/adapter'
import { ActionProgress } from '../components/actions/ActionProgress'
import { UnlockRequestStatus } from '../components/actions/UnlockRequestStatus'
import { SensorGrid } from '../components/sensors/SensorGrid'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules() })

describe('backend evidence presentation', () => {
  it('displays missing sensor values as UNKNOWN instead of invented telemetry', () => {
    render(<SensorGrid state={adaptBackendState({ risk_level: 'ERROR' })} />)
    expect(screen.queryByText('0.0°C')).not.toBeInTheDocument()
    expect(screen.queryByText('LOCKED')).not.toBeInTheDocument()
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(3)
  })
  it('treats missing freshness from either source as unavailable current evidence', () => {
    for (const freshness of [
      { vision: { status: 'FRESH', age_s: 0.1 } },
      { sensor: { status: 'FRESH', age_s: 0.1 } },
      { sensor: { status: 'FRESH', age_s: 0.1 }, vision: { status: 'UNKNOWN', age_s: 0.1 } },
      { sensor: { status: 'FRESH', age_s: -1 }, vision: { status: 'FRESH', age_s: 0.1 } },
    ] as const) {
      expect(adaptBackendState({ risk_level: 'SAFE', decision_current: true, freshness }).dataAgeMs).toBeGreaterThan(3000)
    }
  })
  it('preserves a malformed SAFE verdict only as history when telemetry is missing', () => {
    const mapped = adaptBackendState({ risk_level: 'SAFE', decision_current: true,
      freshness: { sensor: { status: 'FRESH', age_s: 0.1 }, vision: { status: 'FRESH', age_s: 0.1 } } })
    expect(mapped.riskState).toBe('SAFE')
    expect(mapped.decisionCurrent).toBe(false)
  })
  it('retains unknown action results and labels simulated execution in Vietnamese', () => {
    render(<ActionProgress tools={adaptBackendState({ action_results: [
      { tool: 'trigger_horn', status: 'simulated' },
      { tool: 'request_unlock', status: 'unknown' },
    ] }).toolResults} />)
    expect(screen.getByText(/Mô phỏng/)).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.getByText('Request unlock')).toBeInTheDocument()
  })
  it('distinguishes an earlier pending action from a currently canceled unlock request', () => {
    const state = adaptBackendState({ unlock_request: { request_id: 'req-1', status: 'canceled', incident_id: 'incident-1' },
      action_ledger: [{ tool: 'request_unlock', status: 'pending_human_confirmation', revision: 1, incident_id: 'incident-1' }] })
    render(<><UnlockRequestStatus request={state.unlockRequest} /><ActionProgress tools={state.toolResults} /></>)
    expect(screen.getByText(/Current unlock request: canceled/)).toBeInTheDocument()
    expect(screen.getByText('PENDING_CONFIRMATION')).toBeInTheDocument()
    expect(screen.getByText(/Recorded at revision 1/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('shows durable planned and attempted actions even when current evaluation has no results', () => {
    render(<ActionProgress tools={adaptBackendState({ action_results: [], action_ledger: [
      { action_key: 'car:1:trigger_horn', tool: 'trigger_horn', status: 'planned', outcome: 'not_attempted', revision: 1 },
      { action_key: 'car:1:send_sms', tool: 'send_sms', status: 'attempted', outcome: 'unknown', revision: 1 },
    ] }).toolResults} />)
    expect(screen.getByText('PLANNED')).toBeInTheDocument()
    expect(screen.getByText('ATTEMPTED')).toBeInTheDocument()
    expect(screen.queryByText('SUCCESS')).not.toBeInTheDocument()
  })
})

describe('HTTP failures fail explicitly', () => {
  it('rejects malformed successful demo responses without accepting a SAFE snapshot', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ risk_level: 'SAFE' })))
    const { analyzeDemo } = await import('../api/client')
    await expect(analyzeDemo(new File(['x'], 'c.png', { type: 'image/png' }), 'normal')).rejects.toThrow(/Invalid backend response/)
  })
  it('rejects HTML health responses instead of claiming a model is ready', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>loading</html>', { headers: { 'Content-Type': 'text/html' } }))
    const { fetchSystemHealth } = await import('../api/client')
    await expect(fetchSystemHealth()).rejects.toThrow(/Invalid backend response/)
  })
  it('aborts stalled analysis and reports timeout without retrying the upload', async () => {
    vi.useFakeTimers()
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const { analyzeDemo } = await import('../api/client')
    const result = analyzeDemo(new File(['x'], 'c.png', { type: 'image/png' }), 'normal')
    const check = expect(result).rejects.toThrow(/Timeout/)
    await vi.advanceTimersByTimeAsync(90_001)
    await check
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
