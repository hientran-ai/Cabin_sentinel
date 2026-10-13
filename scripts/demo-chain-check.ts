/**
 * End-to-end check of the whole demo chain against a real backend, using the real client modules
 * (no browser, no mocks): virtual device -> backend -> operator API -> owner view -> phone alert -> assign ->
 * command -> device ack -> SAFE -> resolve -> revoked token rejected.
 *
 *   CABIN_CREDS_FILE=/path/creds.json CABIN_BASE_URL=http://127.0.0.1:8010 CABIN_SINK_LOG=/path/sink.log \
 *     npx vite-node scripts/demo-chain-check.ts
 *
 * The credentials file (outside the repository) holds admin_email, admin_password, owner_email, owner_password.
 * Nothing secret is printed. The demo state is reset and the VIRT vehicle retired at the end.
 */
import { readFileSync } from 'node:fs'
import { CabinSentinelClient } from '../packages/api-client/src/index'
import { computeChecklist } from '../apps/operations-web/src/demoStudio'
import { VirtualDevice } from '../apps/operations-web/src/virtualDevice'
import { VirtualDeviceSession } from '../apps/operations-web/src/virtualDeviceSession'
import { loadIncidents, loadVehicles, pickFeatured } from '../apps/owner-web/src/ownerData'

const BASE = process.env.CABIN_BASE_URL ?? 'http://127.0.0.1:8010'
const CREDS = process.env.CABIN_CREDS_FILE
const SINK = process.env.CABIN_SINK_LOG
if (!CREDS) throw new Error('Set CABIN_CREDS_FILE to a JSON file with admin_email, admin_password, owner_email, owner_password')
const creds = JSON.parse(readFileSync(CREDS, 'utf8')) as Record<string, string>

