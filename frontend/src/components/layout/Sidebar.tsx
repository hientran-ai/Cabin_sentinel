import { Activity, Baby, BrainCircuit, CarFront, FlaskConical, HeartPulse, History, LayoutDashboard, Users } from 'lucide-react'

import type { View } from '../../routing'

const links: { href: string; label: string; Icon: typeof Activity; view: View }[] = [
  { href: '#overview', label: 'Live cabin overview', Icon: LayoutDashboard, view: 'owner' },
  { href: '#live-cabin', label: 'Live cabin', Icon: CarFront, view: 'owner' },
  { href: '#decision-intelligence', label: 'Decision data', Icon: BrainCircuit, view: 'owner' },
  { href: '#events', label: 'Event history', Icon: History, view: 'owner' },
  { href: '#health', label: 'Device health', Icon: HeartPulse, view: 'owner' },
  { href: '#backend-demo', label: 'Backend demo', Icon: FlaskConical, view: 'owner' },
  { href: '#fleet', label: 'Vehicles · Admin', Icon: Users, view: 'fleet' },
  { href: '#guardian', label: 'Guardian pickup', Icon: Baby, view: 'guardian' },
]

export function Sidebar({ view = 'owner' }: { view?: View }) {
  const first = links.findIndex(link => link.view === view)
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Activity /></span><span>Cabin<span>Sentinel</span></span></div>
    <nav aria-label="Primary navigation">{links.map(({ href, label, Icon }, index) =>
      <a key={href} href={href} className={index === first ? 'active' : ''} aria-current={index === first ? 'page' : undefined}><Icon aria-hidden="true" /><span>{label}</span></a>)}</nav>
    <div className="sidebar-foot"><span className="status-dot" /> CabinSentinel <strong>{view === 'owner' ? 'Live camera demo' : view === 'fleet' ? 'Fleet demo · simulated' : 'Guardian view'}</strong></div>
  </aside>
}
