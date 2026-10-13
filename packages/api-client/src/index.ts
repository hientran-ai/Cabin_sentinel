import type { ApiErrorEnvelope, Incident, Page, RealtimeEvent, User, V1CabinState, V1DemoLoginResponse, V1DemoRole, V1CabinCalibration, V1CabinZone, V1DemoScenarioId, V1DemoStatus, V1VideoFrameResult, V1VideoStart, V1DeviceCommand, V1DeviceHeartbeat, V1DevicePairing, V1FleetVehicleState, V1Health, V1Me, V1SessionResponse, V1VehicleEvents, V1VehicleList, Vehicle, VehicleStatus } from '@cabinsentinel/contracts'
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

export type JsonRecord = Record<string, unknown>
export interface JsonPage<T extends JsonRecord = JsonRecord> { items: T[]; total: number; page: number; page_size: number }

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

  // Authenticated platform resources. These mirror the current FastAPI V1
  // control plane; richer generated types can replace JsonRecord once the
  // backend OpenAPI response models are committed.
  v1Profile(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/me/profile', { signal }) }
  v1UpdateProfile(payload: JsonRecord, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/me/profile', { method: 'PUT', retry: false, signal, body: JSON.stringify(payload) })
  }
  v1NotificationSettings(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/me/notification-settings', { signal }) }
  v1UpdateNotificationSettings(payload: JsonRecord, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/me/notification-settings', { method: 'PUT', retry: false, signal, body: JSON.stringify(payload) })
  }
  v1EmergencyContacts(signal?: AbortSignal) { return this.request<{ contacts: JsonRecord[] }>('/api/v1/me/emergency-contacts', { signal }) }
  v1CreateEmergencyContact(payload: JsonRecord, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/me/emergency-contacts', { method: 'POST', retry: false, signal, body: JSON.stringify(payload) })
  }
  v1DeleteEmergencyContact(contactId: string, signal?: AbortSignal) {
    return this.request<void>(`/api/v1/me/emergency-contacts/${encodeURIComponent(contactId)}`, { method: 'DELETE', retry: false, signal })
  }
  v1RequestContactVerification(contactId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/me/emergency-contacts/${encodeURIComponent(contactId)}/verification`, { method: 'POST', retry: false, signal })
  }
  v1ConfirmContactVerification(contactId: string, code: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/me/emergency-contacts/${encodeURIComponent(contactId)}/verification/confirm`, { method: 'POST', retry: false, signal, body: JSON.stringify({ code }) }) }
  v1Caregivers(signal?: AbortSignal) { return this.request<{ caregivers: JsonRecord[] }>('/api/v1/me/caregivers', { signal }) }
  v1CreateCaregiverInvite(payload: JsonRecord, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/me/caregivers/invites', { method: 'POST', retry: false, signal, body: JSON.stringify(payload) })
  }
  v1RevokeCaregiver(linkId: string, signal?: AbortSignal) {
    return this.request<void>(`/api/v1/me/caregivers/${encodeURIComponent(linkId)}`, { method: 'DELETE', retry: false, signal })
  }
  v1AcceptCaregiverInvite(token: string, signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/caregiver-invites/accept', { method: 'POST', retry: false, signal, body: JSON.stringify({ token }) }) }
  v1CreateVehicle(payload: JsonRecord, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/vehicles', { method: 'POST', retry: false, signal, body: JSON.stringify(payload) })
  }
  v1IssuePairingCode(vehicleId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/pairing-code`, { method: 'POST', retry: false, signal })
  }
  v1Telemetry(vehicleId: string, minutes = 30, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/telemetry?minutes=${minutes}`, { signal })
  }
  v1Incidents(vehicleId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/incidents`, { signal })
  }
  v1AcknowledgeIncident(vehicleId: string, incidentId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/incidents/${encodeURIComponent(incidentId)}/acknowledge`, { method: 'POST', retry: false, signal })
  }
  v1HoldIncident(vehicleId: string, incidentId: string, version: number, keepActive: boolean, note?: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/incidents/${encodeURIComponent(incidentId)}/hold`, {
      method: 'POST', retry: false, signal,
      body: JSON.stringify({ version, keep_active: keepActive, note: note || null }),
    })
  }
  v1ResolveIncident(vehicleId: string, incidentId: string, revision: number, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/incidents/${encodeURIComponent(incidentId)}/resolve`, { method: 'POST', retry: false, signal, body: JSON.stringify({ revision, cabin_checked: true }) })
  }
  v1VehicleCommands(vehicleId: string, signal?: AbortSignal) {
    return this.request<{ commands: JsonRecord[] }>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/commands`, { signal })
  }
  v1RequestCommand(vehicleId: string, type: 'horn' | 'sms' | 'unlock', incidentId?: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/commands`, { method: 'POST', retry: false, signal, body: JSON.stringify({ type, incident_id: incidentId }) })
  }
  v1ConfirmCommand(commandId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/commands/${encodeURIComponent(commandId)}/confirm`, { method: 'POST', retry: false, signal })
  }
  v1CancelCommand(commandId: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/commands/${encodeURIComponent(commandId)}/cancel`, { method: 'POST', retry: false, signal }) }

  v1AdminVehicles(signal?: AbortSignal) { return this.request<JsonPage>('/api/v1/admin/vehicles?page=1&page_size=100', { signal }) }
  v1AdminTenants(signal?: AbortSignal) { return this.request<{ tenants: JsonRecord[] }>('/api/v1/admin/tenants', { signal }) }
  v1AdminCreateTenant(name: string, signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/tenants', { method: 'POST', retry: false, signal, body: JSON.stringify({ name }) }) }
  v1AdminDevices(signal?: AbortSignal) { return this.request<{ devices: JsonRecord[]; summary: JsonRecord }>('/api/v1/admin/devices', { signal }) }
  v1AdminDeviceHeartbeats(deviceId: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/heartbeats?limit=20`, { signal }) }
  v1AdminSetFirmware(deviceId: string, targetFirmware: string | null, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/firmware`, { method: 'PUT', retry: false, signal, body: JSON.stringify({ target_firmware: targetFirmware }) }) }
  v1AdminRevokeDevice(deviceId: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke`, { method: 'POST', retry: false, signal }) }
  v1AdminUsers(signal?: AbortSignal) { return this.request<{ users: JsonRecord[] }>('/api/v1/admin/users', { signal }) }
  v1AdminCreateUser(payload: JsonRecord, signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/users', { method: 'POST', retry: false, signal, body: JSON.stringify(payload) }) }
  v1AdminUpdateUser(userId: string, payload: JsonRecord, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'PATCH', retry: false, signal, body: JSON.stringify(payload) }) }
  v1AdminRevokeUserSessions(userId: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: 'POST', retry: false, signal }) }
  v1AdminRoles(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/roles', { signal }) }
  v1AdminSetRolePermissions(role: string, permissions: string[], signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/roles/${encodeURIComponent(role)}`, { method: 'PUT', retry: false, signal, body: JSON.stringify({ permissions }) }) }
  v1AdminAccessReview(signal?: AbortSignal) { return this.request<{ users: JsonRecord[]; summary: JsonRecord; as_of: string }>('/api/v1/admin/access-review', { signal }) }
  v1AdminModels(signal?: AbortSignal) { return this.request<{ models: JsonRecord[] }>('/api/v1/admin/models', { signal }) }
  v1AdminRegisterModel(payload: JsonRecord, signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/models', { method: 'POST', retry: false, signal, body: JSON.stringify(payload) }) }
  v1AdminRolloutModel(modelId: string, rolloutPct: number, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/models/${encodeURIComponent(modelId)}/rollout`, { method: 'POST', retry: false, signal, body: JSON.stringify({ rollout_pct: rolloutPct }) }) }
  v1AdminRollbackModel(modelId: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/models/${encodeURIComponent(modelId)}/rollback`, { method: 'POST', retry: false, signal }) }
  v1AdminRulesets(signal?: AbortSignal) { return this.request<{ rulesets: JsonRecord[]; note?: string }>('/api/v1/admin/rulesets', { signal }) }
  v1AdminCreateRuleset(payload: JsonRecord, signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/rulesets', { method: 'POST', retry: false, signal, body: JSON.stringify(payload) }) }
  v1AdminActivateRuleset(version: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/admin/rulesets/${encodeURIComponent(version)}/activate`, { method: 'POST', retry: false, signal }) }
  v1AdminAudit(signal?: AbortSignal) { return this.request<{ entries: JsonRecord[] }>('/api/v1/admin/audit?limit=100', { signal }) }
  v1AdminSystem(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/system', { signal }) }
  v1AdminVision(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/system/vision', { signal }) }
  v1RetireVehicle(vehicleId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}`, { method: 'DELETE', retry: false, signal })
  }

  // Demo studio (administrators of a deployment started with DEMO_STUDIO=true; 404 otherwise).
  v1AdminDemoStatus(signal?: AbortSignal) { return this.request<V1DemoStatus>('/api/v1/admin/demo/status', { signal, retry: false }) }
  v1AdminDemoRun(vehicleId: string, scenario: V1DemoScenarioId, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/admin/demo/run', { method: 'POST', retry: false, signal, body: JSON.stringify({ vehicle_id: vehicleId, scenario }) })
  }
  v1AdminDemoReset(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/demo/reset', { method: 'POST', retry: false, signal }) }
  v1AdminDemoNotifyTest(signal?: AbortSignal) { return this.request<JsonRecord>('/api/v1/admin/demo/notify-test', { method: 'POST', retry: false, signal }) }
  // Camera simulator: a recorded video is the demo vehicle's camera. Frames go through the device ingest path.
  v1AdminDemoVideoStart(body: V1VideoStart, signal?: AbortSignal) {
    return this.request<JsonRecord & { zones: V1CabinZone[] }>('/api/v1/admin/demo/video/start', { method: 'POST', retry: false, signal, body: JSON.stringify(body) })
  }
  v1AdminDemoVideoStop(vehicleId: string, signal?: AbortSignal) {
    return this.request<JsonRecord>('/api/v1/admin/demo/video/stop', { method: 'POST', retry: false, signal, body: JSON.stringify({ vehicle_id: vehicleId }) })
  }
  v1AdminDemoVideoFrame(vehicleId: string, sequence: number, image: Blob, signal?: AbortSignal) {
    const form = new FormData()
    form.set('vehicle_id', vehicleId)
    form.set('sequence', String(sequence))
    form.set('image', image, 'frame.jpg')
    return this.request<V1VideoFrameResult>('/api/v1/admin/demo/video/frame', { method: 'POST', retry: false, signal, body: form })
  }
  /** The person confirms the cabin is empty; the backend then compares every seat with this picture (SR-09). */
  v1AdminDemoVideoReference(vehicleId: string, image: Blob, source: 'sample' | 'frame', signal?: AbortSignal) {
    const form = new FormData()
    form.set('vehicle_id', vehicleId)
    form.set('confirm_empty', 'true')
    form.set('source', source)
    form.set('image', image, 'reference.jpg')
    return this.request<JsonRecord>('/api/v1/admin/demo/video/reference', { method: 'POST', retry: false, signal, body: form })
  }
  v1AdminDemoCalibration(vehicleId: string, signal?: AbortSignal) {
    return this.request<{ vehicle_id: string; calibration: V1CabinCalibration | null }>(`/api/v1/admin/demo/calibration/${encodeURIComponent(vehicleId)}`, { retry: false, signal })
  }
  v1AdminDemoSaveCalibration(vehicleId: string, zones: V1CabinZone[], signal?: AbortSignal) {
    return this.request<{ vehicle_id: string; calibration: V1CabinCalibration }>(`/api/v1/admin/demo/calibration/${encodeURIComponent(vehicleId)}`, { method: 'PUT', retry: false, signal, body: JSON.stringify({ zones }) })
  }

  // Device channel. These calls carry a per-device token, never the user's session: no cookies, no user bearer.
  private deviceRequest<T>(path: string, token: string | undefined, init: RequestOptions = {}) {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return this.request<T>(path, { retry: false, auth: false, credentials: 'omit', ...init, headers })
  }
  v1DevicePair(pairingCode: string, serial: string, firmware?: string, signal?: AbortSignal) {
    return this.deviceRequest<V1DevicePairing>('/api/v1/devices/pair', undefined, { method: 'POST', signal, body: JSON.stringify({ pairing_code: pairingCode, serial, ...(firmware ? { firmware } : {}) }) })
  }
  v1DeviceHeartbeat(token: string, payload: V1DeviceHeartbeat, signal?: AbortSignal) {
    return this.deviceRequest<JsonRecord>('/api/v1/device/heartbeat', token, { method: 'POST', signal, body: JSON.stringify(payload) })
  }
  v1DeviceIngest(token: string, vehicleId: string, kind: 'sensors' | 'vision', payload: JsonRecord, signal?: AbortSignal) {
    return this.deviceRequest<JsonRecord>(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/${kind}`, token, { method: 'POST', signal, body: JSON.stringify(payload) })
  }
  v1DeviceCommands(token: string, signal?: AbortSignal) {
    return this.deviceRequest<{ commands: V1DeviceCommand[] }>('/api/v1/device/commands', token, { signal })
  }
  v1DeviceAck(token: string, commandId: string, ok: boolean, detail?: string, signal?: AbortSignal) {
    return this.deviceRequest<JsonRecord>(`/api/v1/device/commands/${encodeURIComponent(commandId)}/ack`, token, { method: 'POST', signal, body: JSON.stringify({ ok, ...(detail ? { detail } : {}) }) })
  }

  v1OpsIncidents(signal?: AbortSignal) { return this.request<JsonPage>('/api/v1/ops/incidents?page=1&page_size=100', { signal }) }
  v1OpsIncidentAction(incidentId: string, action: 'assign' | 'escalate' | 'note', payload: JsonRecord, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/ops/incidents/${encodeURIComponent(incidentId)}/${action}`, { method: 'POST', retry: false, signal, body: JSON.stringify(payload) }) }
  v1OpsCommands(signal?: AbortSignal) { return this.request<{ enabled: boolean; commands: JsonRecord[] }>('/api/v1/ops/commands?limit=100', { signal }) }
  v1OpsRejectCommand(commandId: string, reason?: string, signal?: AbortSignal) { return this.request<JsonRecord>(`/api/v1/ops/commands/${encodeURIComponent(commandId)}/reject`, { method: 'POST', retry: false, signal, body: JSON.stringify({ reason }) }) }

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
