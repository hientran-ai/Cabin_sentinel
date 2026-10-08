import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { JsonRecord } from '@cabinsentinel/api-client'
import { useAuth } from '@cabinsentinel/auth'
import { Link } from 'react-router-dom'
import { platformClient } from './data'
import { useLocale } from './i18n'
import { useConfirmAction } from './ConfirmDialog'

type PageName = 'incidents' | 'commands' | 'vehicles' | 'devices' | 'tenants' | 'users' | 'models' | 'rules' | 'audit' | 'system'
type Spec = { eyebrow: string; title: string; subtitle: string }
const specs: Record<PageName, Spec> = {
  incidents: { eyebrow: 'Incident operations', title: 'Incident queue', subtitle: 'Assignment, escalation and case notes backed by the incident API.' },
  commands: { eyebrow: 'Response operations', title: 'Command lifecycle', subtitle: 'Remote command records and operator rejection controls.' },
  vehicles: { eyebrow: 'Fleet management', title: 'Fleet vehicles', subtitle: 'Tenant-scoped inventory and backend-owned safety status.' },
  devices: { eyebrow: 'Edge operations', title: 'Device fleet', subtitle: 'Connectivity, firmware targets and device access controls.' },
  tenants: { eyebrow: 'Platform administration', title: 'Tenants', subtitle: 'Organizations and the users, vehicles and devices in their authorized scope.' },
  users: { eyebrow: 'Identity administration', title: 'Users & access', subtitle: 'Accounts, roles, sessions and access-review signals.' },
  models: { eyebrow: 'AI operations', title: 'Model registry', subtitle: 'Artifact registration, staged rollout and rollback.' },
  rules: { eyebrow: 'Decision governance', title: 'Safety rules', subtitle: 'Versioned and audited rulesets from the control plane.' },
  audit: { eyebrow: 'Compliance', title: 'Audit log', subtitle: 'Actor, action, target, outcome and correlation history.' },
  system: { eyebrow: 'Platform reliability', title: 'System health', subtitle: 'Dependencies, metrics, alerts and loaded AI capability.' },
}
const text = (v: unknown, fallback = '—') => v == null || v === '' ? fallback : typeof v === 'object' ? JSON.stringify(v) : String(v)
const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is JsonRecord => !!x && typeof x === 'object') : []
const strings = (v: unknown) => Array.isArray(v) ? v.map(String) : []

function Header({ spec, busy, refresh }: { spec: Spec; busy: boolean; refresh: () => void }) {
  return <div className="page-header"><div><p className="eyebrow">{spec.eyebrow}</p><h1>{spec.title}</h1><p>{spec.subtitle}</p></div><button className="secondary-button" disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh data'}</button></div>
}
function State({ loading, error, empty }: { loading: boolean; error: boolean; empty?: boolean }) {
  if (loading) return <div className="table-state"><span className="spinner"/>Loading verified backend data…</div>
  if (error) return <div className="platform-state is-error"><strong>Backend data unavailable</strong><span>No placeholder or inferred-safe data is shown.</span></div>
  if (empty) return <div className="platform-state"><strong>No records</strong><span>The backend returned an empty authorized scope.</span></div>
  return null
}
function Pill({ value }: { value: unknown }) {
  const label = text(value, 'UNKNOWN')
  const tone = /critical|failed|revoked|error|offline|unavailable|disabled/i.test(label) ? 'danger' : /active|ready|online|safe|ok|acknowledged/i.test(label) ? 'ok' : 'neutral'
  return <span className={`data-pill ${tone}`}>{label}</span>
}
function Notice({ mutation }: { mutation: { error: unknown; isSuccess: boolean } }) {
  const { bi } = useLocale()
  return mutation.error ? <p className="action-notice is-error">{mutation.error instanceof Error ? mutation.error.message : bi('Backend đã từ chối thao tác này.', 'The backend rejected this action.')}</p> : mutation.isSuccess ? <p className="action-notice is-success">{bi('Backend đã cập nhật và ghi nhận audit.', 'Backend updated and the action was audited.')}</p> : null
}

function IncidentActions({ item }: { item: JsonRecord }) {
  const qc = useQueryClient(); const ops = item.ops as JsonRecord || {}; const [assignee, setAssignee] = useState(text(ops.assignee, '')); const [note, setNote] = useState('')
  const mutation = useMutation({ mutationFn: ({ action, extra = {} }: { action: 'assign' | 'escalate' | 'note'; extra?: JsonRecord }) => platformClient.v1OpsIncidentAction(text(item.incident_id), action, { vehicle_id: text(item.vehicle_id), version: Number(ops.version ?? 0), ...extra }), onSuccess: () => { setNote(''); void qc.invalidateQueries({ queryKey: ['ops-incidents'] }) } })
  return <div className="inline-actions wide-actions"><input aria-label="Assignee" value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Assignee ID"/><button disabled={!assignee || mutation.isPending} onClick={() => mutation.mutate({ action: 'assign', extra: { assignee } })}>Assign</button><button disabled={mutation.isPending || item.status !== 'OPEN'} onClick={() => mutation.mutate({ action: 'escalate' })}>Escalate</button><input aria-label="Case note" value={note} onChange={e => setNote(e.target.value)} placeholder="Case note"/><button disabled={!note || mutation.isPending} onClick={() => mutation.mutate({ action: 'note', extra: { note } })}>Add note</button><Notice mutation={mutation}/></div>
}
function Incidents() {
  const q = useQuery({ queryKey: ['ops-incidents'], queryFn: () => platformClient.v1OpsIncidents(), refetchInterval: 5_000 }); const items = q.data?.items ?? []
  return <><Header spec={specs.incidents} busy={q.isFetching} refresh={() => void q.refetch()}/><section className="surface platform-surface"><State loading={q.isLoading} error={q.isError} empty={!items.length}/><div className="record-stack">{items.map((item, i) => { const ops = item.ops as JsonRecord || {}; return <article className="record-card action-card" key={text(item.incident_id, String(i))}><div className="record-summary"><div><strong>{text(item.incident_id)}</strong><small>{text(item.vehicle_name, text(item.vehicle_id))} · opened {text(item.opened_at)}</small></div><Pill value={item.risk_level}/><Pill value={ops.ops_status ?? 'UNASSIGNED'}/></div><IncidentActions item={item}/></article> })}</div></section></>
}

