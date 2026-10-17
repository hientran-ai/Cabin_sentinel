import { create } from 'zustand'
import { cabinAdapter, mockSnapshot, type CabinSnapshot, type MockScenario } from '../lib/cabinMonitor'
import { useVehicle } from './vehicleStore'
import { notify } from './notificationStore'
import { useUi } from './uiStore'

interface CabinState {
  scenario: MockScenario
  snapshot: CabinSnapshot | null
  setScenario: (s: MockScenario) => void
  /** Re-publish the simulated snapshot (once a second) so heat and locking change the risk over time. */
  refresh: () => void
}

let lastPublish = 0
export const useCabin = create<CabinState>((set, get) => ({
  scenario: 'driving_adult',
  snapshot: null,
  setScenario: (scenario) => { set({ scenario }); lastPublish = 0; get().refresh() },
  refresh: () => {
    if (useUi.getState().e2e) return   // end-to-end page: cabin data only comes from the backend
    const now = Date.now()
    if (now - lastPublish < 1000) return
    lastPublish = now
    const v = useVehicle.getState()
    cabinAdapter.publish(mockSnapshot(get().scenario, { locked: v.isLocked, cabinTemperature: v.cabinTemperature, now }))
  },
}))

// The UI only listens to the adapter; swapping in a real CabinSentinel adapter changes nothing here.
cabinAdapter.subscribe((snap) => {
  const prev = useCabin.getState().snapshot
  useCabin.setState({ snapshot: snap })
  if (snap.risk === 'CRITICAL' && prev?.risk !== 'CRITICAL') {
    const vi = useUi.getState().language === 'vi'
    notify({ key: 'cabin-critical', level: 'critical', title: vi ? 'Giám sát cabin: nguy hiểm' : 'Cabin monitoring: critical', body: `${snap.reason} · ${vi ? 'dữ liệu mô phỏng' : 'simulated data'}` })
  } else if (snap.risk === 'WARNING' && prev?.risk !== 'WARNING' && prev?.risk !== 'CRITICAL') {
    const vi = useUi.getState().language === 'vi'
    notify({ key: 'cabin-warning', level: 'warning', title: vi ? 'Giám sát cabin: cảnh báo' : 'Cabin monitoring: warning', body: `${snap.reason} · ${vi ? 'dữ liệu mô phỏng' : 'simulated data'}` })
  }
})
