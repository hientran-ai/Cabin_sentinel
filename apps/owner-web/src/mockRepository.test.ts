import { describe, expect, it } from 'vitest'
import { mockRepository, scenarioOrder, scenarioSnapshot } from './mockRepository'

describe('Owner Web demo repository', () => {
  it('exposes every safety and degraded demo state', () => {
    expect(scenarioOrder).toEqual([
      'safe', 'notice', 'warning', 'critical', 'action_failure', 'camera', 'stale', 'offline',
    ])
    expect(scenarioOrder.map((id) => scenarioSnapshot(id).riskLevel)).toEqual([
      'SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'CRITICAL', 'ERROR', 'WARNING', 'WARNING',
    ])
  })

  it('keeps failures explicit and never resolves a critical state', () => {
    const state = scenarioSnapshot('action_failure')
    expect(state.riskLevel).toBe('CRITICAL')
    expect(state.actions.some((action) => action.status === 'FAILED')).toBe(true)
    expect(state.recommendation.vi.toLocaleLowerCase('vi')).toContain('kiểm tra cabin')
  })

  it('marks stale and camera-unavailable decisions as unverified', () => {
    expect(scenarioSnapshot('stale').decisionCurrent).toBe(false)
    expect(scenarioSnapshot('camera')).toMatchObject({ riskLevel: 'ERROR', occupancy: 'UNKNOWN' })
  })

  it('provides mock resources through a replaceable repository interface', async () => {
    const [vehicles, incidents, telemetry, realtime, settings] = await Promise.all([
      mockRepository.listVehicles(), mockRepository.listIncidents(), mockRepository.getCabinTelemetry('aurora'), mockRepository.getCabinRealtimeState('aurora'), mockRepository.getNotificationSettings(),
    ])
    expect(vehicles).toHaveLength(2)
    expect(incidents.map((incident) => incident.id)).toContain('INC-24022')
    expect(telemetry).toHaveLength(7)
    expect(telemetry.every((sample, index) => index === 0 || Date.parse(sample.recordedAt) > Date.parse(telemetry[index - 1]!.recordedAt))).toBe(true)
    expect(telemetry.at(-1)?.occupancyConfidence).toBeGreaterThan(0.9)
    expect(realtime).toMatchObject({ feedState: 'LIVE', modelState: 'RUNNING', facesBlurredAtEdge: true, transport: 'WEBRTC' })
    expect(realtime.inferenceAt).toBeTruthy()
    expect(settings.push).toBe(true)
  })
})