function CommandActions({ item }: { item: JsonRecord }) {
  const qc = useQueryClient(); const [reason, setReason] = useState(''); const terminal = /acknowledged|failed|expired|rejected/i.test(text(item.status))
  const mutation = useMutation({ mutationFn: () => platformClient.v1OpsRejectCommand(text(item.command_id), reason || undefined), onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops-commands'] }) })
  return <div className="inline-actions"><input aria-label="Rejection reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Rejection reason"/><button className="danger-button" disabled={terminal || mutation.isPending} onClick={() => mutation.mutate()}>Reject</button><Notice mutation={mutation}/></div>
}
function Commands() {
  const q = useQuery({ queryKey: ['ops-commands'], queryFn: () => platformClient.v1OpsCommands(), refetchInterval: 5_000 }); const items = q.data?.commands ?? []
  return <><Header spec={specs.commands} busy={q.isFetching} refresh={() => void q.refetch()}/><div className={`backend-note ${q.data?.enabled ? '' : 'is-locked'}`}>{q.data?.enabled ? 'Remote command workflow is enabled by backend policy.' : 'Remote commands are disabled by backend policy. Existing records remain visible.'}</div><section className="surface platform-surface"><State loading={q.isLoading} error={q.isError} empty={!items.length}/><div className="record-stack">{items.map((item, i) => <article className="record-card action-card" key={text(item.command_id, String(i))}><div className="record-summary"><div><strong>{text(item.type).toUpperCase()}</strong><small>{text(item.vehicle_id)} · {text(item.command_id)}</small></div><Pill value={item.status}/></div><CommandActions item={item}/></article>)}</div></section></>
}

function Vehicles() {
  const q = useQuery({ queryKey: ['admin-vehicles'], queryFn: () => platformClient.v1AdminVehicles(), refetchInterval: 10_000 }); const items = q.data?.items ?? []
  return <><Header spec={specs.vehicles} busy={q.isFetching} refresh={() => void q.refetch()}/><section className="surface platform-surface"><State loading={q.isLoading} error={q.isError} empty={!items.length}/>{items.length > 0 && <div className="data-table"><div className="data-head"><span>Vehicle</span><span>Owner / tenant</span><span>Connectivity</span><span>Risk</span></div>{items.map((x, i) => <div className="data-row" key={text(x.vehicle_id, String(i))}><div><strong>{text(x.name)}</strong><small>{text(x.vehicle_id)} · {text(x.plate)}</small></div><div><strong>{text(x.owner_id)}</strong><small>{text(x.tenant_id, 'Platform')}</small></div><Pill value={x.online ? 'ONLINE' : 'OFFLINE'}/><Pill value={x.risk_level}/></div>)}</div>}</section></>
}

function DeviceActions({ item }: { item: JsonRecord }) {
  const qc = useQueryClient(); const [firmware, setFirmware] = useState(text(item.target_firmware, text(item.firmware, '')))
  const mutation = useMutation({ mutationFn: (action: 'firmware' | 'revoke') => action === 'firmware' ? platformClient.v1AdminSetFirmware(text(item.device_id), firmware || null) : platformClient.v1AdminRevokeDevice(text(item.device_id)), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-devices'] }) })
  const heartbeats = useMutation({ mutationFn: () => platformClient.v1AdminDeviceHeartbeats(text(item.device_id)) })
  return <div className="inline-actions"><input aria-label="Target firmware" value={firmware} onChange={e => setFirmware(e.target.value)} placeholder="Target firmware"/><button disabled={mutation.isPending} onClick={() => mutation.mutate('firmware')}>Set firmware</button><button disabled={heartbeats.isPending} onClick={() => heartbeats.mutate()}>Load heartbeats</button><button className="danger-button" disabled={mutation.isPending || item.status === 'revoked'} onClick={() => mutation.mutate('revoke')}>Revoke</button><Notice mutation={mutation}/>{heartbeats.data && <pre className="action-json">{JSON.stringify(heartbeats.data, null, 2)}</pre>}</div>
}
function Devices() {
  const q = useQuery({ queryKey: ['admin-devices'], queryFn: () => platformClient.v1AdminDevices(), refetchInterval: 10_000 }); const items = q.data?.devices ?? []
  return <><Header spec={specs.devices} busy={q.isFetching} refresh={() => void q.refetch()}/>{q.data && <section className="mini-metrics"><article><span>Total</span><strong>{text(q.data.summary.total, '0')}</strong></article><article><span>Online</span><strong>{text(q.data.summary.online, '0')}</strong></article><article><span>Update pending</span><strong>{text(q.data.summary.update_pending, '0')}</strong></article></section>}<section className="surface platform-surface"><State loading={q.isLoading} error={q.isError} empty={!items.length}/><div className="record-stack">{items.map((x, i) => <article className="record-card action-card" key={text(x.device_id, String(i))}><div className="record-summary"><div><strong>{text(x.serial, text(x.device_id))}</strong><small>{text(x.vehicle_id)} · firmware {text(x.firmware)}</small></div><Pill value={x.online ? 'ONLINE' : x.status}/></div><DeviceActions item={x}/></article>)}</div></section></>
}

function CreateUser() {
  const qc = useQueryClient(); const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'operator', tenant_id: '' })
  const mutation = useMutation({ mutationFn: () => platformClient.v1AdminCreateUser({ ...form, tenant_id: form.tenant_id || null }), onSuccess: () => { setForm({ email: '', password: '', full_name: '', role: 'operator', tenant_id: '' }); void qc.invalidateQueries({ queryKey: ['admin-users'] }); void qc.invalidateQueries({ queryKey: ['admin-access-review'] }) } })
  return <form className="control-form" onSubmit={(e: FormEvent) => { e.preventDefault(); mutation.mutate() }}><h2>Create account</h2><div className="form-grid"><label><span>Full name</span><input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}/></label><label><span>Email</span><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label><span>Temporary password</span><input required minLength={10} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/></label><label><span>Role</span><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option>operator</option><option>owner</option><option>caregiver</option><option>admin</option></select></label><label><span>Tenant ID (optional)</span><input value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })}/></label></div><button disabled={mutation.isPending}>Create user</button><Notice mutation={mutation}/></form>
}
function CreateTenant() {
  const qc = useQueryClient(); const [name, setName] = useState(''); const tenants = useQuery({ queryKey: ['admin-tenants'], queryFn: () => platformClient.v1AdminTenants() }); const mutation = useMutation({ mutationFn: () => platformClient.v1AdminCreateTenant(name), onSuccess: () => { setName(''); void qc.invalidateQueries({ queryKey: ['admin-tenants'] }) } })
  return <form className="control-form" onSubmit={e => { e.preventDefault(); mutation.mutate() }}><h2>Tenant management</h2><div className="inline-actions"><input required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="New tenant name"/><button disabled={mutation.isPending}>Create tenant</button><span>{tenants.data?.tenants.map(x => text(x.name)).join(' · ') || 'No tenant in authorized scope'}</span></div><Notice mutation={mutation}/></form>
}
function UserActions({ item }: { item: JsonRecord }) {
  const qc = useQueryClient(); const [role, setRole] = useState(text(item.role, 'operator'))
  const mutation = useMutation({ mutationFn: (action: 'access' | 'sessions') => action === 'access' ? platformClient.v1AdminUpdateUser(text(item.user_id), { role, active: item.active !== true }) : platformClient.v1AdminRevokeUserSessions(text(item.user_id)), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); void qc.invalidateQueries({ queryKey: ['admin-access-review'] }) } })
  return <div className="inline-actions"><select aria-label="User role" value={role} onChange={e => setRole(e.target.value)}><option>admin</option><option>operator</option><option>owner</option><option>caregiver</option></select><button disabled={mutation.isPending} onClick={() => mutation.mutate('access')}>{item.active ? 'Update & disable' : 'Update & enable'}</button><button disabled={mutation.isPending} onClick={() => mutation.mutate('sessions')}>Revoke sessions</button><Notice mutation={mutation}/></div>
}
function Users() {
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => platformClient.v1AdminUsers() }); const review = useQuery({ queryKey: ['admin-access-review'], queryFn: () => platformClient.v1AdminAccessReview() }); const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => platformClient.v1AdminRoles() }); const items = users.data?.users ?? []
  return <><Header spec={specs.users} busy={users.isFetching || review.isFetching} refresh={() => { void users.refetch(); void review.refetch(); void roles.refetch() }}/><section className="mini-metrics"><article><span>Accounts</span><strong>{items.length}</strong></article><article><span>Flagged inactive</span><strong>{text(review.data?.summary.flagged)}</strong></article><article><span>Active admins</span><strong>{text(review.data?.summary.admins)}</strong></article></section><section className="surface platform-surface"><CreateTenant/><CreateUser/><State loading={users.isLoading} error={users.isError} empty={!items.length}/><div className="record-stack">{items.map((x, i) => <article className="record-card action-card" key={text(x.user_id, String(i))}><div className="record-summary"><div><strong>{text(x.full_name, text(x.email))}</strong><small>{text(x.email)} · {text(x.tenant_id, 'Platform')}</small></div><Pill value={x.active ? x.role : 'DISABLED'}/></div><UserActions item={x}/></article>)}</div></section><section className="surface platform-json"><h2>Effective role permissions</h2><pre>{JSON.stringify(roles.data ?? {}, null, 2)}</pre></section></>
}

