import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CarFront, DoorClosed, KeyRound, LogOut, Radar, RefreshCw, Thermometer, UserCheck, UserX, Users } from 'lucide-react'
import { adaptBackendState } from '../api/adapter'
import { ApiRequestError } from '../api/client'
import { createTrip, demoLogin, displayRisk, getVehicleEvents, getVehicleState, listVehicles, recordTripEvent,
  type Access, type Role, type Trip, type VehicleEvent, type VehicleState, type VehicleSummary } from '../api/fleet'
import { ActionProgress } from '../components/actions/ActionProgress'
import { DisplayRiskBadge as Risk } from '../components/status/DisplayRiskBadge'

const LIST_MS = 2000
const DETAIL_MS = 1500
const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed'

export function FleetView() {
  const [role, setRole] = useState<Role>('owner')
  const [subject, setSubject] = useState('demo-owner')
  const [access, setAccess] = useState<Access>()
  const [loginPending, setLoginPending] = useState(false)
  const [loginError, setLoginError] = useState<string>()
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [listConnected, setListConnected] = useState(false)
  const [listError, setListError] = useState<string>()
  const [selected, setSelected] = useState<string>()
  const [trips, setTrips] = useState<Trip[]>([])

  useEffect(() => {
    if (!access) return
    let active = true
    let inflight = false
    const load = async () => {
      if (inflight) return
      inflight = true
      try {
        const list = await listVehicles(access)
        if (!active) return
        setVehicles(list); setListConnected(true); setListError(undefined)
        setSelected(current => current && list.some(v => v.vehicle_id === current) ? current : list[0]?.vehicle_id)
      } catch (error) {
        if (!active) return
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          // Tokens are process-memory on the backend: a restart invalidates them.
          setAccess(undefined); setVehicles([]); setSelected(undefined); setTrips([]); setListError(undefined)
          setLoginError('Session expired or backend restarted — please sign in again.')
          return
        }
        setListConnected(false); setListError(message(error))
      } finally { inflight = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), LIST_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [access])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (loginPending) return
    setLoginPending(true); setLoginError(undefined)
    try {
      const next = await demoLogin(role, role === 'owner' ? subject : undefined)
      setVehicles([]); setSelected(undefined); setTrips([]); setListConnected(false); setAccess(next)
    } catch (error) { setLoginError(message(error)) } finally { setLoginPending(false) }
  }
  const logout = () => { setAccess(undefined); setVehicles([]); setSelected(undefined); setTrips([]); setListError(undefined) }

  return <main className="content" id="fleet">
    <header className="topbar">
      <div><span className="eyebrow">Owner · Admin · Multi-vehicle</span><h1>Vehicles</h1></div>
      {access && <div className="connection-group"><span className={listConnected ? 'connected' : 'disconnected'}>{access.role} · {access.subject}</span>
        <button className="button secondary" onClick={logout}><LogOut aria-hidden="true" /> Sign out</button></div>}
    </header>
    {!access && <section className="panel fleet-login">
      <div className="panel-heading"><div><span className="eyebrow">Demo session</span><h2><KeyRound aria-hidden="true" /> Sign in</h2></div></div>
      <form onSubmit={login} className="fleet-login-form">
        <label className="select-label">Role<select aria-label="Role" value={role} onChange={e => setRole(e.target.value as Role)}>
          <option value="owner">Vehicle owner / parent</option><option value="admin">Fleet admin</option></select></label>
        {role === 'owner' && <label className="select-label">Owner account<select aria-label="Owner account" value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="demo-owner">demo-owner (2 vehicles)</option><option value="fleet-owner">fleet-owner (2 vehicles)</option></select></label>}
        <button className="button analyze-button" disabled={loginPending}>{loginPending ? 'Signing in…' : 'Sign in'}</button>
        {loginError && <p className="form-error" role="alert">{loginError}</p>}
        <p className="privacy-note">Development-only role login. The access token stays in memory and is never stored or put in a URL.</p>
      </form>
    </section>}
    {access && <>
      {listError && <div className="connection-alert stale" role="alert">Fleet API unavailable: {listError}. Vehicle risk shown as UNKNOWN.</div>}
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">{access.role === 'admin' ? 'All vehicles' : 'My vehicles'}</span><h2><Users aria-hidden="true" /> Fleet status</h2></div><span className="count-chip">{vehicles.length}</span></div>
        <div className="fleet-table" aria-label="Fleet status">
          <div className="fleet-row fleet-head" aria-hidden="true"><span>Vehicle</span><span>Status</span><span>Risk</span><span>Occupancy</span><span>Temp</span><span>Doors</span><span>Alerts</span><span>Incident</span></div>
          {vehicles.map(vehicle => <button key={vehicle.vehicle_id} aria-label={`Select ${vehicle.vehicle_id}`} aria-pressed={vehicle.vehicle_id === selected}
            className={`fleet-row ${vehicle.vehicle_id === selected ? 'selected' : ''}`} onClick={() => setSelected(vehicle.vehicle_id)}>
            <span><strong>{vehicle.vehicle_name}</strong><small>{vehicle.vehicle_id} · {vehicle.data_source}</small></span>
            <span className={vehicle.online && listConnected ? 'connected' : 'disconnected'}>{vehicle.online && listConnected ? 'online' : 'offline'}<small>{vehicle.last_seen ? new Date(vehicle.last_seen).toLocaleTimeString() : 'never seen'}</small></span>
            <span><Risk risk={displayRisk(vehicle.risk_level, vehicle.decision_current, listConnected)} /></span>
            <span>{vehicle.occupancy.state ?? 'UNKNOWN'}<small>{Object.entries(vehicle.occupancy.counts).map(([k, n]) => `${n} ${k}`).join(', ') || '—'}</small></span>
            <span>{vehicle.temperature_c == null ? '—' : `${vehicle.temperature_c.toFixed(1)}°C`}</span>
            <span>{vehicle.doors_locked == null ? 'UNKNOWN' : vehicle.doors_locked ? 'locked' : 'unlocked'}</span>
            <span>{vehicle.alert_count}</span>
            <span>{vehicle.active_incident ? 'OPEN' : '—'}</span>
          </button>)}
          {!vehicles.length && !listError && <p className="empty-state">Loading vehicles…</p>}
        </div>
      </section>
      {selected && <VehicleDetail key={selected} access={access} vehicleId={selected}
        trips={trips.filter(t => t.vehicle_id === selected)} onTrip={trip => setTrips(previous => [...previous, trip])} />}
    </>}
  </main>
}

