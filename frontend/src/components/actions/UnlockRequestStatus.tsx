import type { UnlockRequest } from '../../types/agent'

export function UnlockRequestStatus({ request }: { request?: UnlockRequest }) {
  if (!request) return null
  return <section className="resolution-form" aria-label="Current unlock request lifecycle">
    <strong>Current unlock request: {request.status}</strong>
    <p>Request {request.requestId} · incident {request.incidentId ?? 'unknown'} · expires {request.expiresAt ?? 'unknown'}.</p>
    <p>Action ledger rows describe earlier recorded results. This read-only request does not unlock a vehicle; no unlock confirmation endpoint is available.</p>
  </section>
}
