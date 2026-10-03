import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { cloneScenario } from '../mocks/scenarios'
const store = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../store/AgentContext', () => ({ useAgent: () => store.value }))
import { Overview } from '../pages/Overview'

describe('current risk display', () => {
  it.each([
    { decisionCurrent: false, age: 0, connection: 'CONNECTED' },
    { decisionCurrent: true, age: 3100, connection: 'CONNECTED' },
    { decisionCurrent: true, age: 0, connection: 'RECONNECTING' },
  ])('withholds the current SAFE badge for unavailable evidence (%o)', ({ decisionCurrent, age, connection }) => {
    const state = cloneScenario('SAFE'); state.decisionCurrent = decisionCurrent
    store.value = { current: state, history: [], health: { edgeConnected: true, internetAvailable: true, cameraStatus: 'OK', lastHeartbeat: new Date().toISOString() }, connection,
      capabilities: { demoAnalysis: false }, effectiveDataAgeMs: age }
    render(<Overview />)
    expect(document.querySelector('.hero-status .risk-badge')?.textContent).not.toContain('SAFE')
    expect(screen.getByRole('heading', { name: 'Current decision unavailable' })).toBeInTheDocument()
    expect(screen.getByText(/Last backend verdict: SAFE/)).toBeInTheDocument()
  })
})