function ModelForm() {
  const qc = useQueryClient(); const [form, setForm] = useState({ name: '', version: '', sha256: '', note: '' })
  const mutation = useMutation({ mutationFn: () => platformClient.v1AdminRegisterModel({ ...form, sha256: form.sha256 || null, note: form.note || null }), onSuccess: () => { setForm({ name: '', version: '', sha256: '', note: '' }); void qc.invalidateQueries({ queryKey: ['admin-models'] }) } })
  return <form className="control-form" onSubmit={e => { e.preventDefault(); mutation.mutate() }}><h2>Register model</h2><div className="form-grid"><label><span>Name</span><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label><span>Version</span><input required value={form.version} onChange={e => setForm({ ...form, version: e.target.value })}/></label><label className="wide-field"><span>SHA-256 (optional)</span><input pattern="[0-9a-fA-F]{64}" value={form.sha256} onChange={e => setForm({ ...form, sha256: e.target.value })}/></label><label className="wide-field"><span>Release note</span><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label></div><button disabled={mutation.isPending}>Register</button><Notice mutation={mutation}/></form>
}
function ModelActions({ item }: { item: JsonRecord }) {
  const qc = useQueryClient(); const [rollout, setRollout] = useState(Number(item.rollout_pct ?? 0)); const mutation = useMutation({ mutationFn: (action: 'rollout' | 'rollback') => action === 'rollout' ? platformClient.v1AdminRolloutModel(text(item.model_id), rollout) : platformClient.v1AdminRollbackModel(text(item.model_id)), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-models'] }); void qc.invalidateQueries({ queryKey: ['admin-vision'] }) } })
  return <div className="inline-actions"><input aria-label="Rollout percent" type="number" min="0" max="100" value={rollout} onChange={e => setRollout(Number(e.target.value))}/><button disabled={mutation.isPending} onClick={() => mutation.mutate('rollout')}>Apply rollout</button><button disabled={mutation.isPending} onClick={() => mutation.mutate('rollback')}>Rollback</button><Notice mutation={mutation}/></div>
}
function Models() {
  const q = useQuery({ queryKey: ['admin-models'], queryFn: () => platformClient.v1AdminModels() }); const vision = useQuery({ queryKey: ['admin-vision'], queryFn: () => platformClient.v1AdminVision() }); const items = q.data?.models ?? []
  return <><Header spec={specs.models} busy={q.isFetching || vision.isFetching} refresh={() => { void q.refetch(); void vision.refetch() }}/><section className="platform-grid"><article className="surface platform-surface"><ModelForm/><h2>Registry</h2><State loading={q.isLoading} error={q.isError} empty={!items.length}/><div className="record-stack">{items.map((x, i) => <article className="record-card action-card" key={text(x.model_id, String(i))}><div className="record-summary"><div><strong>{text(x.name)} · {text(x.version)}</strong><small>{text(x.model_id)}</small></div><Pill value={x.status}/></div><ModelActions item={x}/></article>)}</div></article><article className="surface platform-json"><h2>Runtime deployment</h2><pre>{JSON.stringify(vision.data ?? {}, null, 2)}</pre></article></section></>
}

function RulesForm() {
  const qc = useQueryClient(); const [version, setVersion] = useState(''); const [params, setParams] = useState('{\n  "temperature_warning_c": 35\n}'); const [note, setNote] = useState('')
  const mutation = useMutation({ mutationFn: () => platformClient.v1AdminCreateRuleset({ version, params: JSON.parse(params) as JsonRecord, note: note || null }), onSuccess: () => { setVersion(''); setNote(''); void qc.invalidateQueries({ queryKey: ['admin-rulesets'] }) } })
  return <form className="control-form" onSubmit={e => { e.preventDefault(); mutation.mutate() }}><h2>Create ruleset</h2><div className="form-grid"><label><span>Version</span><input required pattern="[A-Za-z0-9._-]{3,64}" value={version} onChange={e => setVersion(e.target.value)}/></label><label><span>Release note</span><input value={note} onChange={e => setNote(e.target.value)}/></label><label className="wide-field"><span>Numeric parameters (JSON)</span><textarea required rows={5} value={params} onChange={e => setParams(e.target.value)}/></label></div><button disabled={mutation.isPending}>Create ruleset</button><Notice mutation={mutation}/></form>
}
function RuleActions({ item }: { item: JsonRecord }) {
  const qc = useQueryClient(); const mutation = useMutation({ mutationFn: () => platformClient.v1AdminActivateRuleset(text(item.version)), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-rulesets'] }) })
  return <div className="inline-actions"><button disabled={mutation.isPending || item.status === 'active'} onClick={() => mutation.mutate()}>Activate version</button><Notice mutation={mutation}/></div>
}
function Rules() {
  const q = useQuery({ queryKey: ['admin-rulesets'], queryFn: () => platformClient.v1AdminRulesets() }); const items = q.data?.rulesets ?? []
  return <><Header spec={specs.rules} busy={q.isFetching} refresh={() => void q.refetch()}/><section className="surface platform-surface"><div className="backend-note">{q.data?.note || 'Backend ruleset registry'}</div><RulesForm/><State loading={q.isLoading} error={q.isError} empty={!items.length}/><div className="record-stack">{items.map((x, i) => <article className="record-card action-card" key={text(x.version, String(i))}><div className="record-summary"><div><strong>{text(x.version)}</strong><small>Created by {text(x.created_by)}</small></div><Pill value={x.status}/></div><p>{text(x.note, 'No release note')}</p><pre>{JSON.stringify(x.params ?? {}, null, 2)}</pre><RuleActions item={x}/></article>)}</div></section></>
}

function Audit() {
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => platformClient.v1AdminAudit(), refetchInterval: 15_000 }); const [search, setSearch] = useState(''); const items = useMemo(() => (q.data?.entries ?? []).filter(x => !search || JSON.stringify(x).toLowerCase().includes(search.toLowerCase())), [q.data, search])
  return <><Header spec={specs.audit} busy={q.isFetching} refresh={() => void q.refetch()}/><section className="surface platform-surface"><label className="platform-search"><span>Filter current audit window</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Actor, action, target, correlation ID…"/></label><State loading={q.isLoading} error={q.isError} empty={!items.length}/>{items.length > 0 && <div className="audit-list">{items.map((x, i) => <article key={text(x.id, String(i))}><div><strong>{text(x.action)}</strong><small>{text(x.ts)}</small></div><div><span>Actor</span><b>{text(x.actor)}</b></div><div><span>Target</span><b>{text(x.target)}</b></div><Pill value={x.outcome}/><code>{text(x.correlation_id)}</code></article>)}</div>}</section></>
}
function System() {
  const q = useQuery({ queryKey: ['admin-system'], queryFn: () => platformClient.v1AdminSystem(), refetchInterval: 15_000 }); const vision = useQuery({ queryKey: ['admin-system-vision'], queryFn: () => platformClient.v1AdminVision(), refetchInterval: 30_000 }); const deps = q.data?.dependencies && typeof q.data.dependencies === 'object' ? q.data.dependencies as JsonRecord : {}; const alerts = list(q.data?.alerts)
  return <><Header spec={specs.system} busy={q.isFetching || vision.isFetching} refresh={() => { void q.refetch(); void vision.refetch() }}/><State loading={q.isLoading} error={q.isError}/><section className="platform-grid"><article className="surface platform-surface"><h2>Dependencies</h2><div className="dependency-grid">{Object.entries(deps).map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><Pill value={value}/></div>)}</div><h2>Active alerts</h2>{alerts.length ? alerts.map((x, i) => <div className="system-alert" key={i}><Pill value={x.severity}/><div><strong>{text(x.code)}</strong><span>{text(x.message)}</span></div></div>) : <div className="platform-state"><strong>No active backend alerts</strong></div>}</article><article className="surface platform-json"><h2>Runtime metrics</h2><pre>{JSON.stringify(q.data?.metrics ?? {}, null, 2)}</pre><h2>Loaded vision</h2><pre>{JSON.stringify(vision.data ?? {}, null, 2)}</pre></article></section></>
}

function LocalState({ loading, error, empty }: { loading: boolean; error: boolean; empty?: boolean }) {
  const { t } = useLocale()
  if (loading) return <div className="table-state"><span className="spinner"/>{t('loading')}</div>
  if (error) return <div className="platform-state is-error"><strong>{t('backendUnavailable')}</strong><span>{t('failSafe')}</span></div>
  if (empty) return <div className="platform-state"><strong>{t('noRecords')}</strong></div>
  return null
}

function WorkflowHeader({ title, subtitle, busy, refresh }: { title: string; subtitle: string; busy: boolean; refresh: () => void }) {
  const { t } = useLocale()
  return <div className="page-header"><div><p className="eyebrow">CabinSentinel Control Plane</p><h1>{title}</h1><p>{subtitle}</p></div><button className="secondary-button" disabled={busy} onClick={refresh}>{busy ? t('refreshing') : t('refresh')}</button></div>
}

export function AdminOverview() {
  const { user } = useAuth()
  const { t, bi } = useLocale()
  const vehicles = useQuery({ queryKey: ['admin-vehicles'], queryFn: () => platformClient.v1AdminVehicles(), refetchInterval: 10_000 })
  const incidents = useQuery({ queryKey: ['ops-incidents'], queryFn: () => platformClient.v1OpsIncidents(), refetchInterval: 5_000 })
  const commands = useQuery({ queryKey: ['ops-commands'], queryFn: () => platformClient.v1OpsCommands(), refetchInterval: 5_000 })
  const system = useQuery({ queryKey: ['admin-system'], queryFn: () => platformClient.v1AdminSystem(), refetchInterval: 15_000 })
  const fleet = vehicles.data?.items ?? []
  const cases = incidents.data?.items ?? []
  const commandItems = commands.data?.commands ?? []
  const pending = commandItems.filter(item => !/acknowledged|failed|expired|rejected|canceled/i.test(text(item.status)))
  const alerts = list(system.data?.alerts)
  const busy = vehicles.isFetching || incidents.isFetching || commands.isFetching || system.isFetching
  const refresh = () => { void vehicles.refetch(); void incidents.refetch(); void commands.refetch(); void system.refetch() }
  return <>
    <section className="overview-hero">
      <div className="overview-hero-copy"><p className="eyebrow">CabinSentinel Control Plane</p><h1>{bi(`Xin chào, ${user?.displayName || 'Operator'}`, `Good day, ${user?.displayName || 'Operator'}`)}</h1><p>{bi('Giám sát đội xe, ưu tiên sự cố và phối hợp phản ứng từ một trung tâm vận hành duy nhất.', 'Monitor the fleet, prioritize incidents and coordinate response from one operations center.')}</p><div className="hero-status-row"><span className="hero-live"><i/>{t('live')}</span><span>{fleet.length || '—'} {t('vehicles').toLowerCase()}</span><span>{bi('Backend xác thực', 'Backend verified')}</span></div></div>
      <div className="overview-vehicle" aria-hidden="true"><span className="vehicle-scan-line"/><img src={`${import.meta.env.BASE_URL}images/cabin-noir-suv-v2.png`} alt=""/></div>
      <button className="secondary-button hero-refresh" disabled={busy} onClick={refresh}>{busy ? t('refreshing') : t('refresh')}</button>
    </section>
    {(vehicles.isError || incidents.isError) && <section className="degraded-banner" role="alert"><div><strong>{t('backendUnavailable')}</strong><p>{t('failSafe')}</p></div><button onClick={refresh}>{t('refresh')}</button></section>}
    <section className="metric-grid" aria-live="polite"><article className="metric-card danger"><div><small>{t('activeIncidents')}</small><strong>{incidents.isLoading ? '—' : cases.filter(item => item.status === 'OPEN').length}</strong><p>{bi('Cần điều phối và xác minh', 'Require triage and verification')}</p></div></article><article className="metric-card warning"><div><small>{t('critical')}</small><strong>{incidents.isLoading ? '—' : cases.filter(item => String(item.risk_level).toUpperCase() === 'CRITICAL').length}</strong><p>{bi('Không tự suy diễn là an toàn', 'Never inferred as safe')}</p></div></article><article className="metric-card"><div><small>{t('offlineVehicles')}</small><strong>{vehicles.isLoading ? '—' : fleet.filter(item => item.online !== true).length}</strong><p>{vehicles.isLoading ? t('loading') : `${fleet.length} ${t('vehicles').toLowerCase()}`}</p></div></article><article className="metric-card"><div><small>{t('pendingCommands')}</small><strong>{commands.isLoading ? '—' : pending.length}</strong><p>{commands.isLoading ? t('loading') : commands.data?.enabled ? bi('Remote command đang bật', 'Remote commands enabled') : bi('Remote command đang khóa', 'Remote commands locked')}</p></div></article></section>
    <section className="dashboard-grid"><article className="surface stream-card"><div className="section-heading"><div><span className="section-kicker">{t('safetyOperations')}</span><h2>{t('activeIncidents')}</h2><p>{bi('Ưu tiên theo mức rủi ro và thời gian mở.', 'Prioritized by risk and time open.')}</p></div><Link to="/admin/incidents">{bi('Mở hàng đợi', 'Open queue')} →</Link></div><div className="record-stack">{cases.slice(0, 6).map(item => <Link className="compact-resource" to="/admin/incidents" key={text(item.incident_id)}><div><strong>{text(item.vehicle_name, text(item.vehicle_id))}</strong><small>{text(item.incident_id)} · {text(item.opened_at)}</small></div><Pill value={item.risk_level}/></Link>)}{!cases.length && <div className="platform-state"><strong>{t('noRecords')}</strong></div>}</div></article><aside className="right-rail"><article className="surface health-card"><div className="section-heading"><div><span className="section-kicker">{t('system')}</span><h2>{bi('Cảnh báo hoạt động', 'Active alerts')}</h2></div><Pill value={alerts.length ? 'ATTENTION' : 'READY'}/></div>{alerts.length ? alerts.slice(0, 5).map((item, index) => <div className="system-alert" key={index}><Pill value={item.severity}/><div><strong>{text(item.code)}</strong><span>{text(item.message)}</span></div></div>) : <div className="platform-state"><strong>{bi('Không có cảnh báo backend', 'No active backend alerts')}</strong></div>}</article><article className="surface scope-card"><span className="section-kicker">{bi('Phạm vi phiên', 'Session scope')}</span><h2>{user?.roles.join(' · ')}</h2><p>{bi('Menu và route được giới hạn theo vai trò. Backend tiếp tục kiểm tra quyền cho từng API.', 'Navigation and routes are role-aware. The backend remains authoritative for every API permission.')}</p></article></aside></section>
  </>
}

export function EvaluationsWorkbench() {
  const { t, bi } = useLocale()
  const vehicles = useQuery({ queryKey: ['admin-vehicles'], queryFn: () => platformClient.v1AdminVehicles() })
  const vehicleIds = (vehicles.data?.items ?? []).map(item => text(item.vehicle_id)).filter(Boolean)
  const query = useQuery({
    queryKey: ['fleet-evaluations', ...vehicleIds],
    enabled: vehicleIds.length > 0,
    refetchInterval: 10_000,
    queryFn: async () => {
      const responses = await Promise.all(vehicleIds.map(id => platformClient.v1VehicleEvents(id, 50)))
      return responses.flatMap(response => response.events.filter(event => event.event_type === 'evaluation').map(event => ({ ...event, vehicle_id: event.vehicle_id || response.vehicle_id } as unknown as JsonRecord))).sort((a, b) => Date.parse(text(b.timestamp, text(b.evaluated_at, ''))) - Date.parse(text(a.timestamp, text(a.evaluated_at, ''))))
    },
  })
  const [risk, setRisk] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<JsonRecord>()
  const items = (query.data ?? []).filter(item => (risk === 'ALL' || text(item.risk_level).toUpperCase() === risk) && (!search || `${text(item.vehicle_id)} ${text(item.rule_id)} ${text(item.reason)}`.toLowerCase().includes(search.toLowerCase())))
  return <>
    <WorkflowHeader title={t('evaluations')} subtitle={bi('Luồng quyết định an toàn trên toàn bộ đội xe được cấp quyền.', 'Safety decisions across the entire authorized fleet.')} busy={vehicles.isFetching || query.isFetching} refresh={() => { void vehicles.refetch(); void query.refetch() }}/>
    <section className="surface workflow-toolbar"><div className="filter-tabs">{['ALL','CRITICAL','WARNING','NOTICE','SAFE','ERROR'].map(value => <button key={value} className={risk === value ? 'active' : ''} onClick={() => setRisk(value)}>{value === 'ALL' ? t('all') : value}</button>)}</div><label className="platform-search"><span>{t('search')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={bi('Xe, rule, lý do…', 'Vehicle, rule, reason…')}/></label></section>
    <LocalState loading={vehicles.isLoading || query.isLoading} error={vehicles.isError || query.isError} empty={!items.length}/>
    {!!items.length && <section className="evaluation-workbench"><article className="surface platform-surface"><div className="data-table"><div className="data-head"><span>{t('risk')}</span><span>{t('vehicles')}</span><span>{bi('Quyết định', 'Decision')}</span><span>{bi('Thời gian', 'Observed')}</span></div>{items.map((item, index) => <button className="data-row evaluation-row-button" key={`${text(item.vehicle_id)}-${text(item.event_id, String(index))}`} onClick={() => setSelected(item)}><Pill value={item.risk_level}/><div><strong>{text(item.vehicle_id)}</strong><small>{text(item.incident_id)}</small></div><div><strong>{text(item.reason)}</strong><small>{text(item.rule_id)} · R{text(item.revision)}</small></div><div><strong>{text(item.timestamp, text(item.evaluated_at))}</strong><small>{item.decision_current === false ? bi('Dữ liệu cũ', 'Stale decision') : bi('Hiện hành', 'Current')}</small></div></button>)}</div></article>{selected && <aside className="surface audit-detail"><div className="record-summary"><h2>{bi('Chi tiết đánh giá', 'Evaluation detail')}</h2><button className="secondary-button" onClick={() => setSelected(undefined)}>×</button></div><Pill value={selected.risk_level}/><dl className="workflow-facts"><div><dt>{t('vehicles')}</dt><dd>{text(selected.vehicle_id)}</dd></div><div><dt>Rule</dt><dd>{text(selected.rule_id)}</dd></div><div><dt>Revision</dt><dd>{text(selected.revision)}</dd></div><div><dt>{bi('Sự cố', 'Incident')}</dt><dd>{text(selected.incident_id)}</dd></div></dl><pre>{JSON.stringify(selected, null, 2)}</pre></aside>}</section>}
  </>
}

function IncidentWorkbench() {
  const { user } = useAuth()
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['ops-incidents'], queryFn: () => platformClient.v1OpsIncidents(), refetchInterval: 5_000 })
  const [filter, setFilter] = useState<'ALL' | 'UNASSIGNED' | 'ESCALATED' | 'OPEN' | 'RESOLVED'>('ALL')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState(false)
  const [commandType, setCommandType] = useState<'horn' | 'sms' | 'unlock'>('horn')
  const { confirm, confirmationDialog } = useConfirmAction()
  const items = query.data?.items ?? []
  const shown = useMemo(() => items.filter(item => {
    const ops = item.ops as JsonRecord || {}
    const status = text(ops.ops_status, 'UNASSIGNED').toUpperCase()
    const incidentStatus = text(item.status).toUpperCase()
    const matchesFilter = filter === 'ALL' || filter === status || filter === incidentStatus
    const haystack = `${text(item.incident_id)} ${text(item.vehicle_id)} ${text(item.vehicle_name)} ${text(item.risk_level)} ${text(ops.assignee)}`.toLowerCase()
    return matchesFilter && (!search || haystack.includes(search.toLowerCase()))
  }), [filter, items, search])
  const selected = items.find(item => text(item.incident_id) === selectedId) || shown[0]
  const selectedOps = selected?.ops as JsonRecord || {}

  const mutation = useMutation({
    mutationFn: async (input: { kind: 'assign' | 'escalate' | 'note' | 'ack' | 'hold' | 'resolve' | 'command'; value?: string | boolean }) => {
      if (!selected) throw new Error(bi('Chưa chọn sự cố.', 'Select an incident first.'))
      const incidentId = text(selected.incident_id)
      const vehicleId = text(selected.vehicle_id)
      const version = Number(selectedOps.version ?? 0)
      if (input.kind === 'assign') return platformClient.v1OpsIncidentAction(incidentId, 'assign', { vehicle_id: vehicleId, version, assignee: String(input.value || user?.id || '') })
      if (input.kind === 'escalate') return platformClient.v1OpsIncidentAction(incidentId, 'escalate', { vehicle_id: vehicleId, version })
      if (input.kind === 'note') return platformClient.v1OpsIncidentAction(incidentId, 'note', { vehicle_id: vehicleId, version, note: String(input.value || '') })
      if (input.kind === 'ack') return platformClient.v1AcknowledgeIncident(vehicleId, incidentId)
      if (input.kind === 'hold') return platformClient.v1HoldIncident(vehicleId, incidentId, version, Boolean(input.value), note || undefined)
      if (input.kind === 'resolve') return platformClient.v1ResolveIncident(vehicleId, incidentId, Number(selected.revision ?? 0))
      return platformClient.v1RequestCommand(vehicleId, commandType, incidentId)
    },
    onSuccess: () => {
      setNote(''); setChecked(false)
      void qc.invalidateQueries({ queryKey: ['ops-incidents'] })
      void qc.invalidateQueries({ queryKey: ['ops-commands'] })
    },
  })

  const runDangerous = (kind: 'resolve' | 'command') => {
    const message = kind === 'resolve'
      ? bi('Sự cố chỉ được đóng sau khi cabin đã được kiểm tra trực tiếp. Tiếp tục?', 'Only resolve after a physical cabin check. Continue?')
      : commandType === 'unlock'
        ? bi('Mở khóa yêu cầu người thứ hai phê duyệt và chỉ hợp lệ khi quyết định CRITICAL còn hiện hành. Tiếp tục?', 'Unlock requires four-eyes approval and a current CRITICAL decision. Continue?')
        : t('dangerousAction')
    confirm({
      title: kind === 'resolve' ? bi('Xác nhận kết thúc sự cố', 'Confirm incident resolution') : bi('Xác nhận phản ứng từ xa', 'Confirm remote response'),
      description: message,
      confirmLabel: kind === 'resolve' ? t('resolve') : t('requestCommand'),
      tone: kind === 'resolve' || commandType === 'unlock' ? 'danger' : 'warning',
    }, () => mutation.mutate({ kind }))
  }

  return <>
    {confirmationDialog}
    <WorkflowHeader title={t('incidents')} subtitle={bi('Hàng đợi xử lý sự cố theo thời gian thực, có phân công, chuyển cấp và nhật ký.', 'Real-time incident queue with assignment, escalation and an audited response trail.')} busy={query.isFetching} refresh={() => void query.refetch()}/>
    <section className="workflow-toolbar surface">
      <div className="filter-tabs">{(['ALL','UNASSIGNED','ESCALATED','OPEN','RESOLVED'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'ALL' ? t('all') : value === 'UNASSIGNED' ? t('unassigned') : value === 'ESCALATED' ? t('escalated') : value === 'OPEN' ? t('open') : t('resolved')}</button>)}</div>
      <label className="platform-search"><span>{t('search')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={bi('Mã sự cố, xe, người phụ trách…', 'Incident, vehicle, assignee…')}/></label>
    </section>
    <LocalState loading={query.isLoading} error={query.isError} empty={!shown.length}/>
    {!!shown.length && <section className="workbench-grid">
      <div className="surface queue-panel"><div className="queue-heading"><strong>{bi('Hàng đợi', 'Queue')}</strong><span>{shown.length}</span></div>{shown.map(item => { const ops = item.ops as JsonRecord || {}; const id = text(item.incident_id); return <button className={`queue-row ${text(selected?.incident_id) === id ? 'is-selected' : ''}`} key={id} onClick={() => { setSelectedId(id); setAssignee(text(ops.assignee, '')); setNote(''); setChecked(false) }}><div><Pill value={item.risk_level}/><strong>{text(item.vehicle_name, text(item.vehicle_id))}</strong><small>{id}</small></div><div><Pill value={ops.ops_status ?? 'UNASSIGNED'}/><small>{text(item.opened_at)}</small></div></button>})}</div>
      {selected && <article className="surface incident-workspace">
        <div className="record-summary"><div><span className="section-kicker">{text(selected.incident_id)}</span><h2>{text(selected.vehicle_name, text(selected.vehicle_id))}</h2><small>{bi('Mở lúc', 'Opened')} {text(selected.opened_at)}</small></div><Pill value={selected.risk_level}/><Pill value={selectedOps.ops_status ?? 'UNASSIGNED'}/></div>
        <dl className="workflow-facts"><div><dt>{bi('Trạng thái', 'Status')}</dt><dd>{text(selected.status)}</dd></div><div><dt>{bi('Revision', 'Revision')}</dt><dd>{text(selected.revision)}</dd></div><div><dt>{t('assignee')}</dt><dd>{text(selectedOps.assignee, t('unassigned'))}</dd></div><div><dt>{bi('Giữ mở', 'Held open')}</dt><dd>{selectedOps.keep_active ? bi('Có', 'Yes') : bi('Không', 'No')}</dd></div></dl>
        <div className="workflow-section"><h3>{bi('1. Tiếp nhận và điều phối', '1. Triage and ownership')}</h3><div className="inline-actions"><input value={assignee} onChange={event => setAssignee(event.target.value)} placeholder={t('assignee')}/><button onClick={() => mutation.mutate({ kind: 'assign', value: assignee || user?.id })} disabled={mutation.isPending || (!assignee && !user?.id)}>{assignee ? t('assign') : t('assignToMe')}</button><button onClick={() => mutation.mutate({ kind: 'escalate' })} disabled={mutation.isPending || selected.status !== 'OPEN'}>{t('escalate')}</button></div></div>
        <div className="workflow-section"><h3>{bi('2. Điều tra và ghi nhận', '2. Investigate and document')}</h3><div className="inline-actions wide-actions"><textarea rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder={t('note')}/><button onClick={() => mutation.mutate({ kind: 'note', value: note })} disabled={!note.trim() || mutation.isPending}>{t('addNote')}</button><button onClick={() => mutation.mutate({ kind: 'ack' })} disabled={mutation.isPending}>{t('acknowledge')}</button><button onClick={() => mutation.mutate({ kind: 'hold', value: !selectedOps.keep_active })} disabled={mutation.isPending}>{selectedOps.keep_active ? t('releaseHold') : t('hold')}</button></div></div>
        <div className="workflow-section"><h3>{bi('3. Phản ứng từ xa', '3. Remote response')}</h3><div className="inline-actions"><select value={commandType} onChange={event => setCommandType(event.target.value as typeof commandType)}><option value="horn">{t('horn')}</option><option value="sms">{t('sms')}</option><option value="unlock">{t('unlock')}</option></select><button onClick={() => runDangerous('command')} disabled={mutation.isPending}>{t('requestCommand')}</button></div><small>{bi('Lệnh mở khóa luôn cần phê duyệt bốn mắt khi người yêu cầu không phải chủ xe.', 'Unlock uses four-eyes approval when requested by someone other than the owner.')}</small></div>
        <div className="workflow-section resolution-section"><h3>{bi('4. Kết thúc sự cố', '4. Resolution')}</h3><label className="check-row"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}/><span>{t('cabinChecked')}</span></label><button className="danger-button" onClick={() => runDangerous('resolve')} disabled={!checked || mutation.isPending || selected.status !== 'OPEN' || selectedOps.keep_active === true}>{t('resolve')}</button></div>
        <Notice mutation={mutation}/>
      </article>}
    </section>}
  </>
}

