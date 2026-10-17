import { lazy, Suspense, useEffect } from 'react'
import { Lock, LockOpen, Zap, Car, ShieldCheck, Battery, Monitor, Settings, Plug } from 'lucide-react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT } from '../../../store/uiStore'
import { useCabin } from '../../../store/cabinStore'
import { BRANDS, rangeKm } from '../../../lib/vehicleSimulation'
import type { DoorId, VehicleTab, WindowState } from '../../../types/vehicle'
import { Row, Seg, Sheet, SimTag, Switch } from '../ui'
import { SteeringWheel } from '../icons'
import { useCustomCar } from '../vehicle/CustomCar'

const Vehicle3D = lazy(() => import('../vehicle/Vehicle3D').then((m) => ({ default: m.Vehicle3D })))

const TABS: [VehicleTab, typeof Car][] = [['quick', Car], ['driving', SteeringWheel as unknown as typeof Car], ['safety', ShieldCheck], ['charging', Battery], ['display', Monitor], ['settings', Settings]]
const TAB_KEY = { quick: 'quick', driving: 'drivingTab', safety: 'safety', charging: 'chargingTab', display: 'display', settings: 'settings' } as const

/** Layer 9: vehicle controls. Every change goes through the shared store, so the 3D car and labels follow. */
export function VehicleSettings() {
  const t = useT()
  const ui = useUi()
  useEffect(() => { useUi.getState().resetCarView('threeQuarter') }, [])
  return (
    <Sheet label={t('vehicle')} onClose={() => ui.setOverlay(null)}>
      {/* SU7 kit settings layout: category column (66 px icons) · 620 px content · vehicle image on the right */}
      <div className="grid min-h-0 flex-1 grid-cols-[22rem_minmax(0,40rem)_1fr] gap-x-[5rem] pl-[4rem] pr-[2.25rem]">
        <nav className="flex min-h-0 flex-col gap-[2.6rem] pt-[1.9rem]" aria-label={t('vehicle')}>
          <span className="mb-[.4rem] grid h-[2.6rem] w-fit place-items-center rounded-[1.3rem] bg-white px-[1.4rem] t-label text-black">{t('settings')}</span>
          {TABS.map(([id, Icon]) => (
            <button key={id} type="button" aria-current={ui.vehicleTab === id} onClick={() => ui.set({ vehicleTab: id })} className="su-cat"><span className="su-cat-ic"><Icon size="2rem" /></span>{t(TAB_KEY[id])}</button>
          ))}
          <span className="grow" />
          <div className="pb-[1.5rem]"><SimTag text={t('simulated')} /></div>
        </nav>
        <div key={ui.vehicleTab} className="cx-enter min-h-0 cx-scroll pb-6 pt-[2.5rem]">
          {ui.vehicleTab === 'quick' && <Quick />}
          {ui.vehicleTab === 'driving' && <Driving />}
          {ui.vehicleTab === 'safety' && <Safety />}
          {ui.vehicleTab === 'charging' && <Charging />}
          {ui.vehicleTab === 'display' && <Display />}
          {ui.vehicleTab === 'settings' && <SystemSettings />}
        </div>
        <div className="relative min-h-0"><Suspense fallback={null}><Vehicle3D backdrop="none" /></Suspense></div>
      </div>
    </Sheet>
  )
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 mt-6 text-sm text-text-2 first:mt-0">{children}</h3>

function Quick() {
  const t = useT()
  const v = useVehicle()
  const winOpts: [WindowState, string][] = [['closed', t('close')], ['vent', t('vent')], ['open', t('openAll')]]
  const door = (d: DoorId) => <Row key={d} title={t(d)} sub={v.doors[d] ? t('open') : t('closed')}><Switch checked={v.doors[d]} onChange={() => v.toggleDoor(d)} label={t(d)} /></Row>
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <button type="button" onClick={v.toggleLock} className="cx-btn h-14 gap-2 bg-surface-2 px-5">{v.isLocked ? <LockOpen size="1.7rem" /> : <Lock size="1.7rem" />}{v.isLocked ? t('unlock') : t('lock')}</button>
        <button type="button" onClick={v.toggleFrunk} aria-pressed={v.frontTrunkOpen} className="cx-btn h-14 bg-surface-2 px-5">{t('frunk')} · {v.frontTrunkOpen ? t('open') : t('closed')}</button>
        <button type="button" onClick={v.toggleTrunk} aria-pressed={v.rearTrunkOpen} className="cx-btn h-14 bg-surface-2 px-5">{t('trunk')} · {v.rearTrunkOpen ? t('open') : t('closed')}</button>
        <button type="button" onClick={v.toggleChargePort} aria-pressed={v.chargingPortOpen} className="cx-btn h-14 gap-2 bg-surface-2 px-5"><Zap size="1.5rem" />{t('chargePort')} · {v.chargingPortOpen ? t('open') : t('closed')}</button>
      </div>
      <H>{t('lights')}</H>
      <Row title={t('headlights')}><Seg value={v.headlights} options={[['off', t('off')], ['auto', t('auto')], ['on', t('on')]]} onChange={v.setHeadlights} label={t('headlights')} /></Row>
      <H>{t('windows')}</H>
      <Row title={t('windows')} sub="4"><Seg value={Object.values(v.windows).every((w) => w === v.windows.frontLeft) ? v.windows.frontLeft : ('mixed' as WindowState)} options={winOpts} onChange={v.setAllWindows} label={t('windows')} /></Row>
      {(Object.keys(v.windows) as DoorId[]).map((d) => <Row key={d} title={t(d)}><Seg value={v.windows[d]} options={winOpts} onChange={(w) => v.setWindow(d, w)} label={t(d)} /></Row>)}
      <H>{t('doors')}</H>
      {(['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as DoorId[]).map(door)}
    </>
  )
}

function Driving() {
  const t = useT()
  const v = useVehicle()
  return (
    <>
      <Row title={t('steering')}><Seg value={v.steeringMode} options={[['comfort', t('comfort')], ['standard', t('standard')], ['sport', t('sport')]]} onChange={(x) => v.set({ steeringMode: x })} label={t('steering')} /></Row>
      <Row title={t('acceleration')}><Seg value={v.accelerationMode} options={[['chill', t('chill')], ['standard', t('standard')], ['sport', t('sport')]]} onChange={(x) => v.set({ accelerationMode: x })} label={t('acceleration')} /></Row>
      <Row title={t('regen')} sub={t('simulated')}><Seg value={v.regenLevel} options={[['low', t('low')], ['standard', t('standard')], ['high', t('high')]]} onChange={(x) => v.set({ regenLevel: x })} label={t('regen')} /></Row>
      <Row title={t('seatbelt')} sub={v.driverSeatbelt ? '✓' : '!'}><Switch checked={v.driverSeatbelt} onChange={(x) => v.set({ driverSeatbelt: x })} label={t('seatbelt')} /></Row>
      <Row title={useUi.getState().language === 'vi' ? 'Lái thử mô phỏng' : 'Simulated drive'} sub={useUi.getState().language === 'vi' ? 'Chuyển số D để xe tự chạy theo lộ trình trên bản đồ' : 'Shift to D: the car follows the map route'}>
        <Switch checked={v.autoDrive} onChange={(x) => v.set({ autoDrive: x })} label="autoDrive" />
      </Row>
    </>
  )
}

function Safety() {
  const t = useT()
  const v = useVehicle()
  const snap = useCabin((s) => s.snapshot)
  const ui = useUi()
  return (
    <>
      <Row title={t('childLock')}><Switch checked={v.childLock} onChange={(x) => v.set({ childLock: x })} label={t('childLock')} /></Row>
      <Row title={t('sentry')} sub={t('simulated')}><Switch checked={v.sentryMode} onChange={(x) => v.set({ sentryMode: x })} label={t('sentry')} /></Row>
      <Row title={t('cabinMonitoring')} sub={snap ? `${t(snap.risk)} · ${snap.reason}` : '—'}>
        <button type="button" className="cx-btn h-14 bg-surface-2 px-5" onClick={() => ui.setOverlay('cabin')}>{t('cabinMonitoring')}</button>
      </Row>
    </>
  )
}

function Charging() {
  const t = useT()
  const v = useVehicle()
  const units = useUi((s) => s.units)
  const range = rangeKm(BRANDS[v.brand], v.batteryLevel, v.climate.enabled)
  const state = { disconnected: t('disconnected'), connected: t('connected'), charging: t('chargingNow'), complete: t('complete') }[v.charging]
  return (
    <>
      <div className="mb-4 flex items-end gap-6">
        <div><div className="t-title">{Math.round(v.batteryLevel)}%</div><div className="text-sm text-text-2">{t('batteryLevel')}</div></div>
        <div><div className="t-title">{units === 'metric' ? `${range} km` : `${Math.round(range * 0.621)} mi`}</div><div className="text-sm text-text-2">{t('estRange')}</div></div>
        <div className={`ml-auto cx-chip ${v.charging === 'charging' ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-text-2'}`}>{state}</div>
      </div>
      <div className="relative mb-6 h-4 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${v.charging === 'charging' ? 'bg-ok' : 'bg-text-2'}`} style={{ width: `${v.batteryLevel}%`, transition: 'width 300ms' }} />
        <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${v.chargeLimit}%` }} />
      </div>
      <Row title={t('chargeLimit')} sub={`${v.chargeLimit}%`}><input type="range" min={50} max={100} value={v.chargeLimit} onChange={(e) => v.setChargeLimit(+e.target.value)} className="cx-range w-72" aria-label={t('chargeLimit')} /></Row>
      <Row title={t('chargePort')} sub={v.chargingPortOpen ? t('open') : t('closed')}><Switch checked={v.chargingPortOpen} onChange={v.toggleChargePort} label={t('chargePort')} /></Row>
      <Row title={t('cable')} sub={t('simulated')}>
        <button type="button" className="cx-btn h-14 gap-2 bg-surface-2 px-5" onClick={() => v.setChargeCable(!v.chargeCable)}><Plug size="1.5rem" />{v.chargeCable ? t('unplug') : t('plugIn')}</button>
      </Row>
    </>
  )
}

function Display() {
  const t = useT()
  const custom = useCustomCar()
  const ui = useUi()
  const v = useVehicle()
  return (
    <>
      <Row title={t('brightness')} sub={`${ui.brightness}%`}><input type="range" min={40} max={100} value={ui.brightness} onChange={(e) => ui.set({ brightness: +e.target.value })} className="cx-range w-72" aria-label={t('brightness')} /></Row>
      <Row title={t('appearance')}><Seg value={ui.appearance} options={[['light', t('light')], ['dark', t('dark')], ['auto', t('auto')]]} onChange={(x) => ui.set({ appearance: x })} label={t('appearance')} /></Row>
      <Row title={t('design')} sub={useUi.getState().language === 'vi' ? 'Thiết kế lấy cảm hứng, không phải giao diện chính hãng' : 'Inspired designs, not official interfaces'}>
        <Seg value={v.brand} options={[['tesla', 'TESLA_MODE'], ['vinfast', 'VINFAST_MODE']]} onChange={v.setBrand} label={t('design')} />
      </Row>
      <Row title={t('paint')}>
        <div className="flex gap-2">{BRANDS[v.brand].paints.map((p) => (
          <button key={p.id} type="button" aria-label={p.label} title={p.label} aria-pressed={ui.paint[v.brand] === p.id} onClick={() => ui.set({ paint: { ...ui.paint, [v.brand]: p.id } })}
            className={`h-12 w-12 rounded-full border ${ui.paint[v.brand] === p.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'cx-hair'}`} style={{ background: p.color }} />))}</div>
      </Row>
      <Row title={t('view')} sub={custom ? (custom.credit ?? 'Mô hình xe tải về (chưa ghi công: thêm car.json)') : t('modelNote')}>
        <Seg value={ui.carView} options={[['threeQuarter', t('threeQuarter')], ['side', t('side')], ['top', t('top')]]} onChange={(x) => ui.resetCarView(x)} label={t('view')} />
      </Row>
    </>
  )
}

function SystemSettings() {
  const t = useT()
  const ui = useUi()
  const vi = ui.language === 'vi'
  const info: [string, string][] = [
    [vi ? 'Phiên bản' : 'Version', 'cockpit-web 0.1.0'],
    [vi ? 'Dữ liệu xe' : 'Vehicle data', vi ? 'Mô phỏng trong trình duyệt. Không kết nối xe thật.' : 'Simulated in the browser. No real vehicle connected.'],
    [vi ? 'Mô hình 3D' : '3D model', t('modelNote')],
    [vi ? 'Bản đồ' : 'Map', 'OpenFreeMap · © OpenStreetMap'],
    [vi ? 'Tìm đường' : 'Routing', vi ? 'Máy chủ thử OSRM, lỗi thì dùng lộ trình mô phỏng' : 'OSRM demo server, simulated route on failure'],
    [t('cabinMonitoring'), t('simSource')],
  ]
  return (
    <>
      <Row title={t('language')}><Seg value={ui.language} options={[['vi', 'Tiếng Việt'], ['en', 'English']]} onChange={(x) => ui.set({ language: x })} label={t('language')} /></Row>
      <Row title={t('units')}><Seg value={ui.units} options={[['metric', t('metric')], ['imperial', t('imperial')]]} onChange={(x) => ui.set({ units: x })} label={t('units')} /></Row>
      <Row title={t('profile')}><span className="text-text-2">{t('owner')}</span></Row>
      <H>{t('system')}</H>
      {info.map(([k, val]) => <Row key={k} title={k}><span className="max-w-[28rem] text-right text-sm text-text-2">{val}</span></Row>)}
      <p className="mt-4 text-sm text-text-2">{vi ? 'Bản trình diễn trên web không điều khiển được hệ thống an toàn của xe thật.' : 'This web demo cannot control any real vehicle safety system.'}</p>
    </>
  )
}