function VehicleDetail({ access, vehicleId, trips, onTrip }: { access: Access; vehicleId: string; trips: Trip[]; onTrip: (trip: Trip) => void }) {
  const [state, setState] = useState<VehicleState>()
  const [events, setEvents] = useState<VehicleEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    // Keyed by vehicle: switching mounts a fresh detail, and `active` drops any
    // late response from the previous vehicle.
    let active = true
    let inflight = false
    const load = async () => {
      if (inflight) return
      inflight = true
      try {
        const [next, history] = await Promise.all([getVehicleState(access, vehicleId), getVehicleEvents(access, vehicleId)])
        if (!active || next.vehicle_id !== vehicleId) return
        setState(next); setEvents(history); setConnected(true); setError(undefined)
      } catch (failure) {
        if (active) { setConnected(false); setError(message(failure)) }
      } finally { inflight = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), DETAIL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [access, vehicleId])

  const risk = displayRisk(state?.risk?.risk_level, state?.risk?.decision_current === true, connected)
  const tools = state ? adaptBackendState({ action_results: state.actions as never }).toolResults : []
  return <section className="panel vehicle-detail" aria-label={`Vehicle ${vehicleId}`} data-vehicle-id={vehicleId}>
    <div className="panel-heading"><div><span className="eyebrow">Selected vehicle · {vehicleId}</span><h2><CarFront aria-hidden="true" /> {state?.vehicle_name ?? vehicleId}</h2></div>
      <span className="sim-chip">{state?.data_source === 'SIMULATED' ? 'Sensors & detections SIMULATED' : state?.data_source ?? '—'}</span></div>
    {error && <div className="connection-alert stale" role="alert">Vehicle state unavailable: {error}. Current decision unavailable.</div>}
    {!state && !error && <p className="empty-state">Loading vehicle state…</p>}
    {state && <>
      <div className={`hero-status compact state-${risk === 'UNKNOWN' ? 'error' : risk.toLowerCase()}`}>
        <div className="hero-status-copy"><span className="eyebrow">Backend-assigned risk</span><Risk risk={risk} />
          <h2 data-testid="vehicle-explanation">{connected ? state.explanation : 'Current decision unavailable — showing last received data as historical.'}</h2>
          <div className="rule-line"><span>Rule <strong>{state.risk?.rule_id ?? '—'}</strong></span><span>Revision {state.risk?.revision ?? 0}</span><span>Evaluated {state.timestamp ? new Date(state.timestamp).toLocaleTimeString() : 'never'}</span></div>
        </div>
      </div>
      <div className="sensor-grid">
        <Metric icon={<Thermometer />} label="Cabin temperature" value={state.sensors?.temperature_c == null ? 'UNKNOWN' : `${state.sensors.temperature_c.toFixed(1)}°C`} note={connected ? `sensor ${state.sensors?.status ?? 'UNKNOWN'}` : 'last received · not current'} />
        <Metric icon={<DoorClosed />} label="Doors" value={state.sensors?.door ?? 'UNKNOWN'} note={connected ? `ignition ${state.sensors?.ignition ?? 'unknown'}` : 'last received · not current'} />
        <Metric icon={<Radar />} label="Radar presence" value={state.sensors?.radar_presence == null ? 'UNKNOWN' : state.sensors.radar_presence ? 'present' : 'clear'} note={connected ? `occupancy ${state.risk?.occupancy_state ?? 'UNKNOWN'}` : 'last received · not current'} />
        <Metric icon={<Users />} label="Camera detections" value={String(state.vision?.detections.length ?? 0)} note={connected ? `camera ${state.vision?.camera_status ?? 'UNKNOWN'} · ${state.vision?.status ?? 'UNKNOWN'}` : 'last received · not current'} />
      </div>
      <div className="dashboard-grid">
        <div className="primary-column">
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Audit trail</span><h2>Event timeline</h2></div><span>Latest {events.length}</span></div>
            <ol className="timeline">{events.map(event => <li key={event.event_id}><strong>{event.event_type}</strong> <span>{describe(event)}</span>
              <small>{when(event)}</small></li>)}</ol>
            {!events.length && <p className="empty-state">No events recorded for this vehicle yet.</p>}
          </section>
          <p className="privacy-note">No cabin image is published for fleet vehicles. The privacy-safe camera preview exists only in a live camera session on the Owner dashboard.</p>
        </div>
        <aside className="secondary-column">
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Backend action results</span><h2>Response actions</h2></div></div>
            {tools.length ? <ActionProgress tools={tools} /> : <p className="empty-state">No actions in the latest evaluation.</p>}
            {state.unlock_request && <p className="unlock-note">Unlock request {state.unlock_request.status} — requires a human; this UI never unlocks.</p>}
            {state.incident && <p>Incident {state.incident.status} · opened {state.incident.opened_at ? new Date(state.incident.opened_at).toLocaleTimeString() : '—'}</p>}
          </section>
          <GuardianShare access={access} vehicleId={vehicleId} trips={trips} onTrip={onTrip} />
        </aside>
      </div>
    </>}
  </section>
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <article className="sensor-card"><span className="sensor-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><small>{note}</small></div></article>
}

