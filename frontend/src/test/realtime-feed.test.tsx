import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneScenario } from '../mocks/scenarios'
const mocked = vi.hoisted(() => ({ available: vi.fn(), state: { setCameraTracking: vi.fn(), receiveCameraState: vi.fn(), invalidateCameraState: vi.fn(), analysisPending: false, effectiveDataAgeMs: 4000, current: {} } }))
vi.mock('../store/AgentContext', () => ({ useAgent: () => mocked.state }))
vi.mock('../api/camera', async importOriginal => ({ ...await importOriginal<typeof import('../api/camera')>(), CameraAPI: class { available = mocked.available } }))
vi.mock('../api/cameraStream', () => ({ CameraStream: class {
  options: { onState: (state: string) => void; onError: (error: Error) => void }
  constructor(options: { onState: (state: string) => void; onError: (error: Error) => void }) { this.options = options }
  async start() { this.options.onState('RUNNING'); this.options.onError(new Error('Camera network interrupted')) }
  async stop() { this.options.onState('STOPPED') }
} }))
import { RealtimeCabinFeed } from '../components/video/RealtimeCabinFeed'

beforeEach(() => { mocked.available.mockReset(); mocked.state.current = cloneScenario('ERROR') })
afterEach(() => vi.restoreAllMocks())
describe('realtime feed controls', () => {
  it('shows unsupported live camera contract and does not ask for a webcam', async () => {
    mocked.available.mockResolvedValue(false)
    render(<RealtimeCabinFeed state={cloneScenario('ERROR')} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bật camera' })).toBeDisabled())
    expect(screen.getByText(/chưa có 5 endpoint camera/i)).toBeInTheDocument()
    expect(document.querySelector('video')).toHaveAttribute('hidden')
    expect(screen.getByText(/có thể bỏ sót mặt nhỏ/)).toBeInTheDocument()
  })
  it('requires explicit image transmission consent even when camera endpoints are available', async () => {
    mocked.available.mockResolvedValue(true)
    render(<RealtimeCabinFeed state={cloneScenario('ERROR')} />)
    await waitFor(() => expect(mocked.available).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Bật camera' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/đồng ý gửi frame gốc/i))
    expect(screen.getByRole('button', { name: 'Bật camera' })).toBeEnabled()
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })
  it('clears a prior network error after stopping is confirmed', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    mocked.available.mockResolvedValue(true)
    render(<RealtimeCabinFeed state={cloneScenario('ERROR')} />)
    await waitFor(() => expect(mocked.available).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText(/đồng ý gửi frame gốc/i))
    fireEvent.click(screen.getByRole('button', { name: 'Bật camera' }))
    expect(await screen.findByText('Camera network interrupted')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tắt camera' }))
    await waitFor(() => expect(screen.queryByText('Camera network interrupted')).not.toBeInTheDocument())
  })
})
