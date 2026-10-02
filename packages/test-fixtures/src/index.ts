import type { Incident, RiskLevel, Vehicle, VehicleStatus } from '@cabinsentinel/contracts'

const now = '2026-10-02T08:00:00.000Z'

export function vehicleStatus(riskLevel: RiskLevel, overrides: Partial<VehicleStatus> = {}): VehicleStatus {
  return {
    vehicleId: 'vehicle-aurora',
    temperatureC: 34.8,
    occupancyLabel: riskLevel === 'SAFE' ? 'No occupant evidence reported' : 'Possible occupant detected',
    activeIncidentId: riskLevel === 'SAFE' ? undefined : 'incident-1042',
    decision: {
      riskLevel,
      ruleId: `FIXTURE_${riskLevel}`,
      reason: riskLevel === 'ERROR' ? 'Camera unavailable; the cabin cannot be verified.' : `Backend fixture verdict: ${riskLevel}.`,
      revision: 12,
      evaluatedAt: now,
      decisionCurrent: riskLevel !== 'ERROR',
      recommendedAction: riskLevel === 'SAFE' ? 'No action is currently recommended.' : 'Check the cabin directly now.',
      evidence: [{ id: 'e-1', kind: 'occupancy', label: 'Occupancy signal', observedAt: now, source: 'edge', summary: 'Privacy-safe detection metadata', privacySafe: true }],
    },
    device: { deviceId: 'edge-7', edge: 'CONNECTED', cloud: 'CONNECTED', camera: riskLevel === 'ERROR' ? 'ERROR' : 'OK', lastHeartbeatAt: now, modelVersion: 'demo-1', ruleVersion: 'rules-3' },
    ...overrides,
  }
}

export const vehicles: Vehicle[] = [
  { id: 'vehicle-aurora', displayName: 'Toyota Aurora', registrationLabel: 'CABIN 01', status: vehicleStatus('WARNING') },
  { id: 'vehicle-borealis', displayName: 'Volvo Borealis', registrationLabel: 'CABIN 02', status: vehicleStatus('SAFE', { vehicleId: 'vehicle-borealis', activeIncidentId: undefined, temperatureC: 25.4 }) },
]

export function incident(riskLevel: RiskLevel = 'WARNING'): Incident {
  const status = vehicleStatus(riskLevel)
  return {
    id: 'incident-1042', vehicleId: status.vehicleId, status: 'active', createdAt: now, updatedAt: now,
    decision: status.decision,
    revisions: [{ revision: status.decision.revision, evaluatedAt: now, riskLevel, ruleId: status.decision.ruleId, reason: status.decision.reason }],
    actions: [{ id: 'action-1', type: 'owner_notification', status: 'acknowledged', requestedAt: now, updatedAt: now, message: 'Delivery acknowledged by provider; cabin response is not implied.' }],
  }
}

export const scenarios = {
  SAFE: vehicleStatus('SAFE'), NOTICE: vehicleStatus('NOTICE'), WARNING: vehicleStatus('WARNING'), CRITICAL: vehicleStatus('CRITICAL'), ERROR: vehicleStatus('ERROR'),
  stale: vehicleStatus('WARNING', { decision: { ...vehicleStatus('WARNING').decision, decisionCurrent: false }, device: { ...vehicleStatus('WARNING').device, cloud: 'DEGRADED' } }),
  cameraUnavailable: vehicleStatus('ERROR'),
  backendDisconnected: vehicleStatus('WARNING', { device: { ...vehicleStatus('WARNING').device, cloud: 'OFFLINE' } }),
  deviceOffline: vehicleStatus('WARNING', { device: { ...vehicleStatus('WARNING').device, edge: 'OFFLINE' } }),
} as const