function CommandWorkbench() {
  const { user } = useAuth()
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['ops-commands'], queryFn: () => platformClient.v1OpsCommands(), refetchInterval: 5_000 })
  const [filter, setFilter] = useState('ALL')
  const [reasonById, setReasonById] = useState<Record<string, string>>({})
  const { confirm, confirmationDialog } = useConfirmAction()
  const items = (query.data?.commands ?? []).filter(item => filter === 'ALL' || text(item.status).toUpperCase() === filter)
  const mutation = useMutation({
    mutationFn: ({ action, item }: { action: 'confirm' | 'cancel' | 'reject'; item: JsonRecord }) => {
      const id = text(item.command_id)
      if (action === 'confirm') return platformClient.v1ConfirmCommand(id)
      if (action === 'cancel') return platformClient.v1CancelCommand(id)
      return platformClient.v1OpsRejectCommand(id, reasonById[id] || undefined)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops-commands'] }),
  })
  return <>
    {confirmationDialog}
    <WorkflowHeader title={t('commands')} subtitle={bi('Theo dõi vòng đời lệnh và quy trình phê duyệt bốn mắt.', 'Track command lifecycle and four-eyes approvals.')} busy={query.isFetching} refresh={() => void query.refetch()}/>
    <div className={`backend-note ${query.data?.enabled ? '' : 'is-locked'}`}>{query.data?.enabled ? bi('Chính sách backend đang cho phép remote command.', 'Remote commands are enabled by backend policy.') : bi('Backend đang khóa remote command; bản ghi cũ vẫn chỉ đọc.', 'Remote commands are disabled by backend policy; existing records remain read-only.')}</div>
    <section className="surface platform-surface"><div className="command-flow" aria-label={bi('Vòng đời lệnh', 'Command lifecycle')}><span>REQUESTED</span><i>→</i><span>AUTHORIZED</span><i>→</i><span>SENT</span><i>→</i><span>ACKNOWLEDGED</span></div><div className="filter-tabs">{['ALL','requested','authorized','sent','acknowledged','failed','expired','rejected'].map(value => { const labels: Record<string, string> = { requested: bi('đã yêu cầu', 'requested'), authorized: bi('đã duyệt', 'authorized'), sent: bi('đã gửi', 'sent'), acknowledged: bi('đã xác nhận', 'acknowledged'), failed: bi('thất bại', 'failed'), expired: bi('hết hạn', 'expired'), rejected: bi('bị từ chối', 'rejected') }; return <button key={value} className={filter === value.toUpperCase() ? 'active' : ''} onClick={() => setFilter(value.toUpperCase())}>{value === 'ALL' ? t('all') : labels[value]}</button>})}</div><LocalState loading={query.isLoading} error={query.isError} empty={!items.length}/><div className="record-stack">{items.map((item, index) => { const id = text(item.command_id, String(index)); const terminal = /acknowledged|failed|expired|rejected|canceled/i.test(text(item.status)); const sameRequester = text(item.requested_by) === user?.id; const needsFourEyes = text(item.type) === 'unlock' && sameRequester; return <article className="record-card action-card" key={id}><div className="record-summary"><div><strong>{text(item.type).toUpperCase()}</strong><small>{text(item.vehicle_id)} · {id}</small></div><Pill value={item.status}/></div><dl className="workflow-facts"><div><dt>{bi('Người yêu cầu', 'Requested by')}</dt><dd>{text(item.requested_by)}</dd></div><div><dt>{bi('Người phê duyệt', 'Authorized by')}</dt><dd>{text(item.authorized_by)}</dd></div><div><dt>{bi('Hết hạn', 'Expires')}</dt><dd>{text(item.expires_at)}</dd></div></dl>{needsFourEyes && <p className="backend-note is-locked">{bi('Bạn không thể tự phê duyệt lệnh mở khóa do chính mình yêu cầu.', 'You cannot approve your own unlock request.')}</p>}<div className="inline-actions"><button disabled={terminal || needsFourEyes || mutation.isPending} onClick={() => mutation.mutate({ action: 'confirm', item })}>{t('confirm')}</button><button disabled={terminal || mutation.isPending} onClick={() => mutation.mutate({ action: 'cancel', item })}>{t('cancel')}</button><input value={reasonById[id] || ''} onChange={event => setReasonById({ ...reasonById, [id]: event.target.value })} placeholder={t('reason')}/><button className="danger-button" disabled={terminal || mutation.isPending} onClick={() => confirm({ title: bi('Từ chối lệnh?', 'Reject command?'), description: t('dangerousAction'), confirmLabel: t('reject'), tone: 'danger' }, () => mutation.mutate({ action: 'reject', item }))}>{t('reject')}</button></div><Notice mutation={mutation}/></article>})}</div></section>
  </>
}

