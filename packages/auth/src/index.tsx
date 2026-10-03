import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, CabinSentinelClient } from '@cabinsentinel/api-client'
import type { Permission, User, V1Me } from '@cabinsentinel/contracts'

export type Portal = 'owner' | 'operations'
export type AuthMode = 'session' | 'v1-demo' | 'mock'
export interface AuthConfig { apiBaseUrl: string; mode: AuthMode; ownerUrl: string; operationsUrl: string; loginUrl?: string; logoutUrl?: string }
interface AuthValue { user?: User; loading: boolean; error?: string; config: AuthConfig; login: (persona?: Portal) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<User | undefined>; portalUrl: (portal: Portal) => string }

const AuthContext = createContext<AuthValue | null>(null)
const MOCK_KEY = 'cs_mock_persona'
const V1_TOKEN_KEY = 'cs_v1_demo_access_token'
const mockUsers: Record<Portal, User> = {
  owner: { id: 'owner-demo', displayName: 'Thu Hiền', email: 'owner@demo.cabinsentinel.vn', roles: ['OWNER'], permissions: ['vehicle:view', 'incident:acknowledge'], vehicleIds: ['CAR_1', 'CAR_2'] },
  operations: { id: 'operator-demo', displayName: 'Control Operator', email: 'ops@demo.cabinsentinel.vn', roles: ['OPERATOR', 'AUDITOR'], permissions: ['operations:view', 'audit:view', 'vehicle:view'], vehicleIds: [] },
}

export function getV1DemoAccessToken() { return sessionStorage.getItem(V1_TOKEN_KEY) || undefined }

function mapV1User(me: V1Me): User {
  const admin = me.role === 'admin'
  const permissions: Permission[] = admin ? ['operations:view', 'audit:view', 'vehicle:view'] : ['vehicle:view', 'incident:acknowledge']
  return {
    id: me.subject,
    displayName: admin ? 'Fleet Admin' : me.subject === 'demo-owner' ? 'Demo Owner' : me.subject,
    email: `${me.subject}@demo.cabinsentinel.local`,
    roles: admin ? ['ADMIN'] : ['OWNER'],
    permissions,
    vehicleIds: me.vehicle_ids,
  }
}

export function canAccessPortal(user: User | undefined, portal: Portal) {
  if (!user) return false
  return portal === 'owner'
    ? user.roles.some(role => role === 'OWNER' || role === 'CAREGIVER')
    : user.roles.some(role => role === 'OPERATOR' || role === 'ADMIN' || role === 'AUDITOR')
}
export function defaultPortal(user: User | undefined): Portal { return canAccessPortal(user, 'operations') && !canAccessPortal(user, 'owner') ? 'operations' : 'owner' }

