import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@cabinsentinel/auth'
import type { V1DemoScenarioId, V1DemoStatus, V1DemoVehicle } from '@cabinsentinel/contracts'
import { Link } from 'react-router-dom'
import { CameraSimulator } from './CameraSimulator'
import { useConfirmAction } from './ConfirmDialog'
import { platformClient } from './data'
import { STUDIO_POLL_MS, agoLabel, computeChecklist, formatTemperature, ownerLink, pollWhenVisible, riskTone, scenarioSync, type ChecklistStep } from './demoStudio'
import { useLocale } from './i18n'
import { useVirtualDeviceSession, virtualDeviceSession } from './virtualDeviceRuntime'

const SCENARIO_IDS: V1DemoScenarioId[] = ['SAFE', 'WARNING', 'CRITICAL', 'RAMP', 'OFFLINE']
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

export const DEMO_STATUS_KEY = ['demo-status'] as const

/** Shared by the nav probe (no polling) and the page (poll every 2 s, paused while the tab is hidden). */
export function useDemoStatus(options: { poll?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: DEMO_STATUS_KEY,
    queryFn: ({ signal }) => platformClient.v1AdminDemoStatus(signal),
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: options.poll ? 0 : 30_000,
    refetchInterval: options.poll ? pollWhenVisible(STUDIO_POLL_MS) : false,
    refetchOnWindowFocus: options.poll ? 'always' : false,
  })
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'neutral'; children: React.ReactNode }) {
  return <span className={`data-pill studio-pill studio-pill-${tone}`}>{children}</span>
}

function StepMark({ state }: { state: ChecklistStep['state'] }) {
  const symbol = state === 'done' ? '✓' : state === 'manual' ? '↗' : state === 'current' ? '●' : '○'
  return <span className={`studio-step-mark is-${state}`} aria-hidden="true">{symbol}</span>
}

