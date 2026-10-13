import { useState, type ReactNode, type SVGProps } from 'react'
import { ApiError } from '@cabinsentinel/api-client'
import { canAccessPortal, useAuth } from '@cabinsentinel/auth'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AdminOverview, EvaluationsWorkbench, PlatformPage } from './PlatformPages'
import { useLocale } from './i18n'
import { adminDemoEnabled, stopAdminDemo } from './adminDemo'
import { DemoStudioPage, useDemoStatus } from './DemoStudioPage'
import { virtualDeviceSession } from './virtualDeviceRuntime'

type IconName = 'grid' | 'pulse' | 'car' | 'cpu' | 'users' | 'layers' | 'rules' | 'audit' | 'system' | 'search' | 'bell' | 'menu' | 'close' | 'arrow' | 'refresh' | 'shield' | 'camera' | 'flask' | 'radar' | 'clock' | 'lock' | 'check' | 'warning' | 'chevron'
const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  pulse: <><path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M4 5a10 10 0 0 1 16 0M4 19a10 10 0 0 0 16 0"/></>,
  car: <><path d="m5 16-1 3m15-3 1 3M3 13l2-6h14l2 6v5H3z"/><path d="M7 15h.01M17 15h.01"/></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  rules: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/></>,
  audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l-2.83 2.83A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.4 1.5V21H9v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-2.83-2.83A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1.5-1H2v-4h.1A1.7 1.7 0 0 0 3.6 9a1.7 1.7 0 0 0-.34-1.88l2.83-2.83A1.7 1.7 0 0 0 8 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l2.83 2.83A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, arrow: <path d="m9 18 6-6-6-6"/>, refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  shield: <><path d="M12 3 4.5 6v5c0 5 3 8.5 7.5 10 4.5-1.5 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-4"/></>, camera: <><path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="4"/></>, flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9"/></>, radar: <><circle cx="12" cy="12" r="2"/><path d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, check: <path d="m5 12 4 4L19 6"/>, warning: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>, chevron: <path d="m9 18 6-6-6-6"/>,
}
function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg> }

type AdminNavItem = { to: string; labelKey: string; icon: IconName; adminOnly?: boolean }
type AdminSection = { labelKey: string; items: AdminNavItem[] }
const overviewItem: AdminNavItem = { to: '/admin', labelKey: 'overview', icon: 'grid' }
const adminSections: AdminSection[] = [
  { labelKey: 'operationsHub', items: [
    { to: '/admin/incidents', labelKey: 'incidents', icon: 'warning' },
    { to: '/admin/evaluations', labelKey: 'evaluations', icon: 'pulse' },
    { to: '/admin/commands', labelKey: 'commands', icon: 'lock' },
  ] },
  { labelKey: 'fleetHub', items: [
    { to: '/admin/vehicles', labelKey: 'vehicles', icon: 'car' },
    { to: '/admin/devices', labelKey: 'devices', icon: 'cpu' },
  ] },
  { labelKey: 'peopleHub', items: [
    { to: '/admin/tenants', labelKey: 'tenants', icon: 'layers', adminOnly: true },
    { to: '/admin/users', labelKey: 'users', icon: 'users', adminOnly: true },
  ] },
  { labelKey: 'systemHub', items: [
    { to: '/admin/models', labelKey: 'models', icon: 'layers', adminOnly: true },
    { to: '/admin/rules', labelKey: 'rules', icon: 'rules', adminOnly: true },
    { to: '/admin/audit', labelKey: 'audit', icon: 'audit' },
    { to: '/admin/system', labelKey: 'system', icon: 'system' },
  ] },
]

function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.roles.includes('ADMIN') ? <>{children}</> : <Navigate to="/admin/incidents" replace/>
}

function OperationsUserMenu() {
  const { user, logout, portalUrl } = useAuth()
  const { locale } = useLocale()
  if (!user) return null
  return <div className="portal-menu operations-user-menu">
    <span aria-hidden="true">{user.displayName.slice(0, 2).toUpperCase()}</span>
    <div><strong>{user.displayName}</strong><small>{user.roles.join(' · ')}</small></div>
    {canAccessPortal(user, 'owner') && <a href={portalUrl('owner')}>{locale === 'vi' ? 'Người dùng' : 'User'}</a>}
    {canAccessPortal(user, 'operations') && <a href={portalUrl('operations')}>{locale === 'vi' ? 'Quản trị' : 'Admin'}</a>}
    <button onClick={() => void virtualDeviceSession.stop().then(() => logout())}>{locale === 'vi' ? 'Đăng xuất' : 'Sign out'}</button>
  </div>
}

