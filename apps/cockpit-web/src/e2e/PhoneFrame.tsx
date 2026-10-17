// Owner phone = the Cabin Noir owner web app in an iframe. The app is unchanged apart from the patches in phone-ui/README.md;
// its /v1 calls are answered by public/phone/e2e-bridge.js from this page's copy of the committed backend state, so the phone
// and the cockpit show one session. The bridge object below is the only thing the iframe can reach.
import { useEffect, useRef } from 'react'
import { pollOnce, useE2e } from './store'
import { connectionNow } from './hooks'
import { deriveView, RULE_VI } from './view'
import { CareSheet } from './CareSheet'

export const PHONE_W = 390
export const PHONE_H = 800

declare global { interface Window { __phoneBridge?: unknown } }

function installBridge() {
  const bridge = {
    snapshot: () => { const s = useE2e.getState(); return JSON.parse(JSON.stringify({ session: s.session ? { id: s.session.id } : null, state: s.state, notifications: s.notifications, history: s.history, connection: connectionNow() })) },
    view: () => { const s = useE2e.getState(); return deriveView({ hasSession: !!s.session, state: s.state, connection: connectionNow() }) },
    ruleText: (id: string | null, fallback: string) => (id && RULE_VI[id]) || fallback,
    acknowledge: () => useE2e.getState().acknowledge('PHONE'),
    resolve: () => useE2e.getState().resolve('PHONE'),
    refresh: () => pollOnce(),
    delivered: (id: number) => useE2e.getState().confirmDelivered(id),
  }
  window.__phoneBridge = bridge
}

export function PhoneFrame() {
  const frame = useRef<HTMLIFrameElement>(null)
  installBridge()
  // tell the phone UI to refresh as soon as the committed state moves, instead of waiting for its own 4 s poll
  const revision = useE2e((s) => s.state?.revision)
  const incident = useE2e((s) => s.state?.incident?.status)
  const notes = useE2e((s) => s.notifications.length)
  useEffect(() => { try { frame.current?.contentDocument?.dispatchEvent(new Event('visibilitychange')) } catch { /* not loaded yet */ } }, [incident, notes])
  void revision
  return (
    <div className="relative overflow-hidden border-[10px] border-black bg-black" style={{ width: PHONE_W, height: PHONE_H, borderRadius: 52 }} data-testid="phone">
      <iframe ref={frame} title="Điện thoại chủ xe (Cabin Noir)" src={`${import.meta.env.BASE_URL}phone/index.html?frame=0`} className="h-full w-full border-0 bg-bg" style={{ borderRadius: 40 }} />
      <CareSheet />
    </div>
  )
}
