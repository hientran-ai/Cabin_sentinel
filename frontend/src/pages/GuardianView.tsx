import { useEffect, useState, type FormEvent } from 'react'
import { Baby, LogOut, ShieldQuestion } from 'lucide-react'
import { displayRisk } from '../api/fleet'
import { getChildStatus, type ChildStatusResponse } from '../api/guardian'
import { DisplayRiskBadge as Risk } from '../components/status/DisplayRiskBadge'

const POLL_MS = 3000
const LABELS = {
  INSIDE: 'Child checked in — inside the vehicle',
  EXITED: 'Child checked out — exited the vehicle',
  UNKNOWN: 'Status unknown — no check-in recorded',
} as const

export function GuardianView() {
  const [tripId, setTripId] = useState('')
  const [token, setToken] = useState('')
  const [credentials, setCredentials] = useState<{ tripId: string; token: string }>()
  const [status, setStatus] = useState<ChildStatusResponse>()
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!credentials) return
    let active = true
    let inflight = false
    const load = async () => {
      if (inflight) return
      inflight = true
      try {
        const next = await getChildStatus(credentials.tripId, credentials.token)
        if (!active) return
        setStatus(next); setConnected(true); setError(undefined)
      } catch (failure) {
        if (active) { setConnected(false); setError(failure instanceof Error ? failure.message : 'Request failed') }
      } finally { inflight = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [credentials])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!tripId.trim() || !token.trim()) { setError('Enter the trip ID and guardian token shared by the vehicle owner.'); return }
    setStatus(undefined); setConnected(false); setError(undefined)
    setCredentials({ tripId: tripId.trim(), token: token.trim() })
  }
  const leave = () => { setCredentials(undefined); setStatus(undefined); setToken(''); setError(undefined) }
  // A failed refresh never keeps showing the previous status as current.
  const shown = connected && status ? status.child_status : 'UNKNOWN'

  return <main className="content" id="guardian">
    <header className="topbar"><div><span className="eyebrow">Family · Pickup guardian</span><h1>Child pickup status</h1></div>
      {credentials && <button className="button secondary" onClick={leave}><LogOut aria-hidden="true" /> Leave</button>}</header>
    {!credentials && <section className="panel fleet-login">
      <div className="panel-heading"><div><span className="eyebrow">Shared by the vehicle owner</span><h2><ShieldQuestion aria-hidden="true" /> Open a trip</h2></div></div>
      <form className="fleet-login-form" onSubmit={submit}>
        <label className="select-label">Trip ID<input aria-label="Trip ID" value={tripId} onChange={e => setTripId(e.target.value)} autoComplete="off" /></label>
        <label className="select-label">Guardian token<input aria-label="Guardian token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label>
        <button className="button analyze-button">Check status</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="privacy-note">The token stays in this tab's memory only.</p>
      </form>
    </section>}
    {credentials && <>
      {error && <div className="connection-alert stale" role="alert">Status unavailable: {error}. Showing UNKNOWN.</div>}
      <section className={`panel guardian-card child-${shown.toLowerCase()}`} aria-live="polite">
        <span className="eyebrow">{status ? `${status.vehicle_name} · ${status.label}` : 'Loading trip…'}</span>
        <h2><Baby aria-hidden="true" /> <span data-testid="child-status">{shown}</span></h2>
        <p>{LABELS[shown]}</p>
        {status && connected && status.timestamp && <p>Last event: {status.last_event === 'entered_vehicle' ? 'entered vehicle' : 'exited vehicle'} at {new Date(status.timestamp).toLocaleString()} · source {status.source}</p>}
        {status && !connected && <p>Last known (historical): {status.child_status}</p>}
        {status?.vehicle_safety && <p className="guardian-safety">Vehicle safety: <Risk risk={displayRisk(status.vehicle_safety.risk_level, status.vehicle_safety.decision_current, connected)} /></p>}
        <p className="privacy-note">Based on recorded entry/exit check-ins for this trip. The camera does not identify which child is in the vehicle (identity_verified: false, confidence: n/a).</p>
      </section>
    </>}
  </main>
}