function Checklist({ status }: { status: V1DemoStatus | undefined }) {
  const { bi } = useLocale()
  const { portalUrl } = useAuth()
  const queryClient = useQueryClient()
  const incidents = useQuery({ queryKey: ['ops-incidents'], queryFn: () => platformClient.v1OpsIncidents(), refetchInterval: pollWhenVisible(4_000) })
  const commands = useQuery({ queryKey: ['ops-commands'], queryFn: () => platformClient.v1OpsCommands(), refetchInterval: pollWhenVisible(4_000) })
  const devices = useQuery({ queryKey: ['admin-devices'], queryFn: () => platformClient.v1AdminDevices(), refetchInterval: pollWhenVisible(4_000) })
  const firstVehicle = status?.vehicles[0]?.vehicle_id
  const run = useMutation({
    mutationFn: ({ vehicleId, scenario }: { vehicleId: string; scenario: V1DemoScenarioId }) => platformClient.v1AdminDemoRun(vehicleId, scenario),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: DEMO_STATUS_KEY }); void queryClient.invalidateQueries({ queryKey: ['ops-incidents'] }) },
  })
  const steps = computeChecklist({ status, incidents: incidents.data?.items ?? [], commands: commands.data?.commands ?? [], devices: devices.data?.devices ?? [] })
  const cameraLink = ownerLink(portalUrl('owner'), '/cabin#live-camera')
  const overviewLink = ownerLink(portalUrl('owner'), '/overview')
  const copy: Record<ChecklistStep['id'], { title: string; body: string; action: React.ReactNode }> = {
    critical: {
      title: bi('Chạy kịch bản Nguy hiểm', 'Run the Critical scenario'),
      body: bi('Chọn CRITICAL cho một xe demo. Quy tắc an toàn ở backend sẽ tự quyết định mức rủi ro.', 'Pick CRITICAL for a demo vehicle. The backend safety rules decide the risk level.'),
      action: firstVehicle && <button className="secondary-button" disabled={run.isPending} onClick={() => run.mutate({ vehicleId: firstVehicle, scenario: 'CRITICAL' })}>{bi(`CRITICAL cho ${firstVehicle}`, `CRITICAL on ${firstVehicle}`)}</button>,
    },
    'incident-alert': {
      title: bi('Sự cố mở và cảnh báo ra điện thoại', 'Incident opens and the phone is alerted'),
      body: bi('Sự cố xuất hiện trong Sự cố; kênh ntfy/Telegram nhận tin. Nhật ký gửi nằm ở khung bên dưới.', 'The incident appears under Incidents; the ntfy/Telegram channel gets a message. The delivery log is below.'),
      action: <Link className="secondary-button" to="/admin/incidents">{bi('Mở Sự cố', 'Open Incidents')}</Link>,
    },
    'assign-command': {
      title: bi('Phân việc và yêu cầu lệnh còi', 'Assign it and request a horn command'),
      body: bi('Trong Sự cố: nhận xử lý, rồi yêu cầu và phê duyệt lệnh còi. Lệnh chỉ là sổ ghi, không điều khiển xe thật.', 'Under Incidents: take it, then request and approve a horn command. Commands are only a ledger and never drive a real car.'),
      action: <span className="studio-links"><Link className="secondary-button" to="/admin/incidents">{bi('Sự cố', 'Incidents')}</Link><Link className="secondary-button" to="/admin/commands">{bi('Lệnh', 'Commands')}</Link></span>,
    },
    resolve: {
      title: bi('Đưa về SAFE và đóng sự cố', 'Return to SAFE and close the incident'),
      body: bi('Chọn SAFE, đợi bằng chứng cabin trống mới, rồi xác nhận đã kiểm tra cabin để đóng sự cố.', 'Pick SAFE, wait for fresh empty-cabin evidence, then confirm the cabin check to close the incident.'),
      action: firstVehicle && <button className="secondary-button" disabled={run.isPending} onClick={() => run.mutate({ vehicleId: firstVehicle, scenario: 'SAFE' })}>{bi(`SAFE cho ${firstVehicle}`, `SAFE on ${firstVehicle}`)}</button>,
    },
    'virtual-device': {
      title: bi('Thiết bị ảo Online', 'Virtual device is online'),
      body: bi('Tạo xe ảo, ghép thiết bị ngay trong trình duyệt và gửi nhịp tim thật. Trang Thiết bị sẽ hiện Online.', 'Create a virtual car, pair a device in the browser and send real heartbeats. The Devices page will show it Online.'),
      action: <span className="studio-links"><a className="secondary-button" href="#virtual-device">{bi('Tới Thiết bị ảo', 'Go to Virtual device')}</a><Link className="secondary-button" to="/admin/devices">{bi('Thiết bị', 'Devices')}</Link></span>,
    },
    'owner-view': {
      title: bi('Xem phía chủ xe', 'See the owner side'),
      body: bi('Mở web chủ xe (đăng nhập tài khoản chủ xe demo) để thấy sự cố, và trang Camera thật. Bước này tự kiểm tra bằng mắt.', 'Open the owner site (sign in as the demo owner) to see the incident, and the live camera page. You check this step by eye.'),
      action: <span className="studio-links"><a className="secondary-button" href={overviewLink} target="_blank" rel="noreferrer">{bi('Web chủ xe', 'Owner site')}</a><a className="secondary-button" href={cameraLink} target="_blank" rel="noreferrer">{bi('Camera thật', 'Live camera')}</a></span>,
    },
  }
  return <section className="surface studio-card" aria-labelledby="studio-flow">
    <div className="section-heading"><div><span className="section-kicker">{bi('6 bước', '6 steps')}</span><h2 id="studio-flow">{bi('Luồng thử nghiệm', 'Test flow')}</h2><p>{bi('Trạng thái từng bước được tính từ dữ liệu thật của backend.', 'Each step is computed from live backend data.')}</p></div></div>
    <ol className="studio-steps">
      {steps.map((step, index) => <li key={step.id} className={`studio-step is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
        <StepMark state={step.state}/>
        <div><strong>{index + 1}. {copy[step.id].title}</strong><p>{copy[step.id].body}</p>{step.progress && step.state !== 'manual' && <small>{bi('Số liệu', 'Counts')}: {step.progress}</small>}</div>
        <div className="studio-step-action">{copy[step.id].action}<span className="sr-only">{step.state}</span></div>
      </li>)}
    </ol>
    {run.error && <p className="action-notice is-error">{errorText(run.error, 'Backend rejected the scenario')}</p>}
  </section>
}

function VehicleCard({ vehicle, status }: { vehicle: V1DemoVehicle; status: V1DemoStatus }) {
  const { bi } = useLocale()
  const queryClient = useQueryClient()
  const sync = scenarioSync(vehicle)
  const run = useMutation({
    mutationFn: (scenario: V1DemoScenarioId) => platformClient.v1AdminDemoRun(vehicle.vehicle_id, scenario),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: DEMO_STATUS_KEY }); void queryClient.invalidateQueries({ queryKey: ['ops-incidents'] }) },
  })
  const labels = new Map(status.scenarios.map(item => [item.id, item]))
  return <article className={`studio-vehicle tone-${riskTone(vehicle.risk_level)}`} data-testid={`demo-vehicle-${vehicle.vehicle_id}`}>
    <header><div><strong>{vehicle.name}</strong><small>{vehicle.vehicle_id}</small></div><Pill tone="neutral">{vehicle.data_source}</Pill></header>
    <div className="studio-live">
      <div><small>{bi('Rủi ro', 'Risk')}</small><Pill tone={riskTone(vehicle.risk_level)}>{vehicle.risk_level}</Pill></div>
      <div><small>{bi('Kết nối', 'Connection')}</small><Pill tone={vehicle.online ? 'ok' : 'danger'}>{vehicle.online ? 'Online' : 'Offline'}</Pill></div>
      <div><small>{bi('Nhiệt độ', 'Temperature')}</small><strong>{formatTemperature(vehicle.temperature_c)}</strong></div>
    </div>
    <p className="studio-scenario-line">{bi('Kịch bản', 'Scenario')}: <strong>{labels.get(vehicle.scenario)?.label ?? vehicle.scenario}</strong> {sync === 'settling' ? <Pill tone="warn">{bi('đang cập nhật…', 'settling…')}</Pill> : <Pill tone="ok">{bi('đã khớp', 'in sync')}</Pill>}</p>
    <div className="studio-scenarios" role="group" aria-label={bi(`Kịch bản cho ${vehicle.vehicle_id}`, `Scenario for ${vehicle.vehicle_id}`)}>
      {SCENARIO_IDS.map(id => <button key={id} type="button" title={labels.get(id)?.description} aria-pressed={vehicle.scenario === id} className={vehicle.scenario === id ? 'is-active' : ''} disabled={run.isPending} onClick={() => run.mutate(id)}>{id}</button>)}
    </div>
    {vehicle.video && <p className="studio-scenario-line"><Pill tone="neutral">{bi('Camera = video', 'Camera = video')}</Pill> {vehicle.video.sample ?? ''} · {vehicle.video.frames} {bi('khung', 'frames')} <a href="#camera-simulator">{bi('Mở mô phỏng', 'Open simulator')}</a></p>}
    <footer>{vehicle.active_incident ? <Link to="/admin/incidents">{bi('Có sự cố đang mở →', 'Open incident →')}</Link> : <span>{bi('Không có sự cố mở', 'No open incident')}</span>}</footer>
    {run.error && <p className="action-notice is-error">{errorText(run.error, 'Backend rejected the scenario')}</p>}
  </article>
}

function Notifications({ status }: { status: V1DemoStatus }) {
  const { bi, locale } = useLocale()
  const queryClient = useQueryClient()
  const now = useNow(1_000)
  const { ntfy, telegram, recent } = status.notifications
  const test = useMutation({ mutationFn: () => platformClient.v1AdminDemoNotifyTest(), onSettled: () => { void queryClient.invalidateQueries({ queryKey: DEMO_STATUS_KEY }) } })
  const none = !ntfy && !telegram
  return <section className="surface studio-card" aria-labelledby="studio-notify">
    <div className="section-heading"><div><span className="section-kicker">{bi('Điện thoại', 'Phone')}</span><h2 id="studio-notify">{bi('Kênh thông báo', 'Notification channels')}</h2><p>{bi('Tin chỉ gồm mức rủi ro, mã xe và lời nhắc kiểm tra: không có tên, số điện thoại, vị trí hay ảnh.', 'Messages carry only the risk level, vehicle code and a reminder to check: no names, phone numbers, location or images.')}</p></div>
      <button className="primary-button" disabled={none || test.isPending} onClick={() => test.mutate()}>{test.isPending ? bi('Đang gửi…', 'Sending…') : bi('Gửi tin thử', 'Send test message')}</button></div>
    <div className="studio-channels"><Pill tone={ntfy ? 'ok' : 'neutral'}>ntfy: {ntfy ? bi('bật', 'on') : bi('tắt', 'off')}</Pill><Pill tone={telegram ? 'ok' : 'neutral'}>Telegram: {telegram ? bi('bật', 'on') : bi('tắt', 'off')}</Pill></div>
    {none && <p className="backend-note is-locked">{bi('Chưa cấu hình kênh nào (NTFY_TOPIC hoặc TELEGRAM_*), nên chưa có tin nào ra điện thoại.', 'No channel is configured (NTFY_TOPIC or TELEGRAM_*), so nothing reaches a phone yet.')}</p>}
    {test.isSuccess && <p className="action-notice is-success">{bi('Đã gửi tin thử; xem kết quả trong nhật ký bên dưới.', 'Test message sent; see the result in the log below.')}</p>}
    {test.error && <p className="action-notice is-error">{errorText(test.error, 'Backend rejected the test message')}</p>}
    <h3>{bi('Nhật ký gửi gần đây', 'Recent deliveries')}</h3>
    {recent.length === 0 ? <p className="studio-muted">{bi('Chưa có lần gửi nào.', 'Nothing has been sent yet.')}</p> : <ul className="studio-log">
      {recent.map(item => <li key={`${item.at}-${item.channel}`}><Pill tone={item.ok ? 'ok' : 'danger'}>{item.ok ? 'OK' : bi('Lỗi', 'Failed')}</Pill><strong>{item.channel}</strong><span>{item.detail}</span><time dateTime={item.at}>{agoLabel(item.at, now, locale === 'vi')}</time></li>)}
    </ul>}
  </section>
}

function VirtualDevicePanel({ scenarios }: { scenarios: V1DemoStatus['scenarios'] }) {
  const { bi, locale } = useLocale()
  const session = useVirtualDeviceSession()
  const now = useNow(1_000)
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => platformClient.v1AdminUsers(), staleTime: 60_000 })
  const owners = (users.data?.users ?? []).filter(user => user.role === 'owner' && user.active !== false)
  const [ownerId, setOwnerId] = useState('')
  const [scenario, setScenario] = useState<V1DemoScenarioId>('SAFE')
  const owner = ownerId || String(owners[0]?.user_id ?? '')
  const device = session.device
  const label = (id: V1DemoScenarioId) => scenarios.find(item => item.id === id)?.label ?? id
  const changeScenario = (value: V1DemoScenarioId) => { setScenario(value); virtualDeviceSession.setScenario(value) }
  const { confirm, confirmationDialog } = useConfirmAction()
  return <section className="surface studio-card" id="virtual-device" aria-labelledby="studio-device">
    <div className="section-heading"><div><span className="section-kicker">{bi('Trong xe', 'In the car')}</span><h2 id="studio-device">{bi('Thiết bị ảo', 'Virtual device')}</h2><p>{bi('Trình duyệt này đóng vai thiết bị edge: ghép bằng mã, gửi nhịp tim thật mỗi 5 giây và metadata cảm biến + thị giác (không có ảnh) mỗi 2 giây.', 'This browser plays the edge unit: it pairs with a code, sends real heartbeats every 5 s and sensor + vision metadata (no images) every 2 s.')}</p></div><Pill tone="neutral">SIMULATED</Pill></div>
    <p className="backend-note">{bi('Token thiết bị chỉ nằm trong bộ nhớ của tab này và bị thu hồi khi bấm Dừng, đăng xuất hoặc đóng tab.', 'The device token lives only in this tab’s memory and is revoked on Stop, sign-out or closing the tab.')}</p>
    {session.error && <p className="action-notice is-error" role="alert">{session.error}</p>}
    {device.revoked && <p className="action-notice is-error" role="alert">{bi('Backend đã từ chối token của thiết bị (đã thu hồi). Thiết bị ảo đã dừng.', 'The backend rejected the device token (revoked). The virtual device has stopped.')}</p>}

    {session.phase === 'idle' && <div className="studio-device-row">
      <label><span>{bi('Chủ xe được gán', 'Assigned owner')}</span><select value={owner} onChange={event => setOwnerId(event.target.value)} disabled={owners.length === 0}>
        {owners.length === 0 && <option value="">{bi('(không có chủ xe — xe sẽ chờ nhận)', '(no owner — the car waits to be claimed)')}</option>}
        {owners.map(user => <option key={String(user.user_id)} value={String(user.user_id)}>{String(user.full_name ?? user.email)}</option>)}
      </select></label>
      <button className="primary-button" disabled={session.busy} onClick={() => void virtualDeviceSession.createVehicle(owner || undefined)}>{bi('Tạo xe ảo (VIRT-…)', 'Create virtual car (VIRT-…)')}</button>
    </div>}

    {(session.phase === 'vehicle' || session.phase === 'stopped') && <div className="studio-device-row">
      <p><strong>{session.vehicleId}</strong> — {session.phase === 'stopped' ? bi('đã dừng, token đã thu hồi', 'stopped, token revoked') : bi('xe đã tạo, chưa có thiết bị', 'car created, no device yet')}</p>
      <button className="primary-button" disabled={session.busy} onClick={() => void virtualDeviceSession.issueCode()}>{bi('Tạo mã ghép', 'Issue pairing code')}</button>
      <button className="secondary-button" disabled={session.busy} onClick={() => void virtualDeviceSession.retire()}>{bi('Gỡ xe ảo', 'Remove virtual car')}</button>
    </div>}

    {session.phase === 'code' && <div className="studio-device-row">
      <p>{bi('Mã ghép cho', 'Pairing code for')} <strong>{session.vehicleId}</strong>: <code className="studio-code" data-testid="pairing-code">{session.pairingCode}</code></p>
      <label><span>{bi('Kịch bản ban đầu', 'Starting scenario')}</span><select value={scenario} onChange={event => setScenario(event.target.value as V1DemoScenarioId)}>{SCENARIO_IDS.map(id => <option key={id} value={id}>{id} — {label(id)}</option>)}</select></label>
      <button className="primary-button" disabled={session.busy} onClick={() => void virtualDeviceSession.pairAndStart(scenario)}>{bi('Ghép thiết bị và bắt đầu gửi', 'Pair device and start sending')}</button>
    </div>}

    {session.phase === 'running' && <>
      <div className="studio-device-stats" aria-live="polite">
        <div><small>{bi('Xe', 'Car')}</small><strong>{session.vehicleId}</strong></div>
        <div><small>{bi('Firmware', 'Firmware')}</small><strong>virtual-web-1.0</strong></div>
        <div><small>{bi('Pin', 'Battery')}</small><strong>{device.batteryPct.toFixed(1)}%</strong></div>
        <div><small>RSSI</small><strong>{device.rssiDbm} dBm</strong></div>
        <div><small>{bi('Nhịp tim đã gửi', 'Heartbeats sent')}</small><strong>{device.heartbeats}</strong><span>{agoLabel(device.lastHeartbeatAt, now, locale === 'vi')}</span></div>
        <div><small>{bi('Gói cảm biến + thị giác', 'Sensor + vision batches')}</small><strong>{device.telemetry}</strong><span>{agoLabel(device.lastTelemetryAt, now, locale === 'vi')}</span></div>
        <div><small>{bi('Backend đánh giá', 'Backend verdict')}</small><Pill tone={riskTone(device.lastIngestRisk)}>{device.lastIngestRisk ?? '—'}</Pill></div>
      </div>
      {device.error && <p className="action-notice is-error">{device.error}</p>}
      <div className="studio-device-row">
        <label><span>{bi('Kịch bản của thiết bị', 'Device scenario')}</span><select value={device.scenario} onChange={event => changeScenario(event.target.value as V1DemoScenarioId)}>{SCENARIO_IDS.map(id => <option key={id} value={id}>{id} — {label(id)}</option>)}</select></label>
        <Link className="secondary-button" to="/admin/devices">{bi('Xem trong Thiết bị', 'See in Devices')}</Link>
        <button className="danger-button" onClick={() => confirm({ title: bi('Dừng thiết bị ảo?', 'Stop the virtual device?'), description: bi('Thiết bị ngừng gửi và token bị thu hồi; muốn chạy lại cần mã ghép mới.', 'The device stops sending and its token is revoked; a new pairing code is needed to run it again.'), confirmLabel: bi('Dừng và thu hồi', 'Stop and revoke'), tone: 'danger' }, () => void virtualDeviceSession.stop())}>{bi('Dừng và thu hồi token', 'Stop and revoke token')}</button>
      </div>
      <h3>{bi('Lệnh đã nhận và xác nhận', 'Commands received and acknowledged')}</h3>
      {device.commands.length === 0 ? <p className="studio-muted">{bi('Chưa có lệnh. Yêu cầu và phê duyệt lệnh còi cho xe này trong Sự cố/Lệnh.', 'No commands yet. Request and approve a horn command for this car under Incidents/Commands.')}</p> : <ul className="studio-log">
        {device.commands.map(item => <li key={item.commandId}><Pill tone="ok">ACK</Pill><strong>{item.type}</strong><span>{item.commandId}</span><time dateTime={item.at}>{agoLabel(item.at, now, locale === 'vi')}</time></li>)}
      </ul>}
    </>}
    {confirmationDialog}
  </section>
}

export function DemoStudioPage() {
  const { bi } = useLocale()
  const { confirm, confirmationDialog } = useConfirmAction()
  const queryClient = useQueryClient()
  const status = useDemoStatus({ poll: true })
  const reset = useMutation({
    mutationFn: () => platformClient.v1AdminDemoReset(),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: DEMO_STATUS_KEY }); void queryClient.invalidateQueries({ queryKey: ['ops-incidents'] }); void queryClient.invalidateQueries({ queryKey: ['ops-commands'] }) },
  })
  const data: V1DemoStatus | undefined = status.data
  const requestReset = () => confirm({
    title: bi('Đặt lại toàn bộ demo?', 'Reset the whole demo?'),
    description: bi('Xóa lịch sử, việc vận hành và lệnh của 4 xe demo, và đưa kịch bản về mặc định. Không ảnh hưởng xe thật.', 'Clears history, operator work and commands of the 4 demo vehicles and restores the default scenarios. Real vehicles are not touched.'),
    confirmLabel: bi('Đặt lại', 'Reset'), tone: 'danger',
  }, () => reset.mutate())
  return <>
    <div className="page-header"><div><p className="eyebrow">{bi('Thử nghiệm đầu-cuối', 'End-to-end trial')}</p><h1>Demo studio</h1><p>{bi('Thử cả chuỗi từ trình duyệt: thiết bị trong xe → backend → web vận hành → web chủ xe → cảnh báo ra điện thoại.', 'Try the whole chain from the browser: in-car device → backend → operations site → owner site → phone alert.')}</p></div>
      <div className="studio-header-actions"><Link className="secondary-button" to="/admin/incidents">{bi('Sự cố', 'Incidents')}</Link><Link className="secondary-button" to="/admin/devices">{bi('Thiết bị', 'Devices')}</Link><button className="danger-button" disabled={reset.isPending} onClick={requestReset}>{bi('Đặt lại demo', 'Reset demo')}</button></div></div>
    <section className="studio-simulated" role="status"><strong>{bi('DỮ LIỆU MÔ PHỎNG', 'SIMULATED DATA')} · SIMULATED</strong><span>{bi('Mọi số liệu ở đây do studio tạo ra để minh họa. Luật rủi ro vẫn do backend quyết định.', 'Everything here is generated by the studio for demonstration. The backend rules still decide every risk level.')}</span></section>
    {reset.isSuccess && <p className="action-notice is-success">{bi('Đã đặt lại demo.', 'Demo reset.')}</p>}
    {reset.error && <p className="action-notice is-error">{errorText(reset.error, 'Backend rejected the reset')}</p>}
    {status.isError && <section className="degraded-banner" role="alert"><div><strong>{bi('Không đọc được trạng thái demo', 'Cannot read the demo status')}</strong><p>{errorText(status.error, '')}</p></div><button onClick={() => void status.refetch()}>{bi('Thử lại', 'Retry')}</button></section>}
    {data?.last_error && <p className="action-notice is-error">{bi('Feeder demo báo lỗi', 'Demo feeder error')}: {data.last_error}</p>}
    <Checklist status={data}/>
    <section aria-labelledby="studio-vehicles"><h2 id="studio-vehicles" className="studio-h2">{bi('Xe demo', 'Demo vehicles')} <small>{bi('cập nhật mỗi 2 giây', 'refreshes every 2 s')}</small></h2>
      {!data ? <div className="table-state"><span className="spinner"/>{bi('Đang tải…', 'Loading…')}</div> : <div className="studio-vehicle-grid">{data.vehicles.map(vehicle => <VehicleCard key={vehicle.vehicle_id} vehicle={vehicle} status={data}/>)}</div>}
    </section>
    {data && <CameraSimulator vehicles={data.vehicles}/>}
    {data && <Notifications status={data}/>}
    <VirtualDevicePanel scenarios={data?.scenarios ?? []}/>
    {confirmationDialog}
  </>
}

