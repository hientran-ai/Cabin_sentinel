import { useEffect, useRef } from 'react'
import { AlarmClock, ArrowRight, ShieldAlert, Thermometer } from 'lucide-react'
import type { AgentState } from '../../types/agent'
import { ActionProgress } from '../actions/ActionProgress'
import { ResolutionForm } from '../actions/ResolutionForm'

function elapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function CriticalModal({ state, actionPending, acknowledgementPending, onAction, onAcknowledge }: {
  state: AgentState
  actionPending: boolean
  acknowledgementPending: boolean
  onAction: () => Promise<void>
  onAcknowledge: Parameters<typeof ResolutionForm>[0]['onSubmit']
}) {
  const modal = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state.riskState !== 'CRITICAL') return
    const previous = document.activeElement as HTMLElement | null
    const node = modal.current
    node?.querySelector<HTMLElement>('button, input')?.focus()
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault()
      if (event.key !== 'Tab' || !node) return
      const focusable = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    const containFocus = (event: FocusEvent) => {
      if (node && event.target instanceof Node && !node.contains(event.target)) node.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus()
    }
    document.addEventListener('keydown', keepFocus)
    document.addEventListener('focusin', containFocus)
    return () => { document.removeEventListener('keydown', keepFocus); document.removeEventListener('focusin', containFocus); previous?.focus() }
  }, [state.riskState])

  if (state.riskState !== 'CRITICAL') return null
  const toolsRunning = state.toolResults.some((tool) => tool.status === 'RUNNING')
  const actionsDisabled = actionPending || toolsRunning
  return <div className="modal-backdrop">
    <div className="critical-modal" role="alertdialog" aria-modal="true" aria-labelledby="critical-title" aria-describedby="critical-description" ref={modal}>
      <div className="critical-header"><span className="critical-icon"><ShieldAlert /></span><div><span className="eyebrow">Immediate intervention required</span><h2 id="critical-title">Critical cabin risk</h2></div><span className="event-id">{state.eventId}</span></div>
      <p id="critical-description" className="critical-reason">{state.reason}</p>
      <div className="critical-metrics">
        <div><Thermometer /><span>Temperature<strong>{state.sensors.temperatureC.toFixed(1)}°C</strong></span></div>
        <div><AlarmClock /><span>Elapsed<strong>{elapsed(state.durationSeconds)}</strong></span></div>
        <div><ShieldAlert /><span>Rule ID<strong>{state.ruleId}</strong></span></div>
      </div>
      <div className="modal-evidence"><span>Evidence</span><strong>{state.objects.map((object) => `${object.class} (${Math.round(object.confidence * 100)}%)`).join(', ') || 'No classified object'}</strong><small>Privacy processing: edge blur active</small></div>
      <button className="button critical-action" type="button" onClick={() => void onAction()} disabled={actionsDisabled}>
        {actionsDisabled ? 'Emergency actions running…' : 'Sound horn + crack window'} <ArrowRight />
      </button>
      <ActionProgress tools={state.toolResults} />
      <ResolutionForm onSubmit={onAcknowledge} pending={acknowledgementPending} status={state.acknowledgementStatus} />
      <p className="modal-footnote">This alert stays open until the backend reports a different risk state.</p>
    </div>
  </div>
}
