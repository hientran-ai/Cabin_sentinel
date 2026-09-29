import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CabinFeed } from '../components/video/CabinFeed'
import { cloneScenario } from '../mocks/scenarios'
import { FreshnessAlert } from '../components/status/FreshnessAlert'

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
})
