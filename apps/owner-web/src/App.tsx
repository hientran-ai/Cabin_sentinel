import { useQuery } from '@tanstack/react-query'
import type { RiskLevel, V1CabinState } from '@cabinsentinel/contracts'
import { formatRelativeTime, formatTemperature, severityPresentation } from '@cabinsentinel/domain'
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { getEvents, getHealth, getState, vehicleId } from './data'

const risks: RiskLevel[] = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
function riskOf(state: V1CabinState): RiskLevel { const value = state.risk_level?.toUpperCase() as RiskLevel; return risks.includes(value) ? value : 'ERROR' }
function evaluatedAt(state: V1CabinState) { return state.evaluated_at || state.freshness?.as_of || '' }
function Severity({ state }: { state: V1CabinState }) { const level = riskOf(state); const item = severityPresentation[level]; return <span className={`severity severity-${level.toLowerCase()}`}><span aria-hidden="true">{level === 'SAFE' ? '✓' : level === 'CRITICAL' ? '◆' : '!'}</span>{item.label}</span> }
function StateView({ title, body, retry }: { title: string; body: string; retry?: () => void }) { return <section className="card state"><div className="state-mark" aria-hidden="true">♡</div><h1>{title}</h1><p>{body}</p>{retry && <button className="button" onClick={retry}>Try again</button>}</section> }
function Header({ title, subtitle }: { title: string; subtitle: string }) { return <header className="page-header"><div><p className="eyebrow">CabinSentinel Owner</p><h1>{title}</h1><p>{subtitle}</p></div><span className="live-chip"><i /> LIVE API</span></header> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function useLiveState() { return useQuery({ queryKey: ['v1-state', vehicleId], queryFn: getState, refetchInterval: 5_000 }) }

function Overview() {
  const state = useLiveState(); const health = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: 15_000 })
  if (state.isLoading) return <StateView title="Connecting to your vehicle" body="Requesting the latest backend-evaluated cabin state." />
  if (state.isError || !state.data) return <StateView title="Vehicle status unavailable" body="The service could not provide a verified state. The cabin has not been marked safe." retry={() => void state.refetch()} />
  const item = state.data; const level = riskOf(item); const current = item.decision_current === true
  return <><Header title={`Vehicle ${item.vehicle_id || vehicleId}`} subtitle="Latest backend-evaluated cabin status" />
    <section className={`status-panel status-${level.toLowerCase()}`} aria-live="polite"><p className="eyebrow">Cabin status</p><Severity state={item} /><h2>{item.reason || 'Backend did not provide a reason.'}</h2><p>{current ? 'This decision is current.' : 'This is the last known state. Check the cabin directly.'}</p><div className={current ? 'freshness' : 'freshness stale'} role={current ? undefined : 'alert'}><strong>{current ? 'Current data' : 'Stale or incomplete data'}</strong><span>{evaluatedAt(item) ? formatRelativeTime(evaluatedAt(item)) : 'Time unavailable'}</span></div></section>
    <section className="metrics"><Metric label="Temperature" value={formatTemperature(item.temperature ?? undefined)} /><Metric label="Occupancy" value={item.occupancy_state || 'UNKNOWN'} /><Metric label="Camera" value={item.camera_status || 'UNKNOWN'} /><Metric label="Backend" value={health.data?.status || health.data?.backend || (health.isError ? 'UNAVAILABLE' : 'CHECKING')} /></section>
    <section className="card"><div className="section-title"><div><p className="eyebrow">Decision details</p><h2>Why this status?</h2></div><Link to="/app/history">View history</Link></div><dl className="details"><div><dt>Rule</dt><dd>{item.rule_id || 'UNMAPPED'}</dd></div><div><dt>Revision</dt><dd>{item.revision ?? '—'}</dd></div><div><dt>Evaluated</dt><dd>{evaluatedAt(item) ? new Date(evaluatedAt(item)).toLocaleString() : 'Unavailable'}</dd></div></dl></section>
    <section className="card unavailable"><h2>Emergency actions</h2><p>Remote commands and acknowledgements remain unavailable until the backend adds authorization, idempotency, device confirmation and audit APIs.</p><button className="button primary" disabled>Request emergency action</button></section>
  </>
}
function History() {
  const query = useQuery({ queryKey: ['v1-events', vehicleId], queryFn: getEvents, refetchInterval: 15_000 })
  if (query.isLoading) return <StateView title="Loading history" body="Fetching backend evaluation events." />
  if (query.isError) return <StateView title="History unavailable" body="The event feed could not be loaded." retry={() => void query.refetch()} />
  return <><Header title="Safety history" subtitle={`Backend evaluations for ${vehicleId}`} /><section className="card"><div className="history-list">{query.data?.length ? query.data.map((item, index) => <article className="history-row" key={`${item.revision ?? index}-${evaluatedAt(item)}`}><Severity state={item} /><div><strong>{item.reason || 'No reason supplied'}</strong><span>{item.rule_id || 'UNMAPPED'} · revision {item.revision ?? '—'}</span></div><time>{evaluatedAt(item) ? new Date(evaluatedAt(item)).toLocaleString() : 'Unknown time'}</time></article>) : <p className="empty">No backend events have been recorded for this vehicle.</p>}</div></section></>
}
function ComingSoon({ title, detail }: { title: string; detail: string }) { return <><Header title={title} subtitle="Designed and ready for backend integration" /><StateView title="Backend capability required" body={detail} /></> }
export function App() { return <div className="shell"><aside><Link className="brand" to="/app/vehicles"><span>♡</span> CabinSentinel</Link><nav aria-label="Owner navigation"><NavLink to="/app/vehicles">Vehicle</NavLink><NavLink to="/app/history">History</NavLink><NavLink to="/app/notifications">Notifications</NavLink><NavLink to="/app/profile">Profile</NavLink></nav><p className="aside-note">Safety decisions always come from the backend.</p></aside><main><Routes><Route path="/app" element={<Navigate to="/app/vehicles" replace />} /><Route path="/app/vehicles" element={<Overview />} /><Route path="/app/history" element={<History />} /><Route path="/app/notifications" element={<ComingSoon title="Notifications" detail="Requires authenticated notification preferences and push registration endpoints." />} /><Route path="/app/profile" element={<ComingSoon title="Profile" detail="Requires OIDC/session bootstrap and an authenticated profile endpoint." />} /><Route path="/login" element={<ComingSoon title="Sign in" detail="Requires the production OIDC/session flow." />} /><Route path="*" element={<Navigate to="/app/vehicles" replace />} /></Routes></main></div> }