export function AuthProvider({ config, children }: { config: AuthConfig; children: ReactNode }) {
  const [user, setUser] = useState<User>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const client = useMemo(() => new CabinSentinelClient({
    baseUrl: config.apiBaseUrl,
    credentials: config.mode === 'session' ? 'include' : 'omit',
    getAccessToken: config.mode === 'v1-demo' ? async () => getV1DemoAccessToken() : undefined,
  }), [config.apiBaseUrl, config.mode])

  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined)
    try {
      if (config.mode === 'mock') {
        const requested = new URLSearchParams(location.search).get('mock_role') as Portal | null
        const stored = sessionStorage.getItem(MOCK_KEY) as Portal | null
        const persona = requested === 'owner' || requested === 'operations' ? requested : stored
        const next = persona ? mockUsers[persona] : undefined
        if (requested) sessionStorage.setItem(MOCK_KEY, requested)
        setUser(next); return next
      }
      if (config.mode === 'v1-demo') {
        const requested = new URLSearchParams(location.search).get('demo_role') as Portal | null
        if (requested === 'owner' || requested === 'operations') {
          const login = await client.v1DemoLogin(requested === 'owner' ? 'owner' : 'admin')
          sessionStorage.setItem(V1_TOKEN_KEY, login.access_token)
        }
        if (!getV1DemoAccessToken()) { setUser(undefined); return undefined }
        const next = mapV1User(await client.v1Me())
        setUser(next); return next
      }
      const next = await client.me()
      setUser(next); return next
    } catch (reason) {
      setUser(undefined)
      if (config.mode === 'v1-demo' && reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) sessionStorage.removeItem(V1_TOKEN_KEY)
      if (!(reason instanceof ApiError && reason.status === 401)) setError('Không thể xác minh phiên đăng nhập. Vui lòng thử lại.')
      return undefined
    } finally { setLoading(false) }
  }, [client, config.mode])

  useEffect(() => { void refresh() }, [refresh])
  const portalUrl = useCallback((portal: Portal) => portal === 'owner' ? config.ownerUrl : config.operationsUrl, [config])
  const login = useCallback(async (persona?: Portal) => {
    setError(undefined)
    if (config.mode === 'mock') {
      if (!persona) return
      sessionStorage.setItem(MOCK_KEY, persona); setUser(mockUsers[persona]); return
    }
    if (config.mode === 'v1-demo') {
      if (!persona) return
      try {
        const result = await client.v1DemoLogin(persona === 'owner' ? 'owner' : 'admin')
        sessionStorage.setItem(V1_TOKEN_KEY, result.access_token)
        setUser(mapV1User(await client.v1Me()))
      } catch (reason) {
        setError(reason instanceof ApiError && reason.status === 404
          ? 'Backend đã tắt demo login. Hãy dùng chế độ session/OIDC cho production.'
          : 'Không thể đăng nhập vào backend V1. Hãy kiểm tra backend đang chạy.')
      }
      return
    }
    if (!config.loginUrl) { setError('Backend chưa cấu hình OIDC login URL.'); return }
    const url = new URL(config.loginUrl, config.apiBaseUrl)
    url.searchParams.set('return_to', `${location.origin}/auth/callback`)
    location.assign(url.toString())
  }, [client, config])
  const logout = useCallback(async () => {
    try {
      if (config.mode === 'mock') sessionStorage.removeItem(MOCK_KEY)
      else if (config.mode === 'v1-demo') sessionStorage.removeItem(V1_TOKEN_KEY)
      else await fetch(config.logoutUrl || `${config.apiBaseUrl.replace(/\/$/, '')}/api/v2/auth/logout`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } })
    } finally { setUser(undefined); location.assign('/login') }
  }, [config])
  return <AuthContext.Provider value={{ user, loading, error, config, login, logout, refresh, portalUrl }}>{children}</AuthContext.Provider>
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider missing'); return value }
function Shield() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4.5 6v5c0 5 3 8.5 7.5 10 4.5-1.5 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-4"/></svg> }

