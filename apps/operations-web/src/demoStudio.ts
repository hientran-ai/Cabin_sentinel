import type { JsonRecord } from '@cabinsentinel/api-client'
import type { V1DemoScenarioId, V1DemoStatus, V1DemoVehicle } from '@cabinsentinel/contracts'

export const STUDIO_POLL_MS = 2_000

/** react-query `refetchInterval` that stops while the tab is hidden and resumes (via refetchOnWindowFocus) when it is back. */
export function pollWhenVisible(intervalMs: number, isHidden: () => boolean = () => typeof document !== 'undefined' && document.visibilityState === 'hidden') {
  return () => (isHidden() ? false : intervalMs)
}

export type ChecklistStepId = 'critical' | 'incident-alert' | 'assign-command' | 'resolve' | 'virtual-device' | 'owner-view'
export type ChecklistState = 'done' | 'current' | 'todo' | 'manual'
export interface ChecklistStep { id: ChecklistStepId; state: ChecklistState; progress?: string }

export interface ChecklistInput {
  status: V1DemoStatus | undefined
  incidents: JsonRecord[]
  commands: JsonRecord[]
  devices: JsonRecord[]
}

const upper = (value: unknown) => typeof value === 'string' ? value.toUpperCase() : ''
const isDemoIncident = (item: JsonRecord) => typeof item.vehicle_id === 'string'

/** Which of the six guided steps the backend data says are already done. Step 6 is a manual look at the owner site. */
export function computeChecklist({ status, incidents, commands, devices }: ChecklistInput): ChecklistStep[] {
  const vehicles = status?.vehicles ?? []
  const open = incidents.filter(item => isDemoIncident(item) && upper(item.status) === 'OPEN')
  const resolved = incidents.filter(item => isDemoIncident(item) && upper(item.status) === 'RESOLVED')
  const delivered = (status?.notifications.recent ?? []).filter(item => item.ok)
  const assigned = incidents.filter(item => {
    const ops = item.ops as JsonRecord | undefined
    return typeof ops?.assignee === 'string' && ops.assignee !== ''
  })
  const hornCommands = commands.filter(item => upper(item.type) === 'HORN')
  const virtualOnline = devices.some(item => item.online === true && String(item.firmware ?? '').startsWith('virtual-web') && upper(item.status) !== 'REVOKED')

  const criticalDone = vehicles.some(v => v.scenario === 'CRITICAL' || v.scenario === 'RAMP' || upper(v.risk_level) === 'CRITICAL')
    || incidents.some(item => upper(item.risk_level) === 'CRITICAL')
  const done: Array<[ChecklistStepId, boolean, string?]> = [
    ['critical', criticalDone],
    ['incident-alert', open.length + resolved.length > 0 && delivered.length > 0, `${open.length + resolved.length} / ${delivered.length}`],
    ['assign-command', assigned.length > 0 && hornCommands.length > 0, `${assigned.length} / ${hornCommands.length}`],
    ['resolve', resolved.length > 0, String(resolved.length)],
    ['virtual-device', virtualOnline],
  ]
  let currentTaken = false
  const steps: ChecklistStep[] = done.map(([id, isDone, progress]) => {
    if (isDone) return { id, state: 'done' as const, progress }
    const state = currentTaken ? 'todo' as const : 'current' as const
    currentTaken = true
    return { id, state, progress }
  })
  steps.push({ id: 'owner-view', state: 'manual' })
  return steps
}

/** What the rules engine is expected to say for a scenario. The backend decides; this only labels whether the card caught up. */
export function expectedRisk(scenario: V1DemoScenarioId): string[] {
  switch (scenario) {
    case 'SAFE': return ['SAFE']
    case 'WARNING': return ['WARNING']
    case 'CRITICAL': return ['CRITICAL']
    case 'RAMP': return ['WARNING', 'CRITICAL']
    case 'OFFLINE': return ['UNKNOWN', 'ERROR']
    case 'VIDEO': return ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR', 'UNKNOWN'] // the video decides
  }
}

export type ScenarioSync = 'synced' | 'settling'

export function scenarioSync(vehicle: Pick<V1DemoVehicle, 'scenario' | 'risk_level' | 'online'>): ScenarioSync {
  if (vehicle.scenario === 'OFFLINE') return vehicle.online ? 'settling' : 'synced'
  if (!vehicle.online) return 'settling'
  return expectedRisk(vehicle.scenario).includes(upper(vehicle.risk_level)) ? 'synced' : 'settling'
}

export function riskTone(risk: string | undefined | null): 'ok' | 'warn' | 'danger' | 'neutral' {
  switch (upper(risk)) {
    case 'SAFE': return 'ok'
    case 'NOTICE': case 'WARNING': return 'warn'
    case 'CRITICAL': return 'danger'
    default: return 'neutral'
  }
}

export function formatTemperature(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} °C` : '—'
}

/** "3 giây trước" / "3 s ago" for a backend timestamp; empty when there is none. */
export function agoLabel(iso: string | undefined | null, nowMs: number, vi: boolean): string {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at)) return ''
  const seconds = Math.max(0, Math.round((nowMs - at) / 1000))
  if (seconds < 5) return vi ? 'vừa xong' : 'just now'
  if (seconds < 60) return vi ? `${seconds} giây trước` : `${seconds} s ago`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? (vi ? `${minutes} phút trước` : `${minutes} min ago`) : (vi ? `${Math.floor(minutes / 60)} giờ trước` : `${Math.floor(minutes / 60)} h ago`)
}

/** Deep link into the owner site, derived from the configured owner entry URL. Falls back to a path on this origin. */
export function ownerLink(ownerUrl: string, path: string): string {
  try { return new URL(path, ownerUrl).toString() } catch { return path }
}
