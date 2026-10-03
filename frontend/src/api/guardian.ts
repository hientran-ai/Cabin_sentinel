import { ApiRequestError, request } from './client'
import type { RiskState } from '../types/agent'

export type ChildStatus = 'INSIDE' | 'EXITED' | 'UNKNOWN'
export interface ChildStatusResponse {
  trip_id: string; vehicle_id: string; vehicle_name: string; label: string
  child_status: ChildStatus; last_event: 'entered_vehicle' | 'exited_vehicle' | null; timestamp: string | null
  source: string | null; confidence: null; identity_verified: false; event_count: number
  vehicle_safety: { risk_level: RiskState; decision_current: boolean; occupancy_state: string; evaluated_at: string } | null
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }

/** Guardian token is passed in memory by the caller; it is never placed in the URL. */
export async function getChildStatus(tripId: string, guardianToken: string): Promise<ChildStatusResponse> {
  const payload = await request<unknown>(`/api/v1/guardian/trips/${encodeURIComponent(tripId)}/child-status`,
    { headers: { Authorization: `Bearer ${guardianToken}` } })
  if (!record(payload) || payload.trip_id !== tripId || !['INSIDE', 'EXITED', 'UNKNOWN'].includes(String(payload.child_status)) ||
    payload.identity_verified !== false || typeof payload.vehicle_id !== 'string') {
    throw new ApiRequestError('Invalid backend response — child status unavailable.')
  }
  return payload as unknown as ChildStatusResponse
}
