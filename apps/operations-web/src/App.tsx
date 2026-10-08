import { useMemo, useState, type ReactNode, type SVGProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { canAccessPortal, useAuth } from '@cabinsentinel/auth'
import type { RiskLevel, V1CabinState } from '@cabinsentinel/contracts'
import { formatRelativeTime } from '@cabinsentinel/domain'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { client, vehicleId } from './data'
import { AdminOverview, EvaluationsWorkbench, PlatformPage } from './PlatformPages'
import { useLocale } from './i18n'
import { adminDemoEnabled, stopAdminDemo } from './adminDemo'

type IconName = 'grid' | 'pulse' | 'car' | 'cpu' | 'users' | 'layers' | 'rules' | 'audit' | 'system' | 'search' | 'bell' | 'menu' | 'close' | 'arrow' | 'refresh' | 'shield' | 'camera' | 'radar' | 'clock' | 'lock' | 'check' | 'warning' | 'chevron'
const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  pulse: <><path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M4 5a10 10 0 0 1 16 0M4 19a10 10 0 0 0 16 0"/></>,
  car: <><path d="m5 16-1 3m15-3 1 3M3 13l2-6h14l2 6v5H3z"/><path d="M7 15h.01M17 15h.01"/></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  rules: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/></>,
  audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l-2.83 2.83A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.4 1.5V21H9v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-2.83-2.83A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1.5-1H2v-4h.1A1.7 1.7 0 0 0 3.6 9a1.7 1.7 0 0 0-.34-1.88l2.83-2.83A1.7 1.7 0 0 0 8 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l2.83 2.83A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, arrow: <path d="m9 18 6-6-6-6"/>, refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  shield: <><path d="M12 3 4.5 6v5c0 5 3 8.5 7.5 10 4.5-1.5 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-4"/></>, camera: <><path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="4"/></>, radar: <><circle cx="12" cy="12" r="2"/><path d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, check: <path d="m5 12 4 4L19 6"/>, warning: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>, chevron: <path d="m9 18 6-6-6-6"/>,
}
function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg> }

const risks: RiskLevel[] = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
const riskOf = (item: V1CabinState): RiskLevel => { const risk = item.risk_level?.toUpperCase() as RiskLevel; return risks.includes(risk) ? risk : 'ERROR' }
const timeOf = (item: V1CabinState) => item.evaluated_at || item.freshness?.as_of || ''
const nav = [
  { to: '/admin', label: 'Overview', icon: 'grid' as IconName }, { to: '/admin/evaluations', label: 'Evaluations', icon: 'pulse' as IconName },
  { to: '/admin/incidents', label: 'Incidents', icon: 'warning' as IconName }, { to: '/admin/commands', label: 'Commands', icon: 'lock' as IconName },
  { to: '/admin/vehicles', label: 'Vehicles', icon: 'car' as IconName }, { to: '/admin/devices', label: 'Devices', icon: 'cpu' as IconName },
  { to: '/admin/users', label: 'Users & access', icon: 'users' as IconName }, { to: '/admin/models', label: 'Models', icon: 'layers' as IconName },
  { to: '/admin/rules', label: 'Safety rules', icon: 'rules' as IconName }, { to: '/admin/audit', label: 'Audit log', icon: 'audit' as IconName },
  { to: '/admin/system', label: 'System health', icon: 'system' as IconName },
]

