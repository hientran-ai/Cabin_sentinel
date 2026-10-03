import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CabinFeed } from '../components/video/CabinFeed'
import { cloneScenario } from '../mocks/scenarios'
import { FreshnessAlert } from '../components/status/FreshnessAlert'
import { DecisionInsights } from '../components/DecisionInsights'

describe('fail-safe dashboard data', () => {
  it('shows camera outage without inferring SAFE', () => {
    render(<CabinFeed state={cloneScenario('ERROR')} />)
    expect(screen.getByText('Camera blocked')).toBeInTheDocument()
    expect(screen.getByText(/No safety inference/)).toBeInTheDocument()
  })

  it('warns when data is older than three seconds', () => {
    render(<FreshnessAlert dataAgeMs={3001} />)
    expect(screen.getByText(/Data is stale/)).toBeInTheDocument()
  })

  it('withholds evidence when a detected person is not explicitly face-blurred', () => {
    const state = cloneScenario('WARNING')
    state.evidenceFrameUrl = '/evidence.jpg'
    state.objects[0].faceBlurred = false
    render(<CabinFeed state={state} />)
    expect(screen.getAllByText('Evidence withheld')).toHaveLength(2)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('rejects evidence hosted outside the app or configured API origin', () => {
    const state = cloneScenario('WARNING')
    state.evidenceFrameUrl = 'https://untrusted.example/evidence.jpg'
    render(<CabinFeed state={state} />)
    expect(screen.getByText('Evidence withheld', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders backend reasoning, conflicts, seat evidence and unlock lifecycle', () => {
    const state = cloneScenario('CRITICAL')
    state.revision = 23
    state.previousRiskState = 'WARNING'
    state.radarPresence = true
    state.reasoningLatencyMs = 3.25
    state.evidenceConflicts = [{ type: 'TIMESTAMP_SKEW', detail: 'Sensor and Vision timestamps differ by 2.4 seconds.' }]
    state.seatConfigurationState = 'NOT_ENOUGH_EVIDENCE'
    state.seatEvidence = [{ evidenceId: 'seat-1', childSeatPresent: true, orientation: 'REAR_FACING', orientationConfidence: 0.82, position: 'rear-left', source: 'camera-a', quality: 'OK' }]
    render(<DecisionInsights state={state} />)
    expect(screen.getByText('Revision 23')).toBeInTheDocument()
    expect(screen.getByText('WARNING → CRITICAL')).toBeInTheDocument()
    expect(screen.getByText('OCCUPANT CONFIRMED', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('PRESENCE')).toBeInTheDocument()
    expect(screen.getByText('3.3 ms')).toBeInTheDocument()
    expect(screen.getByText('Timestamp skew')).toBeInTheDocument()
    expect(screen.getByText('rear-left')).toBeInTheDocument()
    expect(screen.getByText(/Unlock request · PENDING/)).toBeInTheDocument()
  })
})