function TenantsWorkbench() {
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const tenants = useQuery({ queryKey: ['admin-tenants'], queryFn: () => platformClient.v1AdminTenants() })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => platformClient.v1AdminUsers() })
  const vehicles = useQuery({ queryKey: ['admin-vehicles'], queryFn: () => platformClient.v1AdminVehicles() })
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const mutation = useMutation({ mutationFn: () => platformClient.v1AdminCreateTenant(name.trim()), onSuccess: () => { setName(''); void qc.invalidateQueries({ queryKey: ['admin-tenants'] }) } })
  const items = tenants.data?.tenants ?? []
  const selected = items.find(item => text(item.tenant_id) === selectedId) || items[0]
  const tenantUsers = (users.data?.users ?? []).filter(item => item.tenant_id === selected?.tenant_id)
  const tenantVehicles = (vehicles.data?.items ?? []).filter(item => item.tenant_id === selected?.tenant_id)
  return <>
    <WorkflowHeader title={t('tenants')} subtitle={bi('Quản lý phạm vi tổ chức và tài nguyên liên quan.', 'Manage organization scope and related resources.')} busy={tenants.isFetching || users.isFetching || vehicles.isFetching} refresh={() => { void tenants.refetch(); void users.refetch(); void vehicles.refetch() }}/>
    <section className="surface control-form"><h2>{t('createTenant')}</h2><form className="inline-actions" onSubmit={event => { event.preventDefault(); mutation.mutate() }}><input minLength={2} required value={name} onChange={event => setName(event.target.value)} placeholder={t('tenantName')}/><button disabled={mutation.isPending || name.trim().length < 2}>{t('createTenant')}</button></form><Notice mutation={mutation}/></section>
    <LocalState loading={tenants.isLoading} error={tenants.isError} empty={!items.length}/>
    {!!items.length && <section className="workbench-grid tenant-workbench"><div className="surface queue-panel">{items.map(item => { const id = text(item.tenant_id); return <button className={`queue-row ${text(selected?.tenant_id) === id ? 'is-selected' : ''}`} key={id} onClick={() => setSelectedId(id)}><div><strong>{text(item.name)}</strong><small>{id}</small></div></button>})}</div>{selected && <article className="surface incident-workspace"><span className="section-kicker">{text(selected.tenant_id)}</span><h2>{text(selected.name)}</h2><section className="mini-metrics"><article><span>{t('users')}</span><strong>{tenantUsers.length}</strong></article><article><span>{t('vehicles')}</span><strong>{tenantVehicles.length}</strong></article><article><span>{bi('Đang online', 'Online')}</span><strong>{tenantVehicles.filter(item => item.online === true).length}</strong></article></section><div className="workflow-section"><h3>{t('users')}</h3>{tenantUsers.length ? tenantUsers.map(item => <div className="compact-resource" key={text(item.user_id)}><div><strong>{text(item.full_name, text(item.email))}</strong><small>{text(item.email)}</small></div><Pill value={item.active ? item.role : 'DISABLED'}/></div>) : <p>{t('noRecords')}</p>}</div><div className="workflow-section"><h3>{t('vehicles')}</h3>{tenantVehicles.length ? tenantVehicles.map(item => <div className="compact-resource" key={text(item.vehicle_id)}><div><strong>{text(item.name)}</strong><small>{text(item.vehicle_id)}</small></div><Pill value={item.online ? 'ONLINE' : 'OFFLINE'}/></div>) : <p>{t('noRecords')}</p>}</div></article>}</section>}
  </>
}