type AdminNavItem = { to: string; labelKey: string; icon: IconName; adminOnly?: boolean }
const adminNavGroups: Array<{ labelKey: string; items: AdminNavItem[] }> = [
  { labelKey: 'safetyOperations', items: [
    { to: '/admin', labelKey: 'overview', icon: 'grid' },
    { to: '/admin/incidents', labelKey: 'incidents', icon: 'warning' },
    { to: '/admin/evaluations', labelKey: 'evaluations', icon: 'pulse' },
    { to: '/admin/commands', labelKey: 'commands', icon: 'lock' },
  ] },
  { labelKey: 'fleetManagement', items: [
    { to: '/admin/vehicles', labelKey: 'vehicles', icon: 'car' },
    { to: '/admin/devices', labelKey: 'devices', icon: 'cpu' },
  ] },
  { labelKey: 'platformAdministration', items: [
    { to: '/admin/tenants', labelKey: 'tenants', icon: 'layers', adminOnly: true },
    { to: '/admin/users', labelKey: 'users', icon: 'users', adminOnly: true },
    { to: '/admin/models', labelKey: 'models', icon: 'layers', adminOnly: true },
    { to: '/admin/rules', labelKey: 'rules', icon: 'rules', adminOnly: true },
  ] },
  { labelKey: 'assurance', items: [
    { to: '/admin/audit', labelKey: 'audit', icon: 'audit' },
    { to: '/admin/system', labelKey: 'system', icon: 'system' },
  ] },
]

function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.roles.includes('ADMIN') ? <>{children}</> : <Navigate to="/admin/incidents" replace/>
}

function OperationsUserMenu() {
  const { user, logout, portalUrl } = useAuth()
  const { locale } = useLocale()
  if (!user) return null
  return <div className="portal-menu operations-user-menu">
    <span aria-hidden="true">{user.displayName.slice(0, 2).toUpperCase()}</span>
    <div><strong>{user.displayName}</strong><small>{user.roles.join(' · ')}</small></div>
    {canAccessPortal(user, 'owner') && <a href={portalUrl('owner')}>{locale === 'vi' ? 'Người dùng' : 'User'}</a>}
    {canAccessPortal(user, 'operations') && <a href={portalUrl('operations')}>{locale === 'vi' ? 'Quản trị' : 'Admin'}</a>}
    <button onClick={() => void logout()}>{locale === 'vi' ? 'Đăng xuất' : 'Sign out'}</button>
  </div>
}

function Severity({ item }: { item: V1CabinState }) { const level = riskOf(item); return <span className={`severity severity-${level.toLowerCase()}`}><i />{level === 'ERROR' ? 'Unverified' : level}</span> }
function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) { return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</div> }
function Metric({ label, value, detail, icon, tone = '' }: { label: string; value: string; detail: string; icon: IconName; tone?: string }) { return <article className={`metric-card ${tone}`}><span className="metric-icon"><Icon name={icon}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article> }
function ServiceState({ ok, children }: { ok?: boolean; children: ReactNode }) { return <span className={`service-state ${ok === true ? 'is-ok' : ok === false ? 'is-down' : ''}`}><i />{children}</span> }
function Empty({ icon = 'pulse', title, body, action }: { icon?: IconName; title: string; body: string; action?: ReactNode }) { return <div className="empty-state"><span><Icon name={icon}/></span><h2>{title}</h2><p>{body}</p>{action}</div> }

function useEvents() { return useQuery({ queryKey: ['v1-events', vehicleId], queryFn: () => client.v1Events(vehicleId, 50), refetchInterval: 10_000 }) }
function EvaluationTable({ items, loading = false, error = false, compact = false }: { items: V1CabinState[]; loading?: boolean; error?: boolean; compact?: boolean }) {
  if (loading) return <div className="table-state"><span className="spinner"/>Loading verified evaluations…</div>
  if (error) return <Empty icon="warning" title="Evaluation stream unavailable" body="The V1 backend did not return a verified event window. No safety state is inferred." />
  if (!items.length) return <Empty title="No evaluations recorded" body="New backend evaluations will appear here as they are received." />
  const shown = compact ? items.slice(0, 6) : items
  return <div className="table-wrap"><table><thead><tr><th>Risk</th><th>Decision</th><th>Vehicle</th><th>Rule / revision</th><th>Observed</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{shown.map((item, index) => <tr key={`${item.revision ?? index}-${timeOf(item)}`}><td><Severity item={item}/></td><td><strong>{item.reason || 'No reason supplied'}</strong><small>{item.incident_id || 'No linked incident resource'}</small></td><td><span className="vehicle-cell"><Icon name="car"/>{item.vehicle_id || vehicleId}</span></td><td><code>{item.rule_id || 'UNMAPPED'}</code><small>Revision {item.revision ?? '—'}</small></td><td className={item.decision_current === false ? 'stale' : ''}><strong>{item.decision_current === false ? 'Last known' : timeOf(item) ? formatRelativeTime(timeOf(item)) : 'Unknown'}</strong><small>{item.decision_current === false ? 'Stale decision' : 'Backend timestamp'}</small></td><td><Link className="row-link" to={`/admin/evaluations/${item.revision ?? index}`} aria-label="Inspect evaluation"><Icon name="chevron"/></Link></td></tr>)}</tbody></table></div>
}

