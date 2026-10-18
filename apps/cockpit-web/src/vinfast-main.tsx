import * as evidenceLog from './e2e/evidenceLog'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VinfastDemoPage } from './components/automotive/vinfast/demo/VinfastDemoPage'
import { useE2e } from './e2e/store'
import './styles/index.css'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'

// ?debug=1 exposes the same measurement hooks as the SU7 entry (test runners only, never required).
if (new URLSearchParams(location.search).get('debug') === '1') {
  const w = window as unknown as Record<string, unknown>
  w.__e2e = useE2e
  void import('./e2e/capture').then((c) => { w.__e2eCapture = c })
  void import('./e2e/api').then((a) => { w.__e2eApi = a.api })
  w.__evidenceLog = evidenceLog
  void import('./store/uiStore').then((u) => { w.__ui = u.useUi })
  void import('./store/vehicleStore').then((v) => { w.__vehicle = v.useVehicle })
  void import('./e2e/deviceCamera').then((c) => { w.__camera = c })
  void import('./e2e/careScreen').then((c) => { w.__care = c })
}

// Third independent entry (/cockpit/vinfast/). SU7 and Tesla entries are untouched.
// Same backend session as the other two: only the skin differs.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><VinfastDemoPage /></AppErrorBoundary>
  </StrictMode>,
)