function UserAccessRow({ item }: { item: JsonRecord }) {
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const [role, setRole] = useState(text(item.role, 'operator'))
  const { confirm, confirmationDialog } = useConfirmAction()
  useEffect(() => setRole(text(item.role, 'operator')), [item.role])
  const mutation = useMutation({
    mutationFn: (action: 'role' | 'status' | 'sessions') => {
      const id = text(item.user_id)
      if (action === 'role') return platformClient.v1AdminUpdateUser(id, { role })
      if (action === 'status') return platformClient.v1AdminUpdateUser(id, { active: item.active !== true })
      return platformClient.v1AdminRevokeUserSessions(id)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); void qc.invalidateQueries({ queryKey: ['admin-access-review'] }) },
  })
  const accessChange = (action: 'role' | 'status' | 'sessions') => confirm({
    title: action === 'role' ? bi('Thay đổi quyền truy cập?', 'Change access role?') : action === 'sessions' ? bi('Thu hồi mọi phiên?', 'Revoke all sessions?') : item.active ? bi('Vô hiệu hóa tài khoản?', 'Disable account?') : bi('Kích hoạt tài khoản?', 'Enable account?'),
    description: action === 'role' ? bi(`Vai trò sẽ đổi từ ${text(item.role)} sang ${role}.`, `The role will change from ${text(item.role)} to ${role}.`) : action === 'sessions' ? bi('Người dùng sẽ phải đăng nhập lại trên mọi thiết bị.', 'The user will need to sign in again on every device.') : bi('Thay đổi có hiệu lực ngay sau khi backend xác nhận.', 'The change takes effect after backend confirmation.'),
    confirmLabel: action === 'role' ? t('saveRole') : action === 'sessions' ? t('revokeSessions') : item.active ? t('disableAccount') : t('enableAccount'),
    tone: action === 'role' ? 'warning' : 'danger',
  }, () => mutation.mutate(action))
  return <>{confirmationDialog}<article className="record-card action-card"><div className="record-summary"><div><strong>{text(item.full_name, text(item.email))}</strong><small>{text(item.email)} · {text(item.tenant_id, 'Platform')}</small></div><Pill value={item.active ? item.role : 'DISABLED'}/></div><div className="inline-actions"><select value={role} onChange={event => setRole(event.target.value)}><option value="admin">admin</option><option value="operator">operator</option><option value="owner">owner</option><option value="caregiver">caregiver</option></select><button disabled={mutation.isPending || role === item.role} onClick={() => accessChange('role')}>{t('saveRole')}</button><button className={item.active ? 'danger-button' : ''} disabled={mutation.isPending} onClick={() => accessChange('status')}>{item.active ? t('disableAccount') : t('enableAccount')}</button><button disabled={mutation.isPending} onClick={() => accessChange('sessions')}>{t('revokeSessions')}</button></div><Notice mutation={mutation}/></article></>
}

function RoleEditor({ role, initial, catalogue }: { role: string; initial: string[]; catalogue: string[] }) {
  const { bi } = useLocale()
  const qc = useQueryClient()
  const [permissions, setPermissions] = useState(initial)
  const { confirm, confirmationDialog } = useConfirmAction()
  useEffect(() => setPermissions(initial), [initial.join('|')])
  const mutation = useMutation({ mutationFn: () => platformClient.v1AdminSetRolePermissions(role, permissions), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-roles'] }) })
  if (initial.includes('*')) return <article className="role-card"><div className="record-summary"><strong>{role}</strong><Pill value="ALL PERMISSIONS"/></div><p>{bi('Vai trò quản trị nền tảng có toàn quyền và không chỉnh sửa tại đây.', 'The platform administrator has all permissions and is not edited here.')}</p></article>
  return <>{confirmationDialog}<article className="role-card"><div className="record-summary"><strong>{role}</strong><span>{permissions.length} permissions</span></div><div className="permission-grid">{catalogue.map(permission => <label key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={event => setPermissions(event.target.checked ? [...permissions, permission] : permissions.filter(value => value !== permission))}/><span>{permission}</span></label>)}</div><button disabled={mutation.isPending || JSON.stringify([...permissions].sort()) === JSON.stringify([...initial].sort())} onClick={() => confirm({ title: bi(`Lưu quyền cho ${role}?`, `Save permissions for ${role}?`), description: bi('Thay đổi này tác động tới mọi người dùng đang có vai trò này.', 'This change affects every user with this role.'), confirmLabel: bi('Lưu quyền', 'Save permissions'), tone: 'warning' }, () => mutation.mutate())}>{bi('Lưu quyền', 'Save permissions')}</button><Notice mutation={mutation}/></article></>
}

function UsersWorkbench() {
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => platformClient.v1AdminUsers() })
  const review = useQuery({ queryKey: ['admin-access-review'], queryFn: () => platformClient.v1AdminAccessReview() })
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => platformClient.v1AdminRoles() })
  const tenants = useQuery({ queryKey: ['admin-tenants'], queryFn: () => platformClient.v1AdminTenants() })
  const [tab, setTab] = useState<'accounts' | 'review' | 'roles'>('accounts')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'operator', tenant_id: '' })
  const create = useMutation({ mutationFn: () => platformClient.v1AdminCreateUser({ ...form, tenant_id: form.tenant_id || null }), onSuccess: () => { setForm({ email: '', password: '', full_name: '', role: 'operator', tenant_id: '' }); void qc.invalidateQueries({ queryKey: ['admin-users'] }); void qc.invalidateQueries({ queryKey: ['admin-access-review'] }) } })
  const items = (users.data?.users ?? []).filter(item => !search || `${text(item.full_name)} ${text(item.email)} ${text(item.role)} ${text(item.tenant_id)}`.toLowerCase().includes(search.toLowerCase()))
  const roleData = roles.data as JsonRecord | undefined
  const roleMap = (roleData?.roles && typeof roleData.roles === 'object' ? roleData.roles : {}) as JsonRecord
  const catalogue = Array.isArray(roleData?.permission_catalogue) ? roleData.permission_catalogue.map(String) : []
  return <>
    <WorkflowHeader title={t('users')} subtitle={bi('Tách biệt tạo tài khoản, thay đổi vai trò, trạng thái và rà soát quyền.', 'Separate account creation, role changes, account state and access review.')} busy={users.isFetching || review.isFetching || roles.isFetching} refresh={() => { void users.refetch(); void review.refetch(); void roles.refetch(); void tenants.refetch() }}/>
    <section className="mini-metrics"><article><span>{bi('Tài khoản', 'Accounts')}</span><strong>{users.data?.users.length ?? 0}</strong></article><article><span>{bi('Không hoạt động', 'Flagged inactive')}</span><strong>{text(review.data?.summary.flagged, '0')}</strong></article><article><span>{bi('Admin hoạt động', 'Active admins')}</span><strong>{text(review.data?.summary.admins, '0')}</strong></article></section>
    <div className="filter-tabs page-tabs"><button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>{bi('Tài khoản', 'Accounts')}</button><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>{t('accessReview')}</button><button className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>{t('rolePermissions')}</button></div>
    {tab === 'accounts' && <><section className="surface control-form"><h2>{t('createUser')}</h2><form onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate() }}><div className="form-grid"><label><span>{t('fullName')}</span><input required value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })}/></label><label><span>{t('email')}</span><input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label><label><span>{t('temporaryPassword')}</span><input required minLength={10} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label><label><span>{t('role')}</span><select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="operator">operator</option><option value="owner">owner</option><option value="caregiver">caregiver</option><option value="admin">admin</option></select></label><label><span>{t('tenants')}</span><select value={form.tenant_id} onChange={event => setForm({ ...form, tenant_id: event.target.value })}><option value="">Platform</option>{(tenants.data?.tenants ?? []).map(item => <option key={text(item.tenant_id)} value={text(item.tenant_id)}>{text(item.name)}</option>)}</select></label></div><button disabled={create.isPending}>{t('createUser')}</button></form><Notice mutation={create}/></section><section className="surface platform-surface"><label className="platform-search"><span>{t('search')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={bi('Tên, email, vai trò, tổ chức…', 'Name, email, role, tenant…')}/></label><LocalState loading={users.isLoading} error={users.isError} empty={!items.length}/><div className="record-stack">{items.map(item => <UserAccessRow key={text(item.user_id)} item={item}/>)}</div></section></>}
    {tab === 'review' && <section className="surface platform-surface"><div className="backend-note">{bi('Tài khoản có đặc quyền hoặc không đăng nhập trong thời gian rà soát được gắn cờ.', 'Privileged or inactive accounts are flagged for review.')}</div><LocalState loading={review.isLoading} error={review.isError} empty={!review.data?.users.length}/><div className="record-stack">{(review.data?.users ?? []).map(item => <article className="record-card" key={text(item.user_id)}><div className="record-summary"><div><strong>{text(item.full_name, text(item.email))}</strong><small>{text(item.last_login_at, bi('Chưa từng đăng nhập', 'Never signed in'))}</small></div>{strings(item.flags).length ? strings(item.flags).map(flag => <Pill key={flag} value={flag}/>) : <Pill value="OK"/>}</div></article>)}</div></section>}
    {tab === 'roles' && <section className="role-grid">{Object.entries(roleMap).map(([role, permissions]) => <RoleEditor key={role} role={role} initial={Array.isArray(permissions) ? permissions.map(String) : []} catalogue={catalogue}/>)}</section>}
  </>
}

