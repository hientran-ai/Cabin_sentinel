import { useEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentProvider, useAgent } from '../store/AgentContext'
import { cloneScenario } from '../mocks/scenarios'
import { analyzeDemo, updateDemoIncident } from '../api/client'

vi.mock('../api/client', () => ({
  BACKEND_CAPABILITIES: { manualEmergencyActions: false, acknowledgement: false, simulationControls: false, demoAnalysis: true },
  subscribeToAgentState: vi.fn(() => () => {}), fetchEventHistory: vi.fn().mockResolvedValue([]),
  fetchSystemHealth: vi.fn().mockResolvedValue({ edgeConnected: true, internetAvailable: true, cameraStatus: 'OK', lastHeartbeat: new Date().toISOString() }),
  setExternalStateSource: vi.fn(), analyzeDemo: vi.fn(), executeEmergencyActions: vi.fn(), acknowledgeEvent: vi.fn(), updateSimulation: vi.fn(), updateDemoIncident: vi.fn(),
}))

let current: ReturnType<typeof useAgent>
function Probe() { const value = useAgent(); useEffect(() => { current = value }, [value]); return <span>{value.monitoringMode}:{String(value.current.decisionCurrent)}</span> }
describe('camera mode isolates upload sessions', () => {
  it('ignores a delayed REST incident update after starting camera monitoring', async () => {
    render(<AgentProvider><Probe /></AgentProvider>)
    vi.mocked(analyzeDemo).mockResolvedValue({ ...cloneScenario('SAFE'), vehicleId: 'DEMO_old_image', decisionCurrent: true })
    await act(async () => current.analyze(new File(['public test'], 'test.jpg'), 'normal'))
    let finish!: (state: ReturnType<typeof cloneScenario>) => void
    vi.mocked(updateDemoIncident).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = current.incidentOperation('acknowledge', 'old-incident', 1)
    await act(async () => current.setCameraTracking(true))
    await act(async () => current.receiveCameraState({ ...cloneScenario('SAFE'), vehicleId: 'DEMO_new_camera', decisionCurrent: true }))
    await act(async () => { finish({ ...cloneScenario('CRITICAL'), vehicleId: 'DEMO_old_image', decisionCurrent: true }); await pending })
    expect(current.current.vehicleId).toBe('DEMO_new_camera')
  })
  it('ignores a delayed camera stop response after switching back to image analysis', async () => {
    render(<AgentProvider><Probe /></AgentProvider>)
    await act(async () => current.setCameraTracking(true))
    await act(async () => current.receiveCameraState({ ...cloneScenario('SAFE'), vehicleId: 'DEMO_old_camera', decisionCurrent: true }))
    await act(async () => current.setCameraTracking(false))
    vi.mocked(analyzeDemo).mockResolvedValue({ ...cloneScenario('CRITICAL'), vehicleId: 'DEMO_new_image', decisionCurrent: true })
    await act(async () => current.analyze(new File(['public test'], 'test.jpg'), 'hot_locked'))
    await act(async () => { current.setCameraTracking(false); current.invalidateCameraState() })
    await act(async () => current.receiveCameraControlState({ ...cloneScenario('ERROR'), vehicleId: 'DEMO_old_camera', cameraStatus: 'NO_FEED', decisionCurrent: false }))
    expect(current.monitoringMode).toBe('IMAGE')
    expect(current.current.vehicleId).toBe('DEMO_new_image')
    expect(current.current.riskState).toBe('CRITICAL')
  })
  it('ignores control responses belonging to a previous camera session', async () => {
    render(<AgentProvider><Probe /></AgentProvider>)
    await act(async () => current.setCameraTracking(true))
    await act(async () => current.receiveCameraState({ ...cloneScenario('SAFE'), vehicleId: 'DEMO_new_camera', decisionCurrent: true }))
    await act(async () => current.setCameraTracking(false))
    await act(async () => current.receiveCameraControlState({ ...cloneScenario('ERROR'), vehicleId: 'DEMO_old_camera', cameraStatus: 'NO_FEED', decisionCurrent: false }))
    expect(current.current.vehicleId).toBe('DEMO_new_camera')
  })
  it('accepts camera backend states and invalidates them immediately on Stop/error', async () => {
    render(<AgentProvider><Probe /></AgentProvider>)
    await act(async () => current.setCameraTracking(true))
    expect(screen.getByText('CAMERA:false')).toBeInTheDocument()
    await act(async () => current.receiveCameraState({ ...cloneScenario('SAFE'), vehicleId: 'DEMO_camera', decisionCurrent: true, dataAgeMs: 0 }))
    expect(current.current.vehicleId).toBe('DEMO_camera')
    expect(current.connection).toBe('CONNECTED')
    const stop = vi.fn().mockResolvedValue(undefined)
    current.registerCameraStop(stop)
    await act(async () => current.stopCamera())
    expect(stop).toHaveBeenCalledOnce()
    await act(async () => current.setCameraTracking(false))
    expect(current.current.decisionCurrent).toBe(false)
    expect(current.current.cameraStatus).toBe('NO_FEED')
    expect(current.monitoringMode).toBe('CAMERA')
    await act(async () => current.receiveCameraControlState({ ...cloneScenario('ERROR'), vehicleId: 'DEMO_camera', revision: 100, cameraStatus: 'NO_FEED', decisionCurrent: false }))
    expect(current.current.riskState).toBe('ERROR')
  })
})