function Dashboard() {
  const events = useEvents()
  const state = useQuery({ queryKey: ['v1-state', vehicleId], queryFn: () => client.v1State(vehicleId), refetchInterval: 5_000 })
  const health = useQuery({ queryKey: ['health'], queryFn: () => client.health(), refetchInterval: 15_000 })
  const items = events.data || []; const verified = !events.isError && !state.isError; const refreshed = state.data ? timeOf(state.data) : ''
  const retry = () => { void events.refetch(); void state.refetch(); void health.refetch() }
  return <><PageHeader eyebrow="Operations control room" title="Good morning, Operator" subtitle={`Live oversight for the configured V1 scope · ${vehicleId}`} action={<button className="secondary-button" onClick={retry}><Icon name="refresh"/>Refresh data</button>}/>
    {!verified && <section className="degraded-banner" role="alert"><span><Icon name="warning"/></span><div><strong>Live operations data is unavailable</strong><p>The dashboard remains in fail-safe mode. Unknown values are not interpreted as safe.</p></div><button onClick={retry}>Retry connection</button></section>}
    <section className="metric-grid" aria-label="Operational metrics"><Metric label="Critical evaluations" value={events.isError ? '—' : String(items.filter(i => riskOf(i) === 'CRITICAL').length)} detail="In the current event window" icon="warning" tone="danger"/><Metric label="Warnings" value={events.isError ? '—' : String(items.filter(i => riskOf(i) === 'WARNING').length)} detail="Require operator attention" icon="pulse" tone="warning"/><Metric label="Current revision" value={state.data?.revision == null ? '—' : String(state.data.revision)} detail={state.data?.decision_current ? 'Decision is current' : 'Not verified as current'} icon="rules"/><Metric label="Backend service" value={health.data?.status?.toUpperCase() || health.data?.backend?.toUpperCase() || 'UNAVAILABLE'} detail={health.isSuccess ? 'Health endpoint responding' : 'Awaiting verified heartbeat'} icon="system" tone={health.isSuccess ? 'success' : 'muted'}/></section>
    <section className="dashboard-grid"><article className="surface stream-card"><div className="section-heading"><div><span className="section-kicker">Live queue</span><h2>Evaluation stream</h2><p>Latest safety decisions returned by the V1 backend.</p></div><Link to="/admin/evaluations">View all <Icon name="arrow"/></Link></div><EvaluationTable items={items} loading={events.isLoading} error={events.isError} compact/></article><aside className="right-rail"><article className="surface health-card"><div className="section-heading"><div><span className="section-kicker">Current vehicle</span><h2>Signal health</h2></div><ServiceState ok={state.isSuccess}>{state.isSuccess ? 'Connected' : 'Unavailable'}</ServiceState></div><div className="signal-list"><div><span><Icon name="camera"/></span><p>Camera<strong>{state.data?.camera_status || 'UNKNOWN'}</strong></p><i className={state.data?.camera_status === 'OK' ? 'ok' : ''}/></div><div><span><Icon name="radar"/></span><p>Occupancy<strong>{state.data?.occupancy_state || 'UNKNOWN'}</strong></p><i className={state.data?.occupancy_state ? 'ok' : ''}/></div><div><span><Icon name="clock"/></span><p>Decision freshness<strong>{state.data?.decision_current === true ? 'CURRENT' : 'STALE / UNKNOWN'}</strong></p><i className={state.data?.decision_current ? 'ok' : ''}/></div></div><div className="last-sync"><span>Last verified update</span><strong>{refreshed ? formatRelativeTime(refreshed) : 'Not available'}</strong></div></article><article className="surface scope-card"><div className="scope-orbit"><span><Icon name="shield"/></span></div><span className="section-kicker">Deployment scope</span><h2>Protected V1 fleet mode</h2><p>Backend authentication, role-based fleet access, state and evaluations are connected for <strong>{vehicleId}</strong>. Remote commands remain locked until production authorization APIs are available.</p><div className="scope-progress"><span><i/></span><small>4 of 9 operation modules connected</small></div></article></aside></section></>
}

