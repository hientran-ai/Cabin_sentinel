import { Activity, CarFront, FlaskConical, HeartPulse, History, LayoutDashboard } from 'lucide-react'

const links = [
  { href: '#overview', label: 'Overview', Icon: LayoutDashboard },
  { href: '#live-cabin', label: 'Live cabin', Icon: CarFront },
  { href: '#events', label: 'Event history', Icon: History },
  { href: '#health', label: 'Device health', Icon: HeartPulse },
  { href: '#backend-demo', label: 'Backend demo', Icon: FlaskConical },
]

export function Sidebar() {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Activity /></span><span>Cabin<span>Sentinel</span></span></div>
    <nav aria-label="Primary navigation">{links.map(({ href, label, Icon }, index) =>
      <a key={href} href={href} className={index === 0 ? 'active' : ''}><Icon aria-hidden="true" /><span>{label}</span></a>)}</nav>
    <div className="sidebar-foot"><span className="status-dot" /> Edge unit <strong>CS-014</strong></div>
  </aside>
}
