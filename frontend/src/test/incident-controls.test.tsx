import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { cloneScenario } from '../mocks/scenarios'
const store = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../store/AgentContext', () => ({ useAgent: () => store.value }))
import { DemoIncidentControls } from '../components/actions/DemoIncidentControls'

describe('demo incident controls', () => {
  it('requires a cabin check and submits the displayed incident and revision without unlocking', async () => {
    const state = cloneScenario('WARNING'); state.revision = 8; state.occupancyState = 'ABSENT'; state.decisionCurrent = true
    state.incident = { incidentId: 'incident-8', status: 'OPEN' }
    const operation = vi.fn().mockResolvedValue(undefined)
    store.value = { current: state, effectiveDataAgeMs: 100, connection: 'CONNECTED', incidentOperation: operation }
    const { rerender } = render(<DemoIncidentControls />)
    expect(screen.getByRole('button', { name: /Submit cabin check/ })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/I have physically checked/))
    fireEvent.click(screen.getByRole('button', { name: /Submit cabin check/ }))
    expect(operation).toHaveBeenCalledWith('resolve', 'incident-8', 8)
    // A changed revision invalidates the physical-check checkbox, even for the same incident.
    state.revision = 9; rerender(<DemoIncidentControls />)
    expect(screen.getByLabelText(/I have physically checked/)).not.toBeChecked()
  })
  it('allows notification acknowledgement but disables cabin resolution for stale evidence', () => {
    const state = cloneScenario('CRITICAL'); state.decisionCurrent = false
    state.incident = { incidentId: 'incident-old', status: 'OPEN' }
    const operation = vi.fn().mockResolvedValue(undefined)
    store.value = { current: state, effectiveDataAgeMs: 4100, connection: 'CONNECTED', incidentOperation: operation }
    render(<DemoIncidentControls />)
    expect(screen.getByRole('button', { name: /Submit cabin check/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Mark notification read/ }))
    expect(operation).toHaveBeenCalledWith('acknowledge', 'incident-old', state.revision)
    expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument()
  })
})
