import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneScenario } from '../mocks/scenarios'
import type { AgentState } from '../types/agent'

const api = vi.hoisted(() => ({
  action: vi.fn<() => Promise<AgentState>>(),
  acknowledge: vi.fn<() => Promise<AgentState>>(),
  stateListener: undefined as ((state: AgentState) => void) | undefined,
}))

vi.mock('../api/client', () => ({
  USE_MOCKS: true,
  subscribeToAgentState: (onState: (state: AgentState) => void, onConnection: (connected: boolean) => void) => {
    api.stateListener = onState
    onConnection(true)
    onState(cloneScenario('CRITICAL'))
    return () => undefined
  },
  fetchEventHistory: vi.fn().mockResolvedValue([]),
  fetchSystemHealth: vi.fn().mockResolvedValue({ edgeConnected: true, internetAvailable: true, cameraStatus: 'OK', lastHeartbeat: new Date().toISOString() }),
  executeEmergencyActions: api.action,
  acknowledgeEvent: api.acknowledge,
  updateSimulation: vi.fn(),
}))

import { AgentProvider, useAgent } from '../store/AgentContext'

function Harness() {
  const agent = useAgent()
  return <div>
    <span>risk:{agent.current.riskState}</span>
    <span>age:{Math.floor(agent.effectiveDataAgeMs)}</span>
    <span>tools:{agent.current.toolResults.map((tool) => tool.status).join(',')}</span>
    <button type="button" onClick={() => { void agent.runEmergencyActions(); void agent.runEmergencyActions() }}>Run twice</button>
  </div>
}

describe('AgentProvider safety invariants', () => {
  beforeEach(() => {
    api.action.mockReset()
    api.acknowledge.mockReset()
  })

  it('deduplicates same-event emergency calls before React can rerender', async () => {
    let finish: ((state: AgentState) => void) | undefined
    api.action.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    render(<AgentProvider><Harness /></AgentProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Run twice' }))
    expect(api.action).toHaveBeenCalledTimes(1)
    await act(async () => finish?.(cloneScenario('CRITICAL')))
  })

  it('does not let action success or partial failure resolve CRITICAL', async () => {
    const response = cloneScenario('SAFE')
    response.eventId = cloneScenario('CRITICAL').eventId
    response.toolResults = [
      { action: 'TRIGGER_HORN', status: 'SUCCESS' },
      { action: 'CRACK_WINDOW', status: 'FAILED' },
      { action: 'SEND_SMS', status: 'SUCCESS' },
    ]
    api.action.mockResolvedValue(response)
    render(<AgentProvider><Harness /></AgentProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Run twice' }))
    expect(screen.getByText('risk:CRITICAL')).toBeInTheDocument()
    expect(screen.getByText('tools:SUCCESS,FAILED,SUCCESS')).toBeInTheDocument()
  })

  it('fails closed when the backend omits a tool result', async () => {
    const response = cloneScenario('CRITICAL')
    response.toolResults = [{ action: 'TRIGGER_HORN', status: 'SUCCESS' }]
    api.action.mockResolvedValue(response)
    render(<AgentProvider><Harness /></AgentProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Run twice' }))
    expect(screen.getByText('tools:SUCCESS,FAILED,FAILED')).toBeInTheDocument()
    expect(screen.getByText('risk:CRITICAL')).toBeInTheDocument()
  })

  it('ignores an out-of-order older realtime state', () => {
    render(<AgentProvider><Harness /></AgentProvider>)
    const oldSafe = cloneScenario('SAFE')
    oldSafe.timestamp = new Date(0).toISOString()
    act(() => api.stateListener?.(oldSafe))
    expect(screen.getByText('risk:CRITICAL')).toBeInTheDocument()
  })

  it('ages data locally when no new realtime message arrives', () => {
    vi.useFakeTimers()
    render(<AgentProvider><Harness /></AgentProvider>)
    act(() => { vi.advanceTimersByTime(3100) })
    expect(Number(screen.getByText(/age:/).textContent?.replace('age:', ''))).toBeGreaterThan(3000)
    vi.useRealTimers()
  })
})
