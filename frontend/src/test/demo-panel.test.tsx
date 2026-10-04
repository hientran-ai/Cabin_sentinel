import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DemoAnalysisPanel } from '../components/DemoAnalysisPanel'

describe('DemoAnalysisPanel', () => {
  it('sends the selected image and backend scenario without rendering a raw preview', async () => {
    const analyze = vi.fn().mockResolvedValue(undefined)
    render(<DemoAnalysisPanel pending={false} onAnalyze={analyze} />)
    const image = new File(['image-bytes'], 'cabin.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Cabin image'), image)
    await userEvent.selectOptions(screen.getByLabelText('Vehicle scenario'), 'parked_locked')
    await userEvent.click(screen.getByRole('button', { name: /Analyze with CabinSentinel/ }))
    expect(analyze).toHaveBeenCalledWith(image, 'parked_locked')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('rejects unsupported files before calling the backend', async () => {
    const analyze = vi.fn()
    render(<DemoAnalysisPanel pending={false} onAnalyze={analyze} />)
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })
    const input = screen.getByLabelText('Cabin image') as HTMLInputElement
    await userEvent.upload(input, file, { applyAccept: false })
    await userEvent.click(screen.getByRole('button', { name: /Analyze with CabinSentinel/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Only JPEG and PNG')
    expect(analyze).not.toHaveBeenCalled()
  })

  it('keeps upload disabled until the Vision model is ready', () => {
    render(<DemoAnalysisPanel pending={false} visionReady={false} onAnalyze={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Vision model unavailable')
    expect(screen.getByRole('button', { name: /Analyze with CabinSentinel/ })).toBeDisabled()
  })
})