function ServiceState({ ok, children }: { ok?: boolean; children: ReactNode }) { return <span className={`service-state ${ok === true ? 'is-ok' : ok === false ? 'is-down' : ''}`}><i />{children}</span> }
function AdminShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const { locale, setLocale, t } = useLocale()
  const demoMode = adminDemoEnabled()
  const isAdmin = user?.roles.includes('ADMIN') === true
  // The studio exists only when the backend says so: a 404 (DEMO_STUDIO off) or any failure hides the entry.
  const demoProbe = useDemoStatus({ enabled: isAdmin && !demoMode })
  const studioEnabled = isAdmin && demoProbe.data?.enabled === true && !(demoProbe.error instanceof ApiError && demoProbe.error.status === 404)
  const visibleSections = adminSections.map(section => ({ ...section, items: section.items.filter(item => !item.adminOnly || isAdmin) })).filter(section => section.items.length > 0)
  const studioItem: AdminNavItem = { to: '/admin/demo-studio', labelKey: 'demoStudio', icon: 'flask', adminOnly: true }
  const visibleItems = [overviewItem, ...visibleSections.flatMap(section => section.items), ...(studioEnabled ? [studioItem] : [])]
  const currentItem = visibleItems.find(item => location.pathname === item.to || (item.to !== '/admin' && location.pathname.startsWith(item.to)))
  const current = t(currentItem?.labelKey || 'overview')
  const primaryItems = [
    { ...overviewItem, paths: ['/admin'] },
    { to: '/admin/incidents', labelKey: 'operationsHub', icon: 'warning' as IconName, paths: ['/admin/incidents', '/admin/evaluations', '/admin/commands'] },
    { to: '/admin/vehicles', labelKey: 'fleetHub', icon: 'car' as IconName, paths: ['/admin/vehicles', '/admin/devices'] },
    ...(isAdmin ? [{ to: '/admin/tenants', labelKey: 'peopleHub', icon: 'users' as IconName, paths: ['/admin/tenants', '/admin/users'] }] : []),
    { to: isAdmin ? '/admin/models' : '/admin/audit', labelKey: 'systemHub', icon: 'system' as IconName, paths: ['/admin/models', '/admin/rules', '/admin/audit', '/admin/system'] },
    ...(studioEnabled ? [{ ...studioItem, paths: ['/admin/demo-studio'] }] : []),
  ]
  const activeSection = visibleSections.find(section => section.items.some(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))
  const primaryActive = (paths: string[]) => paths.some(path => path === '/admin' ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`))

  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand"><img className="brand-logo" src={`${import.meta.env.BASE_URL}cabinsentinel-logo.png`} alt="CabinSentinel"/><div><strong>CabinSentinel</strong><small>Operations</small></div><b>{isAdmin ? 'ADM' : 'OPS'}</b></div>
      <div className="workspace"><small>{locale === 'vi' ? 'Không gian làm việc' : 'Workspace'}</small><strong>{isAdmin ? t('platformControl') : t('safetyOperations')}</strong><span>{isAdmin ? t('administratorScope') : t('operatorScope')}</span></div>
      <nav className="primary-nav" aria-label="Operations navigation">
        <small>{t('mainNavigation')}</small>
        {primaryItems.map(item => <NavLink className={primaryActive(item.paths) ? 'active' : undefined} data-label={t(item.labelKey)} aria-label={t(item.labelKey)} end={item.to === '/admin'} key={item.labelKey} to={item.to} onClick={() => setOpen(false)}><Icon name={item.icon}/><span>{t(item.labelKey)}</span>{item.labelKey === 'operationsHub' && <i/>}</NavLink>)}
      </nav>
      <div className="sidebar-foot" title={user?.displayName || 'CabinSentinel'}><span>{user?.displayName.slice(0, 2).toUpperCase() || 'CS'}</span><p><strong>{user?.displayName || (locale === 'vi' ? 'Điều phối viên' : 'Authorized operator')}</strong><small>{isAdmin ? (locale === 'vi' ? 'Quản trị viên nền tảng' : 'Platform administrator') : (locale === 'vi' ? 'Điều phối viên an toàn' : 'Safety operator')}</small></p></div>
    </aside>
    {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <section className="stage">
      <header className="topbar"><button className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'}><Icon name={open ? 'close' : 'menu'}/></button><div className="breadcrumb"><span>{isAdmin ? t('admin') : t('operations')}</span><Icon name="chevron"/><strong>{current}</strong></div><nav className="top-module-nav" aria-label={t('mainNavigation')}>{primaryItems.map(item => <NavLink className={primaryActive(item.paths) ? 'active' : undefined} end={item.to === '/admin'} key={item.labelKey} to={item.to}><Icon name={item.icon}/><span>{t(item.labelKey)}</span></NavLink>)}</nav><div className="top-actions"><ServiceState>{t('live')}</ServiceState><button className="locale-switch" onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')} aria-label={locale === 'vi' ? 'Chuyển sang tiếng Anh' : 'Switch to Vietnamese'}><strong>{locale.toUpperCase()}</strong><span>/ {locale === 'vi' ? 'EN' : 'VI'}</span></button><OperationsUserMenu /></div></header>
      <main>{demoMode && <section className="demo-mode-banner" role="status"><div><strong>{locale === 'vi' ? 'DỮ LIỆU MÔ PHỎNG' : 'SIMULATED DATA'}</strong><span>{locale === 'vi' ? 'Mọi số liệu và thao tác bên dưới chỉ dùng để minh họa, không gửi đến backend thật.' : 'All data and actions below are simulated and are never sent to the live backend.'}</span></div><button onClick={stopAdminDemo}>{locale === 'vi' ? 'Thoát demo' : 'Exit demo'}</button></section>}
        {activeSection && activeSection.items.length > 1 && <nav className="section-tabs" aria-label={t(activeSection.labelKey)}><div><span>{t(activeSection.labelKey)}</span>{activeSection.items.map(item => <NavLink key={item.to} to={item.to}><Icon name={item.icon}/>{t(item.labelKey)}</NavLink>)}</div></nav>}
        <div className="route-view" key={location.pathname}><Routes>
        <Route path="/admin" element={<AdminOverview/>}/>
        <Route path="/admin/evaluations" element={<EvaluationsWorkbench/>}/>
        <Route path="/admin/evaluations/:revision" element={<Navigate to="/admin/evaluations" replace/>}/>
        {(['incidents','commands','vehicles','devices','audit','system'] as const).map(name => <Route key={name} path={`/admin/${name}`} element={<PlatformPage name={name}/>}/>)}
        <Route path="/admin/demo-studio" element={demoProbe.isPending && isAdmin && !demoMode ? <div className="table-state"><span className="spinner"/>{t('loading')}</div> : studioEnabled ? <DemoStudioPage/> : <Navigate to={isAdmin ? '/admin' : '/admin/incidents'} replace/>}/>
        {(['tenants','users','models','rules'] as const).map(name => <Route key={name} path={`/admin/${name}`} element={<AdminRoute><PlatformPage name={name}/></AdminRoute>}/>)}
        <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/admin/incidents'} replace/>}/>
      </Routes></div></main>
      <footer><span>CabinSentinel Operations · {locale === 'vi' ? 'Backend quyết định cuối cùng' : 'Backend-authoritative'}</span><span><i/> {locale === 'vi' ? 'Giao diện điều khiển V1' : 'Control plane UI v1'}</span></footer>
      <nav className="mobile-bottom-nav" aria-label="Mobile operations navigation">
        {primaryItems.map(item => <NavLink className={primaryActive(item.paths) ? 'active' : undefined} end={item.to === '/admin'} key={item.labelKey} to={item.to}><Icon name={item.icon}/><span>{t(item.labelKey)}</span></NavLink>)}
      </nav>
    </section>
  </div>
}

export function App() { return <AdminShell/> }
