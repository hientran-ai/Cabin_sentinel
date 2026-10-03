import { Armchair, BrainCircuit, Clock3, GitCompareArrows, Radar, ShieldAlert } from 'lucide-react'
import type { AgentState } from '../types/agent'

function words(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
}

function formatTime(value?: string): string {
  if (!value) return 'Not reported'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString()
}

function Insight({ label, value, detail, Icon }: {
  label: string
  value: string
  detail: string
  Icon: typeof BrainCircuit
}) {
  return <article className="insight-card">
    <Icon aria-hidden="true" />
    <div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>
  </article>
}

export function DecisionInsights({ state }: { state: AgentState }) {
  const transition = state.previousRiskState ? `${state.previousRiskState} → ${state.riskState}` : state.riskState
  const radar = state.radarPresence === true ? 'PRESENCE' : state.radarPresence === false ? 'CLEAR' : 'UNAVAILABLE'
  const latency = state.reasoningLatencyMs === undefined ? 'Not reported' : `${state.reasoningLatencyMs.toFixed(1)} ms`

  return <section className="panel decision-panel" id="decision-intelligence">
    <div className="panel-heading">
      <div><span className="eyebrow">Backend reasoning metadata</span><h2><BrainCircuit /> Decision intelligence</h2></div>
      <span className="revision-chip">Revision {state.revision}</span>
    </div>

    <div className="insight-grid">
      <Insight Icon={GitCompareArrows} label="Risk transition" value={transition} detail={state.decisionCurrent === true ? 'Latest committed decision' : 'Historical verdict; current decision unavailable'} />
      <Insight Icon={BrainCircuit} label="Occupancy" value={state.occupancyState} detail={words(state.occupancyReasonCode)} />
      <Insight Icon={Radar} label="Cabin radar" value={radar} detail={state.radarPresence === undefined ? 'Backend did not report radar evidence' : 'Independent presence evidence'} />
      <Insight Icon={Clock3} label="Rule latency" value={latency} detail="Backend reasoning time" />
    </div>

    {state.unlockRequest && <div className={`unlock-banner unlock-${state.unlockRequest.status}`} role="status">
      <ShieldAlert aria-hidden="true" />
      <div><strong>Unlock request · {state.unlockRequest.status.toUpperCase()}</strong><span>Request {state.unlockRequest.requestId}{state.unlockRequest.incidentId ? ` · incident ${state.unlockRequest.incidentId}` : ''}</span><span>Created {formatTime(state.unlockRequest.createdAt)} · expires {formatTime(state.unlockRequest.expiresAt)}</span></div>
    </div>}

    <div className="evidence-sections">
      <div className="evidence-group">
        <div className="subheading"><ShieldAlert /><div><strong>Evidence conflicts</strong><span>{state.evidenceConflicts.length ? `${state.evidenceConflicts.length} conflict${state.evidenceConflicts.length === 1 ? '' : 's'} retained` : 'No conflict reported'}</span></div></div>
        {state.evidenceConflicts.length ? <ul className="conflict-list">{state.evidenceConflicts.map((conflict, index) =>
          <li key={`${conflict.type}-${index}`}><strong>{words(conflict.type)}</strong><span>{conflict.detail}</span></li>)}</ul> : <p className="evidence-empty">No evidence conflicts reported by the backend.</p>}
      </div>

      <div className="evidence-group">
        <div className="subheading"><Armchair /><div><strong>Child-seat evidence</strong><span>{words(state.seatConfigurationState)}</span></div></div>
        {state.seatEvidence.length ? <div className="seat-list">{state.seatEvidence.map((seat) =>
          <article className="seat-evidence" key={seat.evidenceId}>
            <div><strong>{seat.position ?? 'Seat position unknown'}</strong><span>Child seat {seat.childSeatPresent === true ? 'detected' : seat.childSeatPresent === false ? 'not detected' : 'unconfirmed'} · {words(seat.orientation)} · {seat.quality}</span></div>
            <div><strong>{seat.orientationConfidence === undefined ? '—' : `${Math.round(seat.orientationConfidence * 100)}%`}</strong><span>{seat.source}{seat.modelVersion ? ` · ${seat.modelVersion}` : ''}</span></div>
            <small>Observed {formatTime(seat.observedAt)} · evidence {seat.evidenceId}</small>
          </article>)}</div> : <p className="evidence-empty">No structured child-seat evidence reported.</p>}
      </div>
    </div>
  </section>
}