function VehiclesWorkbench() {
  const { t, bi } = useLocale()
  const query = useQuery({ queryKey: ['admin-vehicles'], queryFn: () => platformClient.v1AdminVehicles(), refetchInterval: 10_000 })
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const items = (query.data?.items ?? []).filter(item => !search || `${text(item.name)} ${text(item.vehicle_id)} ${text(item.plate)} ${text(item.owner_id)} ${text(item.tenant_id)}`.toLowerCase().includes(search.toLowerCase()))
  const selected = (query.data?.items ?? []).find(item => text(item.vehicle_id) === selectedId) || items[0]
  const pairing = useMutation({ mutationFn: () => platformClient.v1IssuePairingCode(text(selected?.vehicle_id)) })
  const telemetry = useMutation({ mutationFn: () => platformClient.v1Telemetry(text(selected?.vehicle_id), 30) })
  const incidents = useMutation({ mutationFn: () => platformClient.v1Incidents(text(selected?.vehicle_id)) })
  return <>
    <WorkflowHeader title={t('vehicles')} subtitle={bi('Theo dõi toàn đội xe và đi sâu vào phạm vi từng phương tiện.', 'Monitor the fleet and drill into each vehicle scope.')} busy={query.isFetching} refresh={() => void query.refetch()}/>
    <section className="surface workflow-toolbar"><label className="platform-search"><span>{t('search')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={bi('Tên xe, biển số, owner, tenant…', 'Vehicle, plate, owner, tenant…')}/></label></section>
    <LocalState loading={query.isLoading} error={query.isError} empty={!items.length}/>
    {!!items.length && <section className="workbench-grid fleet-workbench"><div className="surface queue-panel">{items.map(item => { const id = text(item.vehicle_id); return <button className={`queue-row ${text(selected?.vehicle_id) === id ? 'is-selected' : ''}`} key={id} onClick={() => { setSelectedId(id); pairing.reset(); telemetry.reset(); incidents.reset() }}><div><strong>{text(item.name, id)}</strong><small>{id} · {text(item.plate)}</small></div><div><Pill value={item.online ? 'ONLINE' : 'OFFLINE'}/><Pill value={item.risk_level}/></div></button>})}</div>{selected && <article className="surface incident-workspace"><div className="record-summary"><div><span className="section-kicker">{text(selected.vehicle_id)}</span><h2>{text(selected.name)}</h2><small>{text(selected.plate)} · {text(selected.model)}</small></div><Pill value={selected.online ? 'ONLINE' : 'OFFLINE'}/><Pill value={selected.risk_level}/></div><dl className="workflow-facts"><div><dt>{bi('Chủ xe', 'Owner')}</dt><dd>{text(selected.owner_id)}</dd></div><div><dt>{t('tenants')}</dt><dd>{text(selected.tenant_id, 'Platform')}</dd></div><div><dt>{bi('Sự cố hiện tại', 'Active incident')}</dt><dd>{text(selected.active_incident)}</dd></div><div><dt>{t('status')}</dt><dd>{text(selected.status)}</dd></div></dl><div className="workflow-section"><h3>{t('actions')}</h3><div className="inline-actions"><button onClick={() => pairing.mutate()} disabled={pairing.isPending}>{t('issuePairingCode')}</button><button onClick={() => telemetry.mutate()} disabled={telemetry.isPending}>{t('telemetry')}</button><button onClick={() => incidents.mutate()} disabled={incidents.isPending}>{t('incidents')}</button></div></div>{pairing.data && <div className="result-panel"><strong>{bi('Mã ghép nối một lần', 'One-time pairing code')}</strong><code>{text(pairing.data.pairing_code, text(pairing.data.code))}</code><small>{bi('Chỉ chia sẻ mã này với thiết bị đang được lắp vào đúng xe.', 'Only share this code with the device being installed in this vehicle.')}</small></div>}{telemetry.data && <pre className="action-json">{JSON.stringify(telemetry.data, null, 2)}</pre>}{incidents.data && <pre className="action-json">{JSON.stringify(incidents.data, null, 2)}</pre>}<Notice mutation={pairing}/><Notice mutation={telemetry}/><Notice mutation={incidents}/></article>}</section>}
  </>
}

function DeviceRow({ item }: { item: JsonRecord }) {
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const [firmware, setFirmware] = useState(text(item.target_firmware, text(item.firmware, '')))
  const { confirm, confirmationDialog } = useConfirmAction()
  const update = useMutation({ mutationFn: () => platformClient.v1AdminSetFirmware(text(item.device_id), firmware || null), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-devices'] }) })
  const revoke = useMutation({ mutationFn: () => platformClient.v1AdminRevokeDevice(text(item.device_id)), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-devices'] }) })
  const heartbeats = useMutation({ mutationFn: () => platformClient.v1AdminDeviceHeartbeats(text(item.device_id)) })
  return <>{confirmationDialog}<article className="record-card action-card"><div className="record-summary"><div><strong>{text(item.serial, text(item.device_id))}</strong><small>{text(item.vehicle_id)} · firmware {text(item.firmware)}</small></div><Pill value={item.online ? 'ONLINE' : item.status}/></div><dl className="workflow-facts"><div><dt>{bi('Heartbeat cuối', 'Last heartbeat')}</dt><dd>{text((item.last_heartbeat as JsonRecord | undefined)?.received_at, text(item.last_seen))}</dd></div><div><dt>{bi('Firmware mục tiêu', 'Target firmware')}</dt><dd>{text(item.target_firmware)}</dd></div></dl><div className="inline-actions"><input value={firmware} onChange={event => setFirmware(event.target.value)} placeholder={bi('Firmware mục tiêu', 'Target firmware')}/><button disabled={update.isPending || firmware === item.target_firmware} onClick={() => update.mutate()}>{t('setFirmware')}</button><button disabled={heartbeats.isPending} onClick={() => heartbeats.mutate()}>{t('loadHeartbeats')}</button><button className="danger-button" disabled={revoke.isPending || item.status === 'revoked'} onClick={() => confirm({ title: bi('Thu hồi thiết bị?', 'Revoke device?'), description: bi(`Thiết bị ${text(item.serial, text(item.device_id))} sẽ không thể gửi heartbeat hoặc nhận lệnh.`, `${text(item.serial, text(item.device_id))} will no longer send heartbeats or receive commands.`), confirmLabel: t('revokeDevice'), tone: 'danger' }, () => revoke.mutate())}>{t('revokeDevice')}</button></div>{heartbeats.data && <pre className="action-json">{JSON.stringify(heartbeats.data, null, 2)}</pre>}<Notice mutation={update}/><Notice mutation={revoke}/></article></>
}

function DevicesWorkbench() {
  const { t, bi } = useLocale()
  const query = useQuery({ queryKey: ['admin-devices'], queryFn: () => platformClient.v1AdminDevices(), refetchInterval: 10_000 })
  const [filter, setFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'REVOKED'>('ALL')
  const items = (query.data?.devices ?? []).filter(item => filter === 'ALL' || (filter === 'ONLINE' && item.online === true) || (filter === 'OFFLINE' && item.online !== true && item.status !== 'revoked') || (filter === 'REVOKED' && item.status === 'revoked'))
  return <>
    <WorkflowHeader title={t('devices')} subtitle={bi('Theo dõi kết nối, heartbeat, firmware và thu hồi credential thiết bị.', 'Monitor connectivity, heartbeat, firmware and device credential revocation.')} busy={query.isFetching} refresh={() => void query.refetch()}/>
    {query.data && <section className="mini-metrics"><article><span>{bi('Tổng thiết bị', 'Total')}</span><strong>{text(query.data.summary.total, '0')}</strong></article><article><span>{bi('Online', 'Online')}</span><strong>{text(query.data.summary.online, '0')}</strong></article><article><span>{bi('Chờ cập nhật', 'Update pending')}</span><strong>{text(query.data.summary.update_pending, '0')}</strong></article></section>}
    <section className="surface platform-surface"><div className="filter-tabs">{(['ALL','ONLINE','OFFLINE','REVOKED'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'ALL' ? t('all') : value}</button>)}</div><LocalState loading={query.isLoading} error={query.isError} empty={!items.length}/><div className="record-stack">{items.map(item => <DeviceRow key={text(item.device_id)} item={item}/>)}</div></section>
  </>
}

function ModelsWorkbench() {
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['admin-models'], queryFn: () => platformClient.v1AdminModels() })
  const vision = useQuery({ queryKey: ['admin-vision'], queryFn: () => platformClient.v1AdminVision() })
  const [form, setForm] = useState({ name: '', version: '', sha256: '', note: '' })
  const register = useMutation({ mutationFn: () => platformClient.v1AdminRegisterModel({ ...form, sha256: form.sha256 || null, note: form.note || null }), onSuccess: () => { setForm({ name: '', version: '', sha256: '', note: '' }); void qc.invalidateQueries({ queryKey: ['admin-models'] }) } })
  return <>
    <WorkflowHeader title={t('models')} subtitle={bi('Đăng ký artifact, rollout theo giai đoạn và rollback có kiểm soát.', 'Register artifacts, run staged rollouts and perform controlled rollback.')} busy={query.isFetching || vision.isFetching} refresh={() => { void query.refetch(); void vision.refetch() }}/>
    <section className="platform-grid"><article className="surface platform-surface"><form className="control-form" onSubmit={event => { event.preventDefault(); register.mutate() }}><h2>{bi('Đăng ký model', 'Register model')}</h2><div className="form-grid"><label><span>{bi('Tên model', 'Model name')}</span><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label><span>{bi('Phiên bản', 'Version')}</span><input required value={form.version} onChange={event => setForm({ ...form, version: event.target.value })}/></label><label className="wide-field"><span>SHA-256</span><input pattern="[0-9a-fA-F]{64}" value={form.sha256} onChange={event => setForm({ ...form, sha256: event.target.value })}/></label><label className="wide-field"><span>{bi('Ghi chú phát hành', 'Release note')}</span><input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })}/></label></div><button disabled={register.isPending}>{bi('Đăng ký', 'Register')}</button><Notice mutation={register}/></form><h2>{bi('Danh mục model', 'Model registry')}</h2><LocalState loading={query.isLoading} error={query.isError} empty={!query.data?.models.length}/><div className="record-stack">{(query.data?.models ?? []).map(item => <ModelDeploymentRow key={text(item.model_id)} item={item}/>)}</div></article><article className="surface platform-json"><h2>{bi('Runtime hiện tại', 'Runtime deployment')}</h2><pre>{JSON.stringify(vision.data ?? {}, null, 2)}</pre></article></section>
  </>
}

function ModelDeploymentRow({ item }: { item: JsonRecord }) {
  const { bi } = useLocale()
  const qc = useQueryClient()
  const [rollout, setRollout] = useState(Number(item.rollout_pct ?? 0))
  const { confirm, confirmationDialog } = useConfirmAction()
  const mutation = useMutation({ mutationFn: (action: 'rollout' | 'rollback') => action === 'rollout' ? platformClient.v1AdminRolloutModel(text(item.model_id), rollout) : platformClient.v1AdminRollbackModel(text(item.model_id)), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-models'] }); void qc.invalidateQueries({ queryKey: ['admin-vision'] }) } })
  const confirmRollout = () => confirm({ title: bi('Áp dụng rollout?', 'Apply rollout?'), description: bi(`Triển khai ${text(item.name)} ${text(item.version)} tới ${rollout}% thiết bị.`, `Deploy ${text(item.name)} ${text(item.version)} to ${rollout}% of devices.`), confirmLabel: bi('Áp dụng rollout', 'Apply rollout'), tone: 'warning' }, () => mutation.mutate('rollout'))
  return <>{confirmationDialog}<article className="record-card action-card"><div className="record-summary"><div><strong>{text(item.name)} · {text(item.version)}</strong><small>{text(item.model_id)} · SHA {text(item.sha256)}</small></div><Pill value={item.status}/></div><p>{text(item.note, bi('Không có ghi chú phát hành', 'No release note'))}</p><div className="rollout-control"><label><span>{bi('Phần trăm rollout', 'Rollout percentage')}</span><input type="range" min="0" max="100" step="5" value={rollout} onChange={event => setRollout(Number(event.target.value))}/><strong>{rollout}%</strong></label><div className="inline-actions"><button disabled={mutation.isPending} onClick={confirmRollout}>{bi('Áp dụng rollout', 'Apply rollout')}</button><button className="danger-button" disabled={mutation.isPending} onClick={() => confirm({ title: bi('Rollback model?', 'Roll back model?'), description: bi('Runtime sẽ quay về phiên bản hoạt động trước sau khi backend xác nhận.', 'Runtime will return to the previous active model after backend confirmation.'), confirmLabel: 'Rollback', tone: 'danger' }, () => mutation.mutate('rollback'))}>{bi('Rollback', 'Rollback')}</button></div></div><Notice mutation={mutation}/></article></>
}

function RulesWorkbench() {
  const { t, bi } = useLocale()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['admin-rulesets'], queryFn: () => platformClient.v1AdminRulesets() })
  const [version, setVersion] = useState('')
  const [note, setNote] = useState('')
  const [params, setParams] = useState('{\n  "temperature_warning_c": 35\n}')
  const create = useMutation({ mutationFn: () => platformClient.v1AdminCreateRuleset({ version, note: note || null, params: JSON.parse(params) as JsonRecord }), onSuccess: () => { setVersion(''); setNote(''); void qc.invalidateQueries({ queryKey: ['admin-rulesets'] }) } })
  return <>
    <WorkflowHeader title={t('rules')} subtitle={bi('Version hóa tham số an toàn và kích hoạt có xác nhận.', 'Version safety parameters and activate them with explicit confirmation.')} busy={query.isFetching} refresh={() => void query.refetch()}/>
    <div className="backend-note is-locked">{bi('Registry hiện có thể chỉ ghi nhận staged/audited; hãy kiểm tra applied_to_engine trước khi coi ruleset đang điều khiển runtime.', 'The registry may be staged/audited only; verify applied_to_engine before treating a ruleset as runtime-active.')}</div>
    <section className="surface platform-surface"><form className="control-form" onSubmit={event => { event.preventDefault(); create.mutate() }}><h2>{bi('Tạo phiên bản quy tắc', 'Create ruleset version')}</h2><div className="form-grid"><label><span>{bi('Phiên bản', 'Version')}</span><input required pattern="[A-Za-z0-9._-]{3,64}" value={version} onChange={event => setVersion(event.target.value)}/></label><label><span>{bi('Ghi chú phát hành', 'Release note')}</span><input value={note} onChange={event => setNote(event.target.value)}/></label><label className="wide-field"><span>{bi('Tham số dạng JSON', 'JSON parameters')}</span><textarea required rows={7} value={params} onChange={event => setParams(event.target.value)}/></label></div><button disabled={create.isPending}>{bi('Tạo bản staged', 'Create staged version')}</button><Notice mutation={create}/></form><LocalState loading={query.isLoading} error={query.isError} empty={!query.data?.rulesets.length}/><div className="record-stack">{(query.data?.rulesets ?? []).map(item => <RulesetRow key={text(item.version)} item={item}/>)}</div></section>
  </>
}

function RulesetRow({ item }: { item: JsonRecord }) {
  const { bi } = useLocale()
  const qc = useQueryClient()
  const { confirm, confirmationDialog } = useConfirmAction()
  const mutation = useMutation({ mutationFn: () => platformClient.v1AdminActivateRuleset(text(item.version)), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-rulesets'] }) })
  return <>{confirmationDialog}<article className="record-card action-card"><div className="record-summary"><div><strong>{text(item.version)}</strong><small>{bi('Tạo bởi', 'Created by')} {text(item.created_by)}</small></div><Pill value={item.status}/></div><p>{text(item.note, bi('Không có ghi chú', 'No release note'))}</p><pre className="action-json">{JSON.stringify(item.params ?? {}, null, 2)}</pre><div className="inline-actions"><button disabled={mutation.isPending || item.status === 'active'} onClick={() => confirm({ title: bi('Kích hoạt ruleset?', 'Activate ruleset?'), description: bi(`Phiên bản ${text(item.version)} có thể thay đổi quyết định an toàn của engine.`, `${text(item.version)} can change engine safety decisions.`), confirmLabel: bi('Kích hoạt phiên bản', 'Activate version'), tone: 'danger' }, () => mutation.mutate())}>{bi('Kích hoạt phiên bản', 'Activate version')}</button><Pill value={item.applied_to_engine === true ? 'APPLIED TO ENGINE' : 'REGISTRY ONLY'}/></div><Notice mutation={mutation}/></article></>
}

function AuditWorkbench() {
  const { t, bi } = useLocale()
  const query = useQuery({ queryKey: ['admin-audit'], queryFn: () => platformClient.v1AdminAudit(), refetchInterval: 15_000 })
  const [search, setSearch] = useState('')
  const [outcome, setOutcome] = useState('ALL')
  const [selectedId, setSelectedId] = useState('')
  const items = useMemo(() => (query.data?.entries ?? []).filter(item => (outcome === 'ALL' || text(item.outcome).toUpperCase() === outcome) && (!search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase()))), [outcome, query.data, search])
  const selected = items.find(item => text(item.id) === selectedId)
  return <>
    <WorkflowHeader title={t('audit')} subtitle={bi('Tra cứu actor, hành động, kết quả và correlation ID.', 'Investigate actor, action, outcome and correlation history.')} busy={query.isFetching} refresh={() => void query.refetch()}/>
    <section className="surface workflow-toolbar"><div className="filter-tabs">{['ALL','success','denied','failed'].map(value => { const labels: Record<string, string> = { success: bi('thành công', 'success'), denied: bi('bị từ chối', 'denied'), failed: bi('thất bại', 'failed') }; return <button key={value} className={outcome === value.toUpperCase() ? 'active' : ''} onClick={() => setOutcome(value.toUpperCase())}>{value === 'ALL' ? t('all') : labels[value]}</button>})}</div><label className="platform-search"><span>{t('search')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={bi('Tác nhân, hành động, đối tượng, correlation ID…', 'Actor, action, target, correlation ID…')}/></label></section>
    <section className={selected ? 'audit-workbench' : ''}><article className="surface platform-surface"><LocalState loading={query.isLoading} error={query.isError} empty={!items.length}/><div className="audit-list">{items.map((item, index) => <button className="audit-row-button" key={text(item.id, String(index))} onClick={() => setSelectedId(text(item.id))}><div><strong>{text(item.action)}</strong><small>{text(item.ts)}</small></div><div><span>{bi('Tác nhân', 'Actor')}</span><b>{text(item.actor)}</b></div><div><span>{bi('Đối tượng', 'Target')}</span><b>{text(item.target)}</b></div><Pill value={item.outcome}/><code>{text(item.correlation_id)}</code></button>)}</div></article>{selected && <aside className="surface audit-detail"><div className="record-summary"><h2>{bi('Chi tiết audit', 'Audit detail')}</h2><button className="secondary-button" aria-label={bi('Đóng chi tiết', 'Close detail')} onClick={() => setSelectedId('')}>×</button></div><pre>{JSON.stringify(selected, null, 2)}</pre></aside>}</section>
  </>
}

function SystemWorkbench() {
  const { t, bi } = useLocale()
  const query = useQuery({ queryKey: ['admin-system'], queryFn: () => platformClient.v1AdminSystem(), refetchInterval: 15_000 })
  const vision = useQuery({ queryKey: ['admin-system-vision'], queryFn: () => platformClient.v1AdminVision(), refetchInterval: 30_000 })
  const dependencies = query.data?.dependencies && typeof query.data.dependencies === 'object' ? query.data.dependencies as JsonRecord : {}
  const alerts = list(query.data?.alerts)
  return <>
    <WorkflowHeader title={t('system')} subtitle={bi('Trạng thái dependency, cảnh báo, metrics và AI runtime.', 'Dependency status, alerts, metrics and AI runtime.')} busy={query.isFetching || vision.isFetching} refresh={() => { void query.refetch(); void vision.refetch() }}/>
    <LocalState loading={query.isLoading} error={query.isError}/><section className="platform-grid"><article className="surface platform-surface"><h2>{bi('Thành phần phụ thuộc', 'Dependencies')}</h2><div className="dependency-grid">{Object.entries(dependencies).map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><Pill value={value}/></div>)}</div><h2>{bi('Cảnh báo hoạt động', 'Active alerts')}</h2>{alerts.length ? alerts.map((item, index) => <div className="system-alert" key={index}><Pill value={item.severity}/><div><strong>{text(item.code)}</strong><span>{text(item.message)}</span></div></div>) : <div className="platform-state"><strong>{bi('Không có cảnh báo backend', 'No active backend alerts')}</strong></div>}</article><article className="surface platform-json"><h2>{bi('Chỉ số runtime', 'Runtime metrics')}</h2><pre>{JSON.stringify(query.data?.metrics ?? {}, null, 2)}</pre><h2>{bi('Mô hình thị giác đang nạp', 'Loaded vision')}</h2><pre>{JSON.stringify(vision.data ?? {}, null, 2)}</pre></article></section>
  </>
}
export function PlatformPage({ name }: { name: PageName }) {
  if (name === 'incidents') return <IncidentWorkbench/>
  if (name === 'commands') return <CommandWorkbench/>
  if (name === 'vehicles') return <VehiclesWorkbench/>
  if (name === 'devices') return <DevicesWorkbench/>
  if (name === 'tenants') return <TenantsWorkbench/>
  if (name === 'users') return <UsersWorkbench/>
  if (name === 'models') return <ModelsWorkbench/>
  if (name === 'rules') return <RulesWorkbench/>
  if (name === 'audit') return <AuditWorkbench/>
  return <SystemWorkbench/>
}
