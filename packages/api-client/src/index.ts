import type { ApiErrorEnvelope, Incident, Page, RealtimeEvent, User, V1CabinState, V1Health, Vehicle, VehicleStatus } from '@cabinsentinel/contracts'
import { acceptNewerRevision } from '@cabinsentinel/domain'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'REQUEST_FAILED',
    readonly correlationId?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions {
  baseUrl: string
  timeoutMs?: number
  getAccessToken?: () => Promise<string | undefined>
  fetch?: typeof globalThis.fetch
  credentials?: RequestCredentials
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
  idempotencyKey?: string
  retry?: boolean
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function readError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorEnvelope> & { detail?: unknown } = {}
  try { body = await response.json() as typeof body } catch { /* non-JSON upstream */ }
  const detail = typeof body.detail === 'string' ? body.detail : undefined
  return new ApiError(body.message ?? detail ?? `Request failed (${response.status})`, response.status, body.code, body.correlationId, body.details ?? body.detail)
}

export class CabinSentinelClient {
  private readonly fetcher: typeof globalThis.fetch
  private readonly timeoutMs: number

  constructor(private readonly options: ApiClientOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), options.timeoutMs ?? this.timeoutMs)
    const forwardAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', forwardAbort, { once: true })
    try {
      const token = await this.options.getAccessToken?.()
      const headers = new Headers(options.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
      if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      const init: RequestInit = { ...options, headers, signal: controller.signal, credentials: this.options.credentials ?? 'include' }
      const maxAttempts = options.retry !== false && (!options.method || options.method === 'GET') ? 2 : 1
      let response: Response | undefined
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        response = await this.fetcher(joinUrl(this.options.baseUrl, path), init)
        if (response.status < 500 || attempt === maxAttempts - 1) break
      }
      if (!response?.ok) throw await readError(response as Response)
      if (response.status === 204) return undefined as T
      return await response.json() as T
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', forwardAbort)
    }
  }

  me(signal?: AbortSignal) { return this.request<User>('/api/v2/me', { signal }) }
  vehicles(signal?: AbortSignal) { return this.request<Page<Vehicle>>('/api/v2/vehicles', { signal }) }
  vehicleStatus(vehicleId: string, signal?: AbortSignal) { return this.request<VehicleStatus>(`/api/v2/vehicles/${encodeURIComponent(vehicleId)}/status`, { signal }) }
  vehicleIncidents(vehicleId: string, signal?: AbortSignal) { return this.request<Page<Incident>>(`/api/v2/vehicles/${encodeURIComponent(vehicleId)}/incidents`, { signal }) }
  incident(incidentId: string, signal?: AbortSignal) { return this.request<Incident>(`/api/v2/incidents/${encodeURIComponent(incidentId)}`, { signal }) }
  acknowledgeIncident(incidentId: string, revision: number, reason: string, idempotencyKey: string) {
    return this.request<Incident>(`/api/v2/incidents/${encodeURIComponent(incidentId)}/acknowledgements`, {
      method: 'POST', idempotencyKey, retry: false, body: JSON.stringify({ expected_revision: revision, reason }),
    })
  }
  operationsIncidents(signal?: AbortSignal) { return this.request<Page<Incident>>('/api/v2/operations/incidents', { signal }) }

  /** Confirmed endpoints from the repository's current V1 FastAPI service. */
  v1State(vehicleId: string, signal?: AbortSignal) {
    return this.request<V1CabinState>(`/api/v1/state/${encodeURIComponent(vehicleId)}`, { signal, credentials: 'omit' })
  }
  v1Events(vehicleId: string, limit = 50, signal?: AbortSignal) {
    return this.request<V1CabinState[]>(`/api/v1/events/${encodeURIComponent(vehicleId)}?limit=${Math.max(1, Math.min(limit, 100))}`, { signal, credentials: 'omit' })
  }
  health(signal?: AbortSignal) {
    return this.request<V1Health>('/health', { signal, credentials: 'omit' })
  }
}

export interface RevisionCache<T> { revision?: number; value?: T }

export function applyRevisionedEvent<T>(cache: RevisionCache<T>, event: RealtimeEvent<T>): RevisionCache<T> {
  return acceptNewerRevision(cache.revision, event.revision) ? { revision: event.revision, value: event.data } : cache
}

export interface RealtimeConnection {
  close(): void
}

export function subscribeToEvents<T>(
  url: string,
  onEvent: (event: RealtimeEvent<T>) => void,
  onConnection: (state: 'connected' | 'degraded') => void,
  eventSourceFactory: (url: string, init?: EventSourceInit) => EventSource = (value, init) => new EventSource(value, init),
): RealtimeConnection {
  const source = eventSourceFactory(url, { withCredentials: true })
  source.onopen = () => onConnection('connected')
  source.onerror = () => onConnection('degraded')
  source.onmessage = (message) => {
    try { onEvent(JSON.parse(message.data) as RealtimeEvent<T>) } catch { /* invalid events cannot alter cached safety state */ }
  }
  return { close: () => source.close() }
}
