import type { ReactNode } from 'react'
import { AlarmClock, ArrowRight, ShieldAlert, Thermometer } from 'lucide-react'
import type { AgentState } from '../../types/agent'
import { ActionProgress } from '../actions/ActionProgress'
import { ResolutionForm } from '../actions/ResolutionForm'

function elapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function CriticalModal({ state, actionPending, acknowledgementPending, allowAction = true, allowAcknowledge = true, onAction, onAcknowledge, incidentControls }: {
  incidentControls?: ReactNode
  state: AgentState
  actionPending: boolean
  acknowledgementPending: boolean
  allowAction?: boolean
  allowAcknowledge?: boolean
  onAction: () => Promise<void>
  onAcknowledge: Parameters<typeof ResolutionForm>[0]['onSubmit']
}) {
  if (state.riskState !== 'CRITICAL') return null
  const toolsRunning = state.toolResults.some((tool) => tool.status === 'RUNNING')
  const actionsDisabled = actionPending || toolsRunning || !allowAction
  return <section className="critical-notice" role="alert" aria-labelledby="critical-title" aria-describedby="critical-description">
      <div className="critical-header"><span className="critical-icon"><ShieldAlert /></span><div><span className="eyebrow">Immediate intervention required</span><h2 id="critical-title">{state.decisionCurrent === false ? 'Last backend critical verdict · current unavailable' : 'Critical cabin risk'}</h2></div><span className="event-id">{state.eventId}</span></div>
      <p id="critical-description" className="critical-reason">{state.reason}</p>
      <details><summary>Chi tiết và thao tác</summary>
      <div className="critical-metrics">
        <div><Thermometer /><span>Temperature<strong>{state.sensors.temperatureC?.toFixed(1) ?? 'UNKNOWN'}°C</strong></span></div>
        <div><AlarmClock /><span>Elapsed<strong>{elapsed(state.durationSeconds)}</strong></span></div>
        <div><ShieldAlert /><span>Rule ID<strong>{state.ruleId}</strong></span></div>
      </div>
      <div className="modal-evidence"><span>Evidence</span><strong>{state.objects.map((object) => `${object.class} (${Math.round(object.confidence * 100)}%)`).join(', ') || 'No classified object'}</strong><small>Detection metadata from backend</small></div>
      <button className="button critical-action" type="button" onClick={() => void onAction()} disabled={actionsDisabled}>
        {!allowAction ? 'Actions managed by backend' : actionsDisabled ? 'Emergency actions running…' : 'Sound horn + crack window'} <ArrowRight />
      </button>
      <ActionProgress tools={state.toolResults} />
      {allowAcknowledge ? <ResolutionForm onSubmit={onAcknowledge} pending={acknowledgementPending} status={state.acknowledgementStatus} /> : incidentControls}
      <p className="modal-footnote">Cảnh báo được giữ trong trang cho đến khi backend trả mức risk khác.</p>
      </details>
  </section>
}
