import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AutomotiveDashboard } from './components/automotive/AutomotiveDashboard'
import { E2ePage } from './e2e/E2ePage'
import { ExitBar } from './components/common/ExitBar'
import { useE2e } from './e2e/store'
import './styles/index.css'

// ?debug=1 exposes the client store to the measurement script (read by humans and test runners, never required).
if (new URLSearchParams(location.search).get('debug') === '1') {
  (window as unknown as { __e2e: typeof useE2e }).__e2e = useE2e
  // test runners drive the same inputs as the simulator panel (used by ?view=cockpit, which has no panel)
  void import('./e2e/capture').then((c) => { (window as unknown as { __e2eCapture: typeof c }).__e2eCapture = c })
  void import('./e2e/api').then((a) => { (window as unknown as { __e2eApi: typeof a.api }).__e2eApi = a.api })
  void import('./store/vehicleStore').then((v) => { (window as unknown as { __vehicle: typeof v.useVehicle }).__vehicle = v.useVehicle })
}

// Default: the end-to-end page (one backend session read by cockpit and phone).
// ?mode=playground: the original mock cockpit, kept for design review and clearly labelled as not end-to-end.
const playground = new URLSearchParams(location.search).get('mode') === 'playground'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {playground
      ? <div className="relative h-full"><AutomotiveDashboard /><a href="?" className="absolute bottom-1 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-black/70 px-3 py-0.5 text-xs text-white">MOCK PLAYGROUND · không đi qua backend · mở bản đầu-cuối</a><ExitBar label="Thoát bản mock" href={location.pathname} hint="" /></div>
      : <E2ePage />}
  </StrictMode>,
)