function Evaluations() {
  const query = useEvents(); const [search, setSearch] = useState(''); const [filter, setFilter] = useState<'ALL' | RiskLevel>('ALL')
  const items = useMemo(() => (query.data || []).filter(item => (filter === 'ALL' || riskOf(item) === filter) && (!search || `${item.reason} ${item.rule_id} ${item.vehicle_id}`.toLowerCase().includes(search.toLowerCase()))), [query.data, filter, search])
  return <><PageHeader eyebrow="Safety intelligence" title="Evaluation stream" subtitle={`Verified backend decisions for ${vehicleId}`} action={<button className="secondary-button" onClick={() => void query.refetch()}><Icon name="refresh"/>Refresh</button>}/><section className="surface evaluation-card"><div className="toolbar"><div className="filter-tabs">{(['ALL','CRITICAL','WARNING','SAFE'] as const).map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'ALL' ? 'All events' : value}</button>)}</div><label className="search-box"><Icon name="search"/><span className="sr-only">Search evaluations</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search rule, vehicle, reason…"/></label></div><EvaluationTable items={items} loading={query.isLoading} error={query.isError}/></section></>
}

function EvaluationDetail() {
  const { revision } = useParams(); const query = useEvents(); const item = query.data?.find((entry, index) => String(entry.revision ?? index) === revision)
  if (query.isLoading) return <Empty title="Loading evaluation" body="Refreshing the verified backend event window."/>
  if (!item) return <><PageHeader eyebrow="Safety intelligence" title="Evaluation unavailable" subtitle="The requested revision is outside the current backend event window."/><section className="surface"><Empty icon="warning" title="No verified record found" body="Return to the evaluation stream and select an available revision." action={<Link className="primary-button" to="/admin/evaluations">Back to evaluations</Link>}/></section></>
  return <><Link className="back-link" to="/admin/evaluations">← Back to evaluations</Link><PageHeader eyebrow="Decision investigation" title={item.reason || 'Evaluation detail'} subtitle={`${item.vehicle_id || vehicleId} · revision ${item.revision ?? '—'}`}/><section className={`decision-hero decision-${riskOf(item).toLowerCase()}`}><div><Severity item={item}/><h2>{item.reason || 'No reason supplied'}</h2><p>{item.decision_current === false ? 'This is a last-known state and has not changed to safe.' : 'This decision is current according to the backend response.'}</p></div><span><Icon name={riskOf(item) === 'SAFE' ? 'check' : 'warning'}/></span></section><section className="detail-grid"><article className="surface"><div className="section-heading"><div><span className="section-kicker">Evidence record</span><h2>Decision metadata</h2></div></div><dl className="detail-list"><Row label="Rule ID" value={item.rule_id || 'UNMAPPED'}/><Row label="Occupancy" value={item.occupancy_state || 'UNKNOWN'}/><Row label="Camera" value={item.camera_status || 'UNKNOWN'}/><Row label="Temperature" value={item.temperature == null ? 'Unavailable' : `${item.temperature}°C`}/><Row label="Evaluated at" value={timeOf(item) ? new Date(timeOf(item)).toLocaleString() : 'Unavailable'}/><Row label="Incident" value={item.incident_id || 'No linked resource'}/></dl></article><article className="surface locked-card"><span><Icon name="lock"/></span><h2>Command controls locked</h2><p>Remote commands require server-side authorization, acknowledgement, expiry and an immutable audit trail.</p><button disabled>Request remote command</button></article></section></>
}
function Row({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div> }

function Shell() {
  const [open, setOpen] = useState(false); const location = useLocation(); const current = nav.find(item => location.pathname === item.to || (item.to !== '/admin' && location.pathname.startsWith(item.to)))?.label || 'Overview'
  return <div className="app-shell"><aside className={`sidebar ${open ? 'is-open' : ''}`}><div className="brand"><span><Icon name="shield"/></span><div><strong>CabinSentinel</strong><small>Operations</small></div><b>OPS</b></div><div className="workspace"><small>Workspace</small><strong>Safety operations</strong><span>Backend-connected console</span></div><nav aria-label="Operations navigation">{nav.map(item => <NavLink end={item.to === '/admin'} key={item.to} to={item.to} onClick={() => setOpen(false)}><Icon name={item.icon}/><span>{item.label}</span>{item.label === 'Incidents' && <i/>}</NavLink>)}</nav><div className="sidebar-foot"><span>CS</span><p><strong>Authorized operator</strong><small>Backend-verified session</small></p><button aria-label="Open operator menu">•••</button></div></aside>{open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}<section className="stage"><header className="topbar"><button className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'}><Icon name={open ? 'close' : 'menu'}/></button><div className="breadcrumb"><span>Operations</span><Icon name="chevron"/><strong>{current}</strong></div><div className="top-actions"><ServiceState>Live V1</ServiceState><OperationsUserMenu /></div></header><main><Routes><Route path="/admin" element={<Dashboard/>}/><Route path="/admin/evaluations" element={<Evaluations/>}/><Route path="/admin/evaluations/:revision" element={<EvaluationDetail/>}/>{(['incidents','commands','vehicles','devices','users','models','rules','audit','system'] as const).map(name => <Route key={name} path={`/admin/${name}`} element={<PlatformPage name={name}/>}/>) }<Route path="*" element={<Navigate to="/admin" replace/>}/></Routes></main><footer><span>CabinSentinel Operations · Backend-authoritative</span><span><i/> Control plane UI v1</span></footer></section></div>
}
function AdminShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const { locale, setLocale, t } = useLocale()
  const demoMode = adminDemoEnabled()
  const isAdmin = user?.roles.includes('ADMIN') === true
  const visibleGroups = adminNavGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.adminOnly || isAdmin),
  })).filter(group => group.items.length > 0)
  const visibleItems = visibleGroups.flatMap(group => group.items)
  const currentItem = visibleItems.find(item => location.pathname === item.to || (item.to !== '/admin' && location.pathname.startsWith(item.to)))
  const current = t(currentItem?.labelKey || 'overview')

  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand"><span><Icon name="shield"/></span><div><strong>CabinSentinel</strong><small>Operations</small></div><b>{isAdmin ? 'ADM' : 'OPS'}</b></div>
      <div className="workspace"><small>{locale === 'vi' ? 'Không gian làm việc' : 'Workspace'}</small><strong>{isAdmin ? t('platformControl') : t('safetyOperations')}</strong><span>{isAdmin ? t('administratorScope') : t('operatorScope')}</span></div>
      <nav aria-label="Operations navigation">
        {visibleGroups.map(group => <section className="nav-group" key={group.labelKey}>
          <small>{t(group.labelKey)}</small>
          {group.items.map(item => <NavLink end={item.to === '/admin'} key={item.to} to={item.to} onClick={() => setOpen(false)}><Icon name={item.icon}/><span>{t(item.labelKey)}</span>{item.labelKey === 'incidents' && <i/>}</NavLink>)}
        </section>)}
      </nav>
      <div className="sidebar-foot"><span>{user?.displayName.slice(0, 2).toUpperCase() || 'CS'}</span><p><strong>{user?.displayName || (locale === 'vi' ? 'Điều phối viên' : 'Authorized operator')}</strong><small>{isAdmin ? (locale === 'vi' ? 'Quản trị viên nền tảng' : 'Platform administrator') : (locale === 'vi' ? 'Điều phối viên an toàn' : 'Safety operator')}</small></p></div>
    </aside>
    {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <section className="stage">
      <header className="topbar"><button className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'}><Icon name={open ? 'close' : 'menu'}/></button><div className="breadcrumb"><span>{isAdmin ? t('admin') : t('operations')}</span><Icon name="chevron"/><strong>{current}</strong></div><div className="top-actions"><ServiceState>{t('live')}</ServiceState><button className="locale-switch" onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')} aria-label={locale === 'vi' ? 'Chuyển sang tiếng Anh' : 'Switch to Vietnamese'}><strong>{locale.toUpperCase()}</strong><span>/ {locale === 'vi' ? 'EN' : 'VI'}</span></button><OperationsUserMenu /></div></header>
      <main>{demoMode && <section className="demo-mode-banner" role="status"><div><strong>{locale === 'vi' ? 'DỮ LIỆU MÔ PHỎNG' : 'SIMULATED DATA'}</strong><span>{locale === 'vi' ? 'Mọi số liệu và thao tác bên dưới chỉ dùng để minh họa, không gửi đến backend thật.' : 'All data and actions below are simulated and are never sent to the live backend.'}</span></div><button onClick={stopAdminDemo}>{locale === 'vi' ? 'Thoát demo' : 'Exit demo'}</button></section>}<Routes>
        <Route path="/admin" element={<AdminOverview/>}/>
        <Route path="/admin/evaluations" element={<EvaluationsWorkbench/>}/>
        <Route path="/admin/evaluations/:revision" element={<Navigate to="/admin/evaluations" replace/>}/>
        {(['incidents','commands','vehicles','devices','audit','system'] as const).map(name => <Route key={name} path={`/admin/${name}`} element={<PlatformPage name={name}/>}/>)}
        {(['tenants','users','models','rules'] as const).map(name => <Route key={name} path={`/admin/${name}`} element={<AdminRoute><PlatformPage name={name}/></AdminRoute>}/>)}
        <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/admin/incidents'} replace/>}/>
      </Routes></main>
      <footer><span>CabinSentinel Operations · {locale === 'vi' ? 'Backend quyết định cuối cùng' : 'Backend-authoritative'}</span><span><i/> {locale === 'vi' ? 'Giao diện điều khiển V1' : 'Control plane UI v1'}</span></footer>
      <nav className="mobile-bottom-nav" aria-label="Mobile operations navigation">
        {visibleItems.filter(item => ['/admin','/admin/incidents','/admin/evaluations','/admin/vehicles'].includes(item.to)).map(item => <NavLink end={item.to === '/admin'} key={item.to} to={item.to}><Icon name={item.icon}/><span>{t(item.labelKey)}</span></NavLink>)}
        <button type="button" className={open ? 'active' : ''} onClick={() => setOpen(true)} aria-label={locale === 'vi' ? 'Mở thêm điều hướng' : 'Open more navigation'}><Icon name="menu"/><span>{locale === 'vi' ? 'Thêm' : 'More'}</span></button>
      </nav>
    </section>
  </div>
}

export function App() { return <AdminShell/> }
