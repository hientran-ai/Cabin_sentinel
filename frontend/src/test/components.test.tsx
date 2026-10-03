import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CriticalModal } from '../components/alerts/CriticalModal'
import { ResolutionForm } from '../components/actions/ResolutionForm'
import { RiskBadge } from '../components/status/RiskBadge'
import { StateAlerts } from '../components/alerts/StateAlerts'
import { cloneScenario } from '../mocks/scenarios'
import type { RiskState } from '../types/agent'

describe('risk states', () => {
  it.each(['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR'] as RiskState[])('renders %s', (state) => {
    render(<RiskBadge state={state} />)
    expect(screen.getByText(state)).toBeInTheDocument()
  })

  it('never labels a camera error as safe', () => {
    render(<StateAlerts state={cloneScenario('ERROR')} />)
    expect(screen.getByText('Safety status unavailable')).toBeInTheDocument()
    expect(screen.queryByText('SAFE')).not.toBeInTheDocument()
  })

  it('NOTICE renders informational copy without emergency controls', () => {
    render(<StateAlerts state={cloneScenario('NOTICE')} />)
    expect(screen.getByText('Attention recommended')).toBeInTheDocument()
    expect(screen.queryByText('Sound horn + crack window')).not.toBeInTheDocument()
  })
})

describe('CriticalModal', () => {
  it('shows a collapsed inline alert without resolving the incident', () => {
    render(<CriticalModal state={cloneScenario('CRITICAL')} actionPending={false} acknowledgementPending={false} onAction={vi.fn()} onAcknowledge={vi.fn()} />)
    const dialog = screen.getByRole('alert', { name: 'Critical cabin risk' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(screen.getByText('Chi tiết và thao tác').closest('details')).not.toHaveAttribute('open')
    expect(dialog).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()
  })

  it('disables repeated action clicks while actions are running', () => {
    const onAction = vi.fn()
    const state = cloneScenario('CRITICAL')
    state.toolResults = state.toolResults.map((tool) => ({ ...tool, status: 'RUNNING' }))
    render(<CriticalModal state={state} actionPending={false} acknowledgementPending={false} onAction={onAction} onAcknowledge={vi.fn()} />)
    fireEvent.click(screen.getByText('Chi tiết và thao tác'))
    const button = screen.getByRole('button', { name: /Emergency actions running/i })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('allows focus outside the alert', () => {
    render(<><button type="button">Outside</button><CriticalModal state={cloneScenario('CRITICAL')} actionPending={false} acknowledgementPending={false} onAction={vi.fn()} onAcknowledge={vi.fn()} /></>)
    screen.getByRole('button', { name: 'Outside' }).focus()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
  })

  it('shows fallback and remains critical on partial tool failure', () => {
    const state = cloneScenario('CRITICAL')
    state.toolResults = [
      { action: 'TRIGGER_HORN', status: 'SUCCESS' },
      { action: 'CRACK_WINDOW', status: 'FAILED' },
      { action: 'SEND_SMS', status: 'SUCCESS' },
    ]
    render(<CriticalModal state={state} actionPending={false} acknowledgementPending={false} onAction={vi.fn()} onAcknowledge={vi.fn()} />)
    expect(screen.getByText(/One or more actions failed/)).toBeInTheDocument()
    expect(screen.getByRole('alert', { name: 'Critical cabin risk' })).toBeInTheDocument()
  })
})

describe('ResolutionForm', () => {
  it('submits the selected backend acknowledgement reason', async () => {
    const acknowledge = vi.fn().mockResolvedValue(undefined)
    render(<ResolutionForm onSubmit={acknowledge} pending={false} status="PENDING" />)
    await userEvent.click(screen.getByLabelText('Keep event active'))
    await userEvent.click(screen.getByRole('button', { name: 'Send acknowledgement' }))
    expect(acknowledge).toHaveBeenCalledWith('KEEP_ACTIVE')
  })

  it('prevents resubmitting an acknowledged event', () => {
    render(<ResolutionForm onSubmit={vi.fn()} pending={false} status="ACKNOWLEDGED" />)
    expect(screen.getByRole('button', { name: 'Acknowledgement sent' })).toBeDisabled()
  })
})