type Rec = Record<string, unknown>
const results: Array<{ step: string; ok: boolean; detail: string }> = []
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const sinkLines = () => { try { return readFileSync(SINK!, 'utf8').split('\n').filter(Boolean) } catch { return [] } }

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}: ${detail}`)
}

async function waitFor<T>(label: string, probe: () => Promise<T | undefined | false>, timeoutMs = 20_000, everyMs = 700): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: unknown
  while (Date.now() < deadline) {
    try { const value = await probe(); if (value) return value } catch (error) { last = error }
    await sleep(everyMs)
  }
  throw new Error(`Timed out waiting for ${label}${last ? ` (last error: ${(last as Error).message})` : ''}`)
}

async function signIn(email: string, password: string) {
  let token = ''
  const client = new CabinSentinelClient({ baseUrl: BASE, credentials: 'omit', getAccessToken: async () => token })
  const session = await client.v1PlatformLogin(email, password)
  token = session.access_token
  return { client, role: session.user.role }
}

async function main() {
  const admin = await signIn(creds.admin_email!, creds.admin_password!)
  const owner = await signIn(creds.owner_email!, creds.owner_password!)
  record('0 sign in', admin.role === 'admin' && owner.role === 'owner', `admin role=${admin.role}, owner role=${owner.role}`)
  const api = admin.client

  const status0 = await api.v1AdminDemoStatus()
  record('1 demo studio enabled', status0.enabled && status0.label === 'SIMULATED', `${status0.vehicles.length} demo vehicles, ntfy=${status0.notifications.ntfy}, scenarios=${status0.scenarios.map(s => s.id).join('/')}`)
  await api.v1AdminDemoReset()

  // The real session + device classes, with the same adapters the browser uses. Only the script keeps the token (to prove revocation).
  let capturedToken = ''
  const device = new VirtualDevice({
    heartbeat: (token, payload) => api.v1DeviceHeartbeat(token, payload),
    ingest: (token, vehicleId, kind, payload) => api.v1DeviceIngest(token, vehicleId, kind, payload),
    commands: token => api.v1DeviceCommands(token),
    ack: (token, commandId, ok, detail) => api.v1DeviceAck(token, commandId, ok, detail),
  })
  const session = new VirtualDeviceSession({
    createVehicle: payload => api.v1CreateVehicle(payload),
    issuePairingCode: vehicleId => api.v1IssuePairingCode(vehicleId),
    pair: async (code, serial, firmware) => { const paired = await api.v1DevicePair(code, serial, firmware); capturedToken = paired.device_token; return paired },
    revokeDevice: deviceId => api.v1AdminRevokeDevice(deviceId),
    retireVehicle: vehicleId => api.v1RetireVehicle(vehicleId),
  }, device)

  let vehicleId = ''
  try {
    const users = await api.v1AdminUsers()
    const ownerUser = users.users.find(user => user.role === 'owner' && user.active !== false)
    await session.createVehicle(ownerUser ? String(ownerUser.user_id) : undefined)
    await session.issueCode()
    const afterCode = session.snapshot()
    record('2 create VIRT vehicle + pairing code', afterCode.phase === 'code' && (afterCode.vehicleId ?? '').startsWith('VIRT-'), `vehicle=${afterCode.vehicleId}, owner=${ownerUser?.user_id}, code issued=${Boolean(afterCode.pairingCode)}`)
    vehicleId = afterCode.vehicleId!
    await session.pairAndStart('SAFE')
    const running = session.snapshot()
    record('3 pair in the browser code path', running.phase === 'running' && Boolean(capturedToken), `phase=${running.phase}, device_id=${running.deviceId}, token captured in script only=${capturedToken.length > 20}`)

    const onlineDevice = await waitFor('device Online in /admin/devices', async () => {
      const { devices } = await api.v1AdminDevices()
      return devices.find(item => item.vehicle_id === vehicleId && item.online === true)
    }, 20_000)
    record('4 /admin/devices shows it Online', onlineDevice.firmware === 'virtual-web-1.0', `online=${String(onlineDevice.online)}, firmware=${String(onlineDevice.firmware)}, heartbeats sent=${device.snapshot().heartbeats}`)

    // Vision person -> CRITICAL (the rules engine decides; radar alone never would).
    session.setScenario('CRITICAL')
    const critical = await waitFor('backend CRITICAL', async () => {
      const state = await api.v1VehicleState(vehicleId)
      return state.risk?.risk_level === 'CRITICAL' && state.active_incident ? state : undefined
    }, 25_000)
    record('5 vision person -> backend says CRITICAL', true, `rule=${critical.risk?.rule_id}, incident=${critical.active_incident}, temp=${critical.temperature_c}, backend verdict on last ingest=${device.snapshot().lastIngestRisk}`)
    const incidentId = String(critical.active_incident)

    // Owner side, through the owner-web data layer.
    const ownerVehicles = await loadVehicles(owner.client)
    const ownerIncidents = await loadIncidents(owner.client)
    const seen = ownerVehicles.find(vehicle => vehicle.id === vehicleId)
    const seenIncident = ownerIncidents.find(incident => incident.id === incidentId)
    const featured = pickFeatured(ownerVehicles)
    record('6 owner sees it (owner-web data layer)', seen?.riskLevel === 'CRITICAL' && Boolean(seenIncident), `vehicle risk=${seen?.riskLevel}, incident title="${seenIncident?.title.vi}", featured vehicle=${featured?.id} (${featured?.riskLevel})`)

    // Phone alert.
    const before = sinkLines().length
    const alert = await waitFor('ntfy alert for the VIRT vehicle', async () => sinkLines().find(line => line.includes(vehicleId)), 15_000).catch(() => undefined)
    const demoStatus = await api.v1AdminDemoStatus()
    record('7 ntfy sink received an alert', Boolean(alert), alert ? `sink.log lines ${before} total; alert: ${alert.slice(0, 200)}` : `no line mentioning ${vehicleId}; backend delivery log: ${JSON.stringify(demoStatus.notifications.recent.slice(0, 3))}`)

    // Operator assigns.
    const ops = await api.v1OpsIncidents()
    const opsIncident = ops.items.find(item => item.incident_id === incidentId) as Rec | undefined
    const opsMeta = (opsIncident?.ops ?? {}) as Rec
    const assigned = await api.v1OpsIncidentAction(incidentId, 'assign', { vehicle_id: vehicleId, version: Number(opsMeta.version ?? 0), assignee: 'demo-operator' })
    record('8 operator assigns the incident', Boolean(opsIncident), `ops incident found=${Boolean(opsIncident)}, assign response ops_status=${JSON.stringify((assigned as Rec).ops ?? assigned).slice(0, 160)}`)

    // Command round trip.
    const requested = await api.v1RequestCommand(vehicleId, 'horn', incidentId)
    const authorized = await api.v1ConfirmCommand(String(requested.command_id))
    const acked = await waitFor('device ack', async () => {
      const { commands } = await api.v1VehicleCommands(vehicleId)
      return commands.find(command => command.command_id === requested.command_id && command.status === 'acknowledged')
    }, 15_000)
    record('9 horn command: request -> confirm -> device ack', true, `requested=${String(requested.status)}, confirmed=${String(authorized.status)}, final=${String(acked.status)}, device handled=${device.snapshot().commands.map(c => c.type).join(',')}`)

    const checklist = computeChecklist({ status: await api.v1AdminDemoStatus(), incidents: (await api.v1OpsIncidents()).items, commands: (await api.v1OpsCommands()).commands, devices: (await api.v1AdminDevices()).devices })
    record('9b studio checklist from backend data', true, checklist.map(step => `${step.id}:${step.state}`).join(' '))

    // Back to SAFE, then resolve against the current revision (retry: a live feed bumps the revision every tick).
    session.setScenario('SAFE')
    // Safety rule: an occupant incident stays WARNING / UNRESOLVED_OCCUPANT until a person confirms the cabin. Resolve needs fresh empty-cabin evidence.
    const empty = await waitFor('fresh empty-cabin evidence', async () => {
      const state = await api.v1VehicleState(vehicleId)
      return state.risk?.occupancy_state === 'ABSENT' && state.sensors?.status === 'FRESH' && state.vision?.status === 'FRESH' ? state : undefined
    }, 25_000)
    record('10a SAFE data: cabin empty, but the incident stays open until a human checks', true, `occupancy=${empty.risk?.occupancy_state}, risk while unresolved=${empty.risk?.risk_level} (${empty.risk?.rule_id}), incident still open=${Boolean(empty.active_incident)}`)
    let resolved: Rec | undefined
    const attempts: string[] = []
    for (let attempt = 1; attempt <= 6 && !resolved; attempt += 1) {
      const state = await api.v1VehicleState(vehicleId)
      const revision = Number(state.risk?.revision ?? state.revision)
      try { resolved = await api.v1ResolveIncident(vehicleId, incidentId, revision); attempts.push(`#${attempt} revision ${revision}: ok`) } catch (error) { attempts.push(`#${attempt} revision ${revision}: ${(error as Error).message}`) }
    }
    record('10 resolve with cabin_checked', Boolean(resolved), attempts.join(' | '))
    const afterResolve = await waitFor('SAFE after resolve', async () => {
      const state = await api.v1VehicleState(vehicleId)
      return state.risk?.risk_level === 'SAFE' && !state.active_incident ? state : undefined
    }, 15_000).catch(() => undefined)
    record('10b vehicle is SAFE with no open incident after resolve', Boolean(afterResolve), afterResolve ? `risk=${afterResolve.risk?.risk_level}, rule=${afterResolve.risk?.rule_id}` : 'still not SAFE')

    // Revocation.
    await session.stop()
    let rejected = ''
    try { await api.v1DeviceHeartbeat(capturedToken, { firmware: 'virtual-web-1.0', status: 'OK' }) } catch (error) { rejected = `HTTP ${(error as { status?: number }).status}: ${(error as Error).message}` }
    record('11 revoked device token is rejected', rejected !== '', rejected || 'heartbeat with the revoked token was ACCEPTED')
    const after = (await api.v1AdminDevices()).devices.find(item => item.vehicle_id === vehicleId)
    record('11b /admin/devices shows it revoked/offline', after?.status === 'revoked' || after?.online === false, `status=${String(after?.status)}, online=${String(after?.online)}`)
  } finally {
    device.stop()
    await api.v1AdminDemoReset().then(() => record('12 cleanup: demo state reset', true, 'reset ok'), error => record('12 cleanup: demo state reset', false, (error as Error).message))
    if (vehicleId) {
      await api.v1RetireVehicle(vehicleId).then(() => record('12b cleanup: VIRT vehicle retired', true, vehicleId), error => record('12b cleanup: VIRT vehicle retired', false, (error as Error).message))
      const vehicles = await api.v1AdminVehicles()
      const row = vehicles.items.find(item => item.vehicle_id === vehicleId)
      record('12c retired vehicle state in /admin/vehicles', !row || row.status === 'retired', row ? `status=${String(row.status)}` : 'not listed')
    }
  }
  const failed = results.filter(item => !item.ok)
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(error => { console.error('ABORTED:', (error as Error).message); process.exit(2) })