function GuardianShare({ access, vehicleId, trips, onTrip }: { access: Access; vehicleId: string; trips: Trip[]; onTrip: (trip: Trip) => void }) {
  const [label, setLabel] = useState('School pickup')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string>()
  const busy = useRef(false)
  const run = async (task: () => Promise<string>) => {
    if (busy.current) return  // one logical request per click, even on double-click
    busy.current = true; setPending(true)
    try { setNotice(await task()) } catch (error) { setNotice(message(error)) } finally { busy.current = false; setPending(false) }
  }
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Family / pickup guardian</span><h2>Child check-in</h2></div></div>
    <form className="trip-form" onSubmit={e => { e.preventDefault(); void run(async () => { const trip = await createTrip(access, vehicleId, label); onTrip(trip); return `Trip ${trip.trip_id} created.` }) }}>
      <input aria-label="Trip label" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} />
      <button className="button secondary" disabled={pending}><RefreshCw aria-hidden="true" /> Create trip</button>
    </form>
    {trips.map(trip => <div className="trip-card" key={trip.trip_id}>
      <strong>{trip.label}</strong>
      <small>Trip ID <code>{trip.trip_id}</code></small>
      <small>Guardian token (share privately, shown only here) <code>{trip.guardian_token}</code></small>
      <div className="trip-actions">
        <button className="button secondary" disabled={pending} onClick={() => void run(async () => (await recordTripEvent(access, trip.trip_id, 'entered_vehicle', crypto.randomUUID())).result + ': entered vehicle')}><UserCheck aria-hidden="true" /> Child entered</button>
        <button className="button secondary" disabled={pending} onClick={() => void run(async () => (await recordTripEvent(access, trip.trip_id, 'exited_vehicle', crypto.randomUUID())).result + ': exited vehicle')}><UserX aria-hidden="true" /> Child exited</button>
      </div>
    </div>)}
    {notice && <p role="status">{notice}</p>}
    <p className="privacy-note">Entry/exit is a recorded check-in, not camera identity recognition.</p>
  </section>
}

function describe(event: VehicleEvent): string {
  if (event.event_type === 'evaluation') return `rev ${event.revision} · ${event.risk_level} · ${event.rule_id}`
  if (event.event_type === 'action_result' || event.event_type === 'action_intent' || event.event_type === 'action_attempt') return `${event.tool}${event.status ? ` · ${event.status}` : ''}`
  if (event.event_type === 'alert') return `stage ${event.stage}`
  if (event.event_type === 'trip_event') return event.event ?? ''
  if (event.event_type === 'unlock_request') return event.status ?? ''
  return ''
}

function when(event: VehicleEvent): string {
  const raw = event.evaluated_at ?? event.recorded_at ?? event.sent_at ?? event.attempted_at ?? event.created_at
  return raw ? new Date(raw).toLocaleTimeString() : ''
}