export function LoginPage({ portal }: { portal: Portal }) {
  const { user, loading, error, config, login, portalUrl } = useAuth()
  const locationState = useLocation().state as { from?: string } | null
  const choose = async (persona: Portal) => {
    if (persona !== portal) {
      const query = config.mode === 'v1-demo' ? 'demo_role' : 'mock_role'
      const target = portalUrl(persona)
      location.assign(`${target}${target.includes('?') ? '&' : '?'}${query}=${persona}`)
      return
    }
    await login(persona)
  }
  if (loading) return <AuthLoading/>
  if (user) {
    const target = canAccessPortal(user, portal) ? (locationState?.from || (portal === 'owner' ? '/overview' : '/admin')) : portalUrl(defaultPortal(user))
    if (/^https?:/.test(target)) { location.assign(target); return <AuthLoading/> }
    return <Navigate to={target} replace/>
  }
  const demoLabel = config.mode === 'v1-demo' ? 'Backend V1 demo — chọn vai trò để đăng nhập:' : 'Demo frontend — chọn luồng để xem giao diện:'
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span><Shield/></span><div><strong>CabinSentinel</strong><small>Connected safety platform</small></div></div><div className="auth-copy"><span className="auth-eyebrow">Đăng nhập an toàn</span><h1>{portal === 'owner' ? 'Theo dõi người thân trên mọi hành trình' : 'Điều hành hệ thống từ một control room'}</h1><p>Một tài khoản, hai không gian làm việc. Quyền truy cập được backend xác minh theo vai trò và quan hệ với phương tiện.</p></div>{error && <div className="auth-error" role="alert">{error}</div>}{config.mode === 'session' ? <button className="auth-primary" onClick={() => void login()}>Tiếp tục với tài khoản tổ chức</button> : <div className="auth-personas"><p>{demoLabel}</p><button onClick={() => void choose('owner')}><span>Chủ xe / Người chăm sóc</span><small>OWNER</small></button><button onClick={() => void choose('operations')}><span>Nhân viên vận hành</span><small>ADMIN</small></button></div>}<div className="auth-trust"><span><Shield/></span><p><strong>{config.mode === 'v1-demo' ? 'Token demo chỉ lưu trong sessionStorage.' : 'Phiên production dùng cookie HttpOnly.'}</strong><small>{config.mode === 'v1-demo' ? 'Backend tự tắt endpoint này trong production.' : 'Frontend không lưu access token nhạy cảm trong localStorage.'}</small></p></div></section><aside className="auth-visual"><span>CabinSentinel</span><h2>Phát hiện sớm.<br/>Phản ứng đúng.<br/>Bảo vệ riêng tư.</h2><div><b>01</b><p><strong>Edge-first</strong><small>Dữ liệu nhạy cảm được xử lý gần phương tiện.</small></p></div><div><b>02</b><p><strong>Role-aware</strong><small>Mỗi người chỉ thấy đúng tài nguyên được phép.</small></p></div><div><b>03</b><p><strong>Fail-safe</strong><small>Không bao giờ suy diễn trạng thái chưa xác minh là an toàn.</small></p></div></aside></main>
}

export function AuthCallback({ portal }: { portal: Portal }) { const { refresh, portalUrl } = useAuth(); const navigate = useNavigate(); const [failed, setFailed] = useState(false); useEffect(() => { void refresh().then(user => { if (!user) setFailed(true); else if (canAccessPortal(user, portal)) navigate(portal === 'owner' ? '/overview' : '/admin', { replace: true }); else location.assign(portalUrl(defaultPortal(user))) }) }, [navigate, portal, portalUrl, refresh]); return failed ? <main className="auth-message"><h1>Không thể hoàn tất đăng nhập</h1><p>Phiên chưa được backend xác minh.</p><a href="/login">Thử lại</a></main> : <AuthLoading/> }
export function RequirePortal({ portal, children }: { portal: Portal; children: ReactNode }) { const { user, loading, portalUrl } = useAuth(); const location = useLocation(); if (loading) return <AuthLoading/>; if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }}/>; if (!canAccessPortal(user, portal)) return <main className="auth-message"><h1>Bạn không có quyền vào portal này</h1><p>Vai trò hiện tại không được backend cấp quyền truy cập.</p><a href={portalUrl(defaultPortal(user))}>Đi tới không gian được phép</a></main>; return <>{children}</> }
export function PortalMenu() { const { user, logout, portalUrl } = useAuth(); if (!user) return null; return <div className="portal-menu"><span>{user.displayName.slice(0,2).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.roles.join(' · ')}</small></div>{canAccessPortal(user, 'owner') && <a href={portalUrl('owner')}>Owner</a>}{canAccessPortal(user, 'operations') && <a href={portalUrl('operations')}>Operations</a>}<button onClick={() => void logout()}>Đăng xuất</button></div> }
export function AuthLoading() { return <div className="auth-loading"><span/><span/><span/><p>Đang xác minh phiên…</p></div> }
