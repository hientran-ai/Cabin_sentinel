import type { AgentState, RiskState, SystemHealth } from '../types/agent'

const now = () => new Date().toISOString()

const tools: AgentState['toolResults'] = [
  { action: 'TRIGGER_HORN', status: 'IDLE' },
  { action: 'CRACK_WINDOW', status: 'IDLE' },
  { action: 'SEND_SMS', status: 'IDLE' },
]

const base: AgentState = {
  eventId: 'EVT-2409',
  timestamp: now(),
  riskState: 'SAFE',
  ruleId: 'RULE-001',
  reason: 'Cabin conditions are normal while the engine is running.',
  cameraStatus: 'OK',
  sensors: { temperatureC: 27, engine: 'ON', doorsLocked: false },
  objects: [],
  durationSeconds: 0,
  internetAvailable: true,
  dataAgeMs: 420,
  toolResults: tools,
  acknowledgementStatus: 'NONE',
}

export const scenarios: Record<RiskState, AgentState> = {
  SAFE: base,
  NOTICE: {
    ...base,
    eventId: 'EVT-2410',
    riskState: 'NOTICE',
    ruleId: 'RULE-A04',
    reason: 'Engine switched off and an unattended backpack was detected.',
    sensors: { temperatureC: 28.2, engine: 'OFF', doorsLocked: false },
    objects: [{ class: 'backpack', confidence: 0.91, bbox: [64, 42, 310, 286] }],
    durationSeconds: 46,
  },
  WARNING: {
    ...base,
    eventId: 'EVT-2411',
    riskState: 'WARNING',
    ruleId: 'RULE-P12',
    reason: 'A person remains in the cabin with the engine off.',
    sensors: { temperatureC: 33.4, engine: 'OFF', doorsLocked: false },
    objects: [{ class: 'person', confidence: 0.96, bbox: [104, 28, 334, 348], faceBlurred: true }],
    durationSeconds: 131,
  },
  CRITICAL: {
    ...base,
    eventId: 'EVT-2412',
    riskState: 'CRITICAL',
    ruleId: 'RULE-P17',
    reason: 'Person detected in a locked cabin at a dangerous temperature.',
    sensors: { temperatureC: 38.7, engine: 'OFF', doorsLocked: true },
    objects: [{ class: 'person', confidence: 0.98, bbox: [110, 22, 342, 350], faceBlurred: true }],
    durationSeconds: 248,
    acknowledgementStatus: 'PENDING',
  },
  ERROR: {
    ...base,
    eventId: 'EVT-2413',
    riskState: 'ERROR',
    ruleId: 'SYSTEM-C02',
    reason: 'Camera feed is blocked. Cabin safety cannot be verified.',
    cameraStatus: 'BLOCKED',
    sensors: { temperatureC: 29.1, engine: 'OFF', doorsLocked: true },
    dataAgeMs: 4800,
  },
}

export const mockHistory: AgentState[] = [
  scenarios.CRITICAL,
  { ...scenarios.WARNING, timestamp: new Date(Date.now() - 18 * 60_000).toISOString() },
  { ...scenarios.NOTICE, timestamp: new Date(Date.now() - 52 * 60_000).toISOString() },
]

export const mockHealth: SystemHealth = {
  edgeConnected: true,
  internetAvailable: true,
  cameraStatus: 'OK',
  lastHeartbeat: now(),
}

export function cloneScenario(state: RiskState): AgentState {
  return structuredClone({ ...scenarios[state], timestamp: now() })
}
