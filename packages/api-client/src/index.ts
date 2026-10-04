import type { ApiErrorEnvelope, Incident, Page, RealtimeEvent, User, V1CabinState, V1DemoLoginResponse, V1DemoRole, V1FleetVehicleState, V1Health, V1Me, V1SessionResponse, V1VehicleEvents, V1VehicleList, Vehicle, VehicleStatus } from '@cabinsentinel/contracts'
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
  auth?: boolean
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
    const { timeoutMs, idempotencyKey, retry, auth = true, ...requestOptions } = options
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs ?? this.timeoutMs)
    const forwardAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', forwardAbort, { once: true })
    try {
      const token = auth ? await this.options.getAccessToken?.() : undefined
      const headers = new Headers(options.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
      if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      const init: RequestInit = { ...requestOptions, headers, signal: controller.signal, credentials: options.credentials ?? this.options.credentials ?? 'include' }
      const maxAttempts = retry !== false && (!options.method || options.method === 'GET') ? 2 : 1
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

  /** Development-only V1 authentication. The backend disables this endpoint in production. */
  v1DemoLogin(role: V1DemoRole, subject?: string, signal?: AbortSignal) {
    return this.request<V1DemoLoginResponse>('/api/v1/auth/demo-login', {
      method: 'POST', retry: false, signal,
      body: JSON.stringify({ role, ...(subject ? { subject } : {}) }),
    })
  }
  v1Me(signal?: AbortSignal) { return this.request<V1Me>('/api/v1/auth/me', { signal }) }
  v1PlatformLogin(email: string, password: string, signal?: AbortSignal) {
    return this.request<V1SessionResponse>('/api/v1/auth/login', {
      method: 'POST', retry: false, auth: false, signal,
      body: JSON.stringify({ email, password, use_cookie: true }),
    })
  }
  v1PlatformRefresh(csrfToken: string, signal?: AbortSignal) {
    return this.request<V1SessionResponse>('/api/v1/auth/refresh', {
      method: 'POST', retry: false, auth: false, signal,
      headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify({}),
    })
  }
  v1PlatformLogout(csrfToken: string, signal?: AbortSignal) {
    return this.request<void>('/api/v1/auth/logout', {
      method: 'POST', retry: false, signal,
      headers: { 'X-CSRF-Token': csrfToken },
    })
  }
  v1Vehicles(signal?: AbortSignal) { return this.request<V1VehicleList>('/api/v1/vehicles', { signal }) }
  v1VehicleState(vehicleId: string, signal?: AbortSignal) {
    return this.request<V1FleetVehicleState>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/state`, { signal })
  }
  v1VehicleEvents(vehicleId: string, limit = 50, signal?: AbortSignal) {
    return this.request<V1VehicleEvents>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/events?limit=${Math.max(1, Math.min(limit, 500))}`, { signal })
  }

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
