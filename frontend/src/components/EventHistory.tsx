import { Clock3 } from 'lucide-react'
import type { AgentState } from '../types/agent'
import { RiskBadge } from './status/RiskBadge'

export function EventHistory({ events, error, unsupportedReason }: { events: AgentState[]; error?: string; unsupportedReason?: string }) {
  return <section className="panel history-panel" id="events">
    <div className="panel-heading"><div><span className="eyebrow">Audit trail</span><h2>Recent events</h2></div><span>Latest 50 audit records</span></div>
    {error && <p role="alert">History unavailable: {error}</p>}
    {!error && !events.length && <p className="empty-state">{unsupportedReason || 'No evaluated events in this demo session yet.'}</p>}
    <div className="event-list">{events.map((event) => <article className="event-row" key={`${event.eventId}-${event.timestamp}`}>
      <RiskBadge state={event.riskState} /><div><strong>{event.reason}</strong><span><Clock3 /> {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {event.ruleId}</span></div><span className="event-temp">{event.sensors.temperatureC?.toFixed(1) ?? 'UNKNOWN'}°C</span>
    </article>)}</div>
  </section>
}
