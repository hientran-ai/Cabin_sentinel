import { Activity, BrainCircuit, CarFront, FlaskConical, HeartPulse, History, LayoutDashboard, ShieldCheck } from 'lucide-react'

const links = [
  { href: '#overview', label: 'Overview', Icon: LayoutDashboard },
  { href: '#live-cabin', label: 'Live cabin', Icon: CarFront },
  { href: '#decision-intelligence', label: 'Decision data', Icon: BrainCircuit },
  { href: '#events', label: 'Event history', Icon: History },
  { href: '#health', label: 'Device health', Icon: HeartPulse },
  { href: '#backend-demo', label: 'Backend demo', Icon: FlaskConical },
]

export function Sidebar() {
  return <aside className="sidebar">
    <a className="brand" href="#overview" aria-label="CabinSentinel safety overview">
      <span className="brand-mark"><Activity /></span>
      <span className="brand-copy"><strong>CabinSentinel</strong><small>Owner safety console</small></span>
    </a>
    <div className="sidebar-section">
      <span className="sidebar-label">Vehicle monitoring</span>
      <nav aria-label="Primary navigation">{links.map(({ href, label, Icon }, index) =>
        <a key={href} href={href} className={index === 0 ? 'active' : ''}><Icon aria-hidden="true" /><span>{label}</span></a>)}</nav>
    </div>
    <div className="sidebar-note"><ShieldCheck aria-hidden="true" /><span><strong>Backend-authoritative</strong>Safety status is never calculated in this browser.</span></div>
    <div className="sidebar-foot"><span><span className="status-dot" /> Edge unit online</span><strong>CS-014</strong></div>
  </aside>
}
