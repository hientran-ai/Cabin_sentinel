import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Incident, RiskLevel, Vehicle } from '@cabinsentinel/contracts'
import { formatRelativeTime, formatTemperature, severityPresentation } from '@cabinsentinel/domain'
import { Link, Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom'
import { client, fixtureMode, getIncident, getVehicles } from './data'

function Severity({ level }: { level: RiskLevel }) {
  const semantic = severityPresentation[level]
  return <span className={`severity severity-${level.toLowerCase()}`} aria-label={`Cabin status: ${semantic.label}`}><span aria-hidden="true">{semantic.icon === 'siren' ? '◆' : semantic.icon === 'check-circle' ? '✓' : '!'}</span> {semantic.label}</span>
}

function Freshness({ incident }: { incident: Incident }) {
  return <div className={incident.decision.decisionCurrent ? 'freshness' : 'freshness stale'} role={incident.decision.decisionCurrent ? undefined : 'alert'}>
    <strong>{incident.decision.decisionCurrent ? 'Current data' : 'Last known safety state'}</strong>
    <span>{formatRelativeTime(incident.decision.evaluatedAt)}</span>
    {!incident.decision.decisionCurrent && <span>Connection or evidence is degraded. Check the cabin directly; this state has not changed to safe.</span>}
  </div>
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const status = vehicle.status
  return <article className="card vehicle-card">
    <div><p className="eyebrow">{vehicle.registrationLabel ?? 'Vehicle'}</p><h2>{vehicle.displayName}</h2></div>
    {status ? <><Severity level={status.decision.riskLevel} /><p>{status.decision.reason}</p><p className="meta">{formatRelativeTime(status.decision.evaluatedAt)}</p><Link className="button" to={`/app/vehicles/${vehicle.id}`}>View vehicle</Link></> : <p>Status has not been reported.</p>}
  </article>
}

function VehiclesPage() {
  const query = useQuery({ queryKey: ['vehicles'], queryFn: getVehicles, refetchInterval: fixtureMode ? false : 30_000 })
  if (query.isLoading) return <State title="Loading vehicles" body="Requesting the latest authenticated status." />
  if (query.isError) return <State title="Status unavailable" body="We could not reach the service. No vehicle has been marked safe because of this error." action={() => void query.refetch()} />
  return <><PageHeader title="Your vehicles" subtitle="Latest backend-evaluated cabin status" /><div className="cards">{query.data?.items.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div></>
}

function VehiclePage() {
  const { vehicleId = '' } = useParams()
  const query = useQuery({ queryKey: ['vehicles'], queryFn: getVehicles })
  const vehicle = query.data?.items.find((item) => item.id === vehicleId)
  if (!vehicle?.status) return <State title="Vehicle unavailable" body="This vehicle is not available to the current account or has no reported state." />
  const { status } = vehicle
  return <><PageHeader title={vehicle.displayName} subtitle={vehicle.registrationLabel ?? 'Vehicle overview'} />
    <section className={`status-panel status-${status.decision.riskLevel.toLowerCase()}`} aria-live="polite">
      <p className="eyebrow">Cabin status</p><Severity level={status.decision.riskLevel} /><h2>{status.decision.reason}</h2>
      <p>{status.decision.recommendedAction}</p><Freshness incident={{ id: '', vehicleId, status: 'active', createdAt: status.decision.evaluatedAt, updatedAt: status.decision.evaluatedAt, decision: status.decision, revisions: [], actions: [] }} />
      {status.activeIncidentId && <Link className="button primary" to={`/app/incidents/${status.activeIncidentId}`}>View incident details</Link>}
    </section>
    <section className="metrics" aria-label="Vehicle signals">
      <Metric label="Temperature" value={formatTemperature(status.temperatureC)} /><Metric label="Occupancy evidence" value={status.occupancyLabel} /><Metric label="Edge device" value={status.device.edge} /><Metric label="Camera" value={status.device.camera} />
    </section>
    <section className="card"><h2>Why this status?</h2><dl className="details"><div><dt>Rule</dt><dd>{status.decision.ruleId}</dd></div><div><dt>Revision</dt><dd>{status.decision.revision}</dd></div><div><dt>Evaluated</dt><dd>{new Date(status.decision.evaluatedAt).toLocaleString()}</dd></div></dl></section>
  </>
}

function IncidentPage() {
  const { incidentId = '' } = useParams()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['incident', incidentId], queryFn: () => getIncident(incidentId) })
  const mutation = useMutation({ mutationFn: async (incident: Incident) => {
    if (fixtureMode) throw new Error('Preview mode cannot acknowledge a real incident.')
    return client.acknowledgeIncident(incident.id, incident.decision.revision, 'CABIN_CHECKED', crypto.randomUUID())
  }, onSuccess: (data) => queryClient.setQueryData(['incident', incidentId], data) })
  if (!query.data) return query.isError ? <State title="Incident unavailable" body="The last known warning must not be treated as safe. Retry when connected." /> : <State title="Loading incident" body="Refreshing the authoritative incident state." />
  const incident = query.data
  return <><PageHeader title="Incident details" subtitle={`Incident ${incident.id}`} />
    <section className={`status-panel status-${incident.decision.riskLevel.toLowerCase()}`}><Severity level={incident.decision.riskLevel} /><h2>{incident.decision.reason}</h2><p>{incident.decision.recommendedAction}</p><Freshness incident={incident} /></section>
    <section className="card"><h2>Privacy-safe evidence</h2>{incident.decision.evidence.map((item) => <div className="evidence" key={item.id}><strong>{item.label}</strong><span>{item.summary}</span><small>{new Date(item.observedAt).toLocaleString()} · {item.source}</small></div>)}</section>
    <section className="card"><h2>Actions already performed</h2>{incident.actions.map((action) => <div className="evidence" key={action.id}><strong>{action.type}</strong><span>{action.status}</span><small>{action.message}</small></div>)}</section>
    <section className="action-bar"><div><strong>Have you checked the cabin?</strong><p>This records an acknowledgement; it does not change the backend safety verdict.</p></div><button className="button primary" disabled={mutation.isPending || incident.status !== 'active'} onClick={() => mutation.mutate(incident)}>{mutation.isPending ? 'Recording…' : 'I checked the cabin'}</button>{mutation.error && <p role="alert">{mutation.error.message}</p>}</section>
  </>
}

