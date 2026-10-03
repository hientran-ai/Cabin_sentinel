import { useState } from 'react'
import { useAgent } from '../../store/AgentContext'

export function DemoIncidentControls() {
  const { current, effectiveDataAgeMs, connection, analysisPending, incidentOperation, monitoringMode } = useAgent()
  const [pending, setPending] = useState(false)
  const [checkedRevision, setCheckedRevision] = useState<string>()
  const incident = current.incident
  if (monitoringMode === 'CAMERA' || !incident || incident.status !== 'OPEN') return null
  const binding = `${incident.incidentId}:${current.revision}`
  const canResolve = current.decisionCurrent === true && effectiveDataAgeMs <= 3000 &&
    connection === 'CONNECTED' && current.occupancyState === 'ABSENT' && current.evidenceConflicts.length === 0
  const run = async (operation: 'acknowledge' | 'resolve') => {
    if (pending || analysisPending || (operation === 'resolve' && (!canResolve || checkedRevision !== binding))) return
    setPending(true)
    try { await incidentOperation(operation, incident.incidentId, current.revision) }
    finally { setPending(false); setCheckedRevision(undefined) }
  }
  return <section className="resolution-form" aria-label="Demo incident verification">
    <h3>Demo incident · {incident.status}</h3>
    <p>Incident {incident.incidentId} · revision {current.revision}. These controls record notification reading and a separate cabin check. They do not unlock a vehicle.</p>
    <button className="button secondary" type="button" disabled={pending || analysisPending || Boolean(incident.acknowledgedAt)} onClick={() => void run('acknowledge')}>
      {incident.acknowledgedAt ? 'Notification read recorded' : 'Mark notification read'}
    </button>
    <label><input type="checkbox" checked={checkedRevision === binding} disabled={!canResolve || pending || analysisPending}
      onChange={event => setCheckedRevision(event.target.checked ? binding : undefined)} /> I have physically checked that the cabin is empty for this incident and revision.</label>
    <button className="button secondary" type="button" disabled={pending || analysisPending || !canResolve || checkedRevision !== binding} onClick={() => void run('resolve')}>Submit cabin check to backend</button>
    {!canResolve && <p>Fresh, consistent empty-cabin evidence is required. Upload a new image in this session; backend rechecks authorization, incident and revision.</p>}
  </section>
}