function State({ title, body, action }: { title: string; body: string; action?: () => void }) { return <section className="card state"><h1>{title}</h1><p>{body}</p>{action && <button className="button" onClick={action}>Try again</button>}</section> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function PageHeader({ title, subtitle }: { title: string; subtitle: string }) { return <header className="page-header"><div><p className="eyebrow">CabinSentinel Owner</p><h1>{title}</h1><p>{subtitle}</p></div>{fixtureMode && <span className="preview">INTEGRATION PREVIEW · SIMULATED DATA</span>}</header> }
function Placeholder({ title }: { title: string }) { return <><PageHeader title={title} subtitle="This view requires the product API." /><State title="Integration pending" body="No production data is fabricated. The required authenticated backend endpoint is documented in the platform assessment." /></> }

export function App() {
  return <div className="shell"><aside><Link className="brand" to="/app/vehicles">CabinSentinel</Link><nav aria-label="Owner navigation"><NavLink to="/app/vehicles">Vehicles</NavLink><NavLink to="/app/history">History</NavLink><NavLink to="/app/notifications">Notifications</NavLink><NavLink to="/app/profile">Profile</NavLink></nav><p className="aside-note">Safety decisions are evaluated by the backend and Edge system.</p></aside><main>
    <Routes><Route path="/login" element={<Placeholder title="Sign in" />} /><Route path="/app" element={<Navigate to="/app/vehicles" replace />} /><Route path="/app/vehicles" element={<VehiclesPage />} /><Route path="/app/vehicles/:vehicleId" element={<VehiclePage />} /><Route path="/app/vehicles/:vehicleId/incidents" element={<Placeholder title="Vehicle incidents" />} /><Route path="/app/incidents/:incidentId" element={<IncidentPage />} /><Route path="/app/history" element={<Placeholder title="History" />} /><Route path="/app/notifications" element={<Placeholder title="Notifications" />} /><Route path="/app/profile" element={<Placeholder title="Profile" />} /><Route path="*" element={<Navigate to="/app/vehicles" replace />} /></Routes>
  </main></div>
}
