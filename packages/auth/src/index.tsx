import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, CabinSentinelClient } from '@cabinsentinel/api-client'
import type { Permission, User, V1Me, V1PlatformUser, V1SessionResponse } from '@cabinsentinel/contracts'

export type Portal = 'owner' | 'operations'
export type AuthMode = 'session' | 'v1-demo' | 'mock'
export interface AuthConfig { apiBaseUrl: string; mode: AuthMode; ownerUrl: string; operationsUrl: string }
export interface LoginCredentials { email: string; password: string }
interface AuthValue {
  user?: User
  loading: boolean
  error?: string
  config: AuthConfig
  login: (input?: Portal | LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<User | undefined>
  portalUrl: (portal: Portal) => string
}

const AuthContext = createContext<AuthValue | null>(null)
const MOCK_KEY = 'cs_mock_persona'
const V1_TOKEN_KEY = 'cs_v1_demo_access_token'
const SESSION_ACCESS_KEY = 'cs_session_access_token'
const SESSION_EXPIRY_KEY = 'cs_session_access_expires_at'
const SESSION_PROFILE_KEY = 'cs_session_profile'
let refreshPromise: Promise<string | undefined> | undefined

const mockUsers: Record<Portal, User> = {
  owner: { id: 'owner-demo', displayName: 'Thu Hiền', email: 'owner@demo.cabinsentinel.vn', roles: ['OWNER'], permissions: ['vehicle:view', 'incident:acknowledge'], vehicleIds: ['CAR_1', 'CAR_2'] },
  operations: { id: 'admin-demo', displayName: 'Thu Hiền · Demo Admin', email: 'admin@demo.cabinsentinel.vn', roles: ['ADMIN'], permissions: ['operations:view', 'audit:view', 'users:manage', 'models:manage', 'vehicle:view'], vehicleIds: ['VF8-HN-0188', 'VF9-HCM-2205', 'VF6-DN-7712', 'VF7-HN-9090'] },
}

export function getV1DemoAccessToken() { return sessionStorage.getItem(V1_TOKEN_KEY) || undefined }

function csrfToken() {
  const match = document.cookie.split('; ').find(value => value.startsWith('cs_csrf='))
  return match ? decodeURIComponent(match.slice('cs_csrf='.length)) : ''
}

function storeSession(session: V1SessionResponse) {
  sessionStorage.setItem(SESSION_ACCESS_KEY, session.access_token)
  sessionStorage.setItem(SESSION_EXPIRY_KEY, session.expires_at)
  sessionStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(session.user))
}

function clearSession() {
  sessionStorage.removeItem(SESSION_ACCESS_KEY)
  sessionStorage.removeItem(SESSION_EXPIRY_KEY)
  sessionStorage.removeItem(SESSION_PROFILE_KEY)
}

function storedProfile(): V1PlatformUser | undefined {
  try {
    const value = sessionStorage.getItem(SESSION_PROFILE_KEY)
    return value ? JSON.parse(value) as V1PlatformUser : undefined
  } catch {
    return undefined
  }
}

/** Returns a short-lived access token and rotates the HttpOnly refresh cookie when needed. */
export async function getPortalAccessToken(apiBaseUrl: string, mode: AuthMode): Promise<string | undefined> {
  if (mode === 'v1-demo') return getV1DemoAccessToken()
  if (mode !== 'session') return undefined

  const token = sessionStorage.getItem(SESSION_ACCESS_KEY) || undefined
  const expiresAt = Date.parse(sessionStorage.getItem(SESSION_EXPIRY_KEY) || '')
  if (token && Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) return token
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const client = new CabinSentinelClient({ baseUrl: apiBaseUrl, credentials: 'include' })
      const session = await client.v1PlatformRefresh(csrfToken())
      storeSession(session)
      return session.access_token
    } catch (reason) {
      if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) clearSession()
      return undefined
    } finally {
      refreshPromise = undefined
    }
  })()
  return refreshPromise
}

function permissionsFor(role: V1Me['role']): Permission[] {
  if (role === 'admin') return ['operations:view', 'audit:view', 'users:manage', 'models:manage', 'vehicle:view']
  if (role === 'operator') return ['operations:view', 'audit:view', 'vehicle:view', 'incident:acknowledge']
  return ['vehicle:view', 'incident:acknowledge']
}

export function mapV1User(me: V1Me, profile?: V1PlatformUser): User {
  const role = me.role === 'admin' ? 'ADMIN'
    : me.role === 'operator' ? 'OPERATOR'
      : me.role === 'caregiver' || me.role === 'guardian' ? 'CAREGIVER'
        : 'OWNER'
  return {
    id: me.subject,
    displayName: profile?.full_name || (role === 'ADMIN' ? 'Fleet Admin' : me.subject === 'demo-owner' ? 'Demo Owner' : me.subject),
    email: profile?.email || `${me.subject}@demo.cabinsentinel.local`,
    roles: [role],
    permissions: permissionsFor(me.role),
    vehicleIds: me.vehicle_ids,
  }
}

export function canAccessPortal(user: User | undefined, portal: Portal) {
  if (!user) return false
  return portal === 'owner'
    ? user.roles.some(role => role === 'OWNER' || role === 'CAREGIVER')
    : user.roles.some(role => role === 'OPERATOR' || role === 'ADMIN' || role === 'AUDITOR')
}

export function defaultPortal(user: User | undefined): Portal {
  return canAccessPortal(user, 'operations') && !canAccessPortal(user, 'owner') ? 'operations' : 'owner'
}

export function AuthProvider({ config, children }: { config: AuthConfig; children: ReactNode }) {
  const [user, setUser] = useState<User>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const client = useMemo(() => new CabinSentinelClient({
    baseUrl: config.apiBaseUrl,
    credentials: config.mode === 'mock' ? 'omit' : 'include',
    getAccessToken: () => getPortalAccessToken(config.apiBaseUrl, config.mode),
  }), [config.apiBaseUrl, config.mode])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      if (config.mode === 'mock') {
        const requested = new URLSearchParams(location.search).get('mock_role') as Portal | null
        const stored = sessionStorage.getItem(MOCK_KEY) as Portal | null
        const persona = requested === 'owner' || requested === 'operations' ? requested : stored
        const next = persona ? mockUsers[persona] : undefined
        if (requested) sessionStorage.setItem(MOCK_KEY, requested)
        setUser(next)
        return next
      }
      if (config.mode === 'v1-demo') {
        const requested = new URLSearchParams(location.search).get('demo_role') as Portal | null
        if (requested === 'owner' || requested === 'operations') {
          const login = await client.v1DemoLogin(requested === 'owner' ? 'owner' : 'admin')
          sessionStorage.setItem(V1_TOKEN_KEY, login.access_token)
        }
        if (!getV1DemoAccessToken()) { setUser(undefined); return undefined }
      } else if (!await getPortalAccessToken(config.apiBaseUrl, config.mode)) {
        setUser(undefined)
        return undefined
      }
      const next = mapV1User(await client.v1Me(), config.mode === 'session' ? storedProfile() : undefined)
      setUser(next)
      return next
    } catch (reason) {
      setUser(undefined)
      if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
        if (config.mode === 'v1-demo') sessionStorage.removeItem(V1_TOKEN_KEY)
        if (config.mode === 'session') clearSession()
      } else {
        setError('Không thể xác minh phiên đăng nhập. Vui lòng thử lại.')
      }
      return undefined
    } finally {
      setLoading(false)
    }
  }, [client, config.apiBaseUrl, config.mode])

  useEffect(() => { void refresh() }, [refresh])
  const portalUrl = useCallback((portal: Portal) => portal === 'owner' ? config.ownerUrl : config.operationsUrl, [config])

  const login = useCallback(async (input?: Portal | LoginCredentials) => {
    setError(undefined)
    if (config.mode === 'mock') {
      if (typeof input !== 'string') return
      sessionStorage.setItem(MOCK_KEY, input)
      setUser(mockUsers[input])
      return
    }
    if (config.mode === 'v1-demo') {
      if (typeof input !== 'string') return
      try {
        const result = await client.v1DemoLogin(input === 'owner' ? 'owner' : 'admin')
        sessionStorage.setItem(V1_TOKEN_KEY, result.access_token)
        setUser(mapV1User(await client.v1Me()))
      } catch (reason) {
        setError(reason instanceof ApiError && reason.status === 404
          ? 'Backend đã tắt demo login. Hãy dùng chế độ session cho production.'
          : 'Không thể đăng nhập vào backend V1. Hãy kiểm tra backend đang chạy.')
      }
      return
    }
    if (!input || typeof input === 'string') {
      setError('Vui lòng nhập email và mật khẩu.')
      return
    }
    try {
      const session = await client.v1PlatformLogin(input.email.trim(), input.password)
      storeSession(session)
      const next = mapV1User(await client.v1Me(), session.user)
      setUser(next)
    } catch (reason) {
      clearSession()
      setError(reason instanceof ApiError && reason.status === 401
        ? 'Email hoặc mật khẩu không đúng.'
        : reason instanceof ApiError && reason.status === 429
          ? 'Đăng nhập tạm thời bị giới hạn. Vui lòng thử lại sau.'
          : 'Không thể đăng nhập. Hãy kiểm tra kết nối backend và thử lại.')
    }
  }, [client, config.mode])

  const logout = useCallback(async () => {
    const loginTarget = portalUrl(defaultPortal(user))
    try {
      if (config.mode === 'mock') sessionStorage.removeItem(MOCK_KEY)
      else if (config.mode === 'v1-demo') sessionStorage.removeItem(V1_TOKEN_KEY)
      else await client.v1PlatformLogout(csrfToken())
    } catch {
      // Local credentials are still cleared if the backend is temporarily unavailable.
    } finally {
      clearSession()
      setUser(undefined)
      // Each portal may be hosted under a different base path (Operations uses /admin/).
      // Returning to its configured entry point lets RequirePortal resolve the correct login route.
      location.assign(loginTarget)
    }
  }, [client, config.mode, portalUrl, user])

  return <AuthContext.Provider value={{ user, loading, error, config, login, logout, refresh, portalUrl }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider missing')
  return value
}

function Shield() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4.5 6v5c0 5 3 8.5 7.5 10 4.5-1.5 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
}

export function LoginPage({ portal }: { portal: Portal }) {
  const { user, loading, error, config, login, portalUrl } = useAuth()
  const locationState = useLocation().state as { from?: string } | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const choose = async (persona: Portal) => {
    if (persona !== portal) {
      const query = config.mode === 'v1-demo' ? 'demo_role' : 'mock_role'
      const target = portalUrl(persona)
      location.assign(`${target}${target.includes('?') ? '&' : '?'}${query}=${persona}`)
      return
    }
    await login(persona)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    try { await login({ email, password }) } finally { setSubmitting(false) }
  }

  if (loading) return <AuthLoading/>
  if (user) {
    const target = canAccessPortal(user, portal) ? (locationState?.from || (portal === 'owner' ? '/overview' : '/admin')) : portalUrl(defaultPortal(user))
    if (/^https?:/.test(target)) { location.assign(target); return <AuthLoading/> }
    return <Navigate to={target} replace/>
  }

  const selectRole = (persona: Portal) => {
    if (config.mode === 'session') {
      if (persona !== portal) location.assign(portalUrl(persona))
      return
    }
    void choose(persona)
  }

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><span><Shield/></span><div><strong>CabinSentinel</strong><small>Hệ thống an toàn kết nối</small></div></div>
      <div className="auth-copy">
        <span className="auth-eyebrow">Chào mừng trở lại</span>
        <h1>Đăng nhập vào hệ thống</h1>
        <p>Chọn đúng loại tài khoản để truy cập không gian làm việc dành riêng cho bạn.</p>
      </div>

      <div className="auth-role-picker" aria-label="Chọn loại tài khoản">
        <p>Bạn đăng nhập với vai trò</p>
        <div>
          <button type="button" className={portal === 'operations' ? 'is-active' : ''} aria-pressed={portal === 'operations'} onClick={() => selectRole('operations')}>
            <span className="auth-role-icon"><Shield/></span>
            <span><strong>Admin</strong><small>Quản trị và vận hành hệ thống</small></span>
            <b>ADMIN</b>
          </button>
          <button type="button" className={portal === 'owner' ? 'is-active' : ''} aria-pressed={portal === 'owner'} onClick={() => selectRole('owner')}>
            <span className="auth-role-icon auth-role-user">U</span>
            <span><strong>User</strong><small>Theo dõi phương tiện và cảnh báo</small></span>
            <b>USER</b>
          </button>
        </div>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {config.mode === 'session' ? <form className="auth-form" onSubmit={submit}>
        <label><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
        <label><span>Mật khẩu</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••••••"/></label>
        <button className="auth-primary" type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : `Đăng nhập với vai trò ${portal === 'operations' ? 'Admin' : 'User'}`}</button>
      </form> : <p className="auth-demo-hint">Chế độ demo: chọn Admin hoặc User phía trên để vào hệ thống.</p>}

      <div className="auth-trust"><span><Shield/></span><p><strong>{config.mode === 'v1-demo' ? 'Token demo chỉ lưu trong sessionStorage.' : 'Phiên đăng nhập được bảo vệ an toàn.'}</strong><small>{config.mode === 'v1-demo' ? 'Backend tự tắt endpoint demo trong môi trường production.' : 'Vai trò thật được backend xác minh sau khi đăng nhập.'}</small></p></div>
    </section>
    <aside className="auth-visual">
      <span>CabinSentinel</span><h2>Một cổng đăng nhập.<br/>Hai vai trò.<br/>Đúng quyền truy cập.</h2>
      <div><b>01</b><p><strong>Admin</strong><small>Quản trị người dùng, phương tiện và toàn bộ hệ thống.</small></p></div>
      <div><b>02</b><p><strong>User</strong><small>Theo dõi phương tiện, trạng thái cabin và các cảnh báo.</small></p></div>
      <div><b>03</b><p><strong>Bảo mật theo vai trò</strong><small>Mỗi tài khoản chỉ thấy dữ liệu và chức năng được cấp phép.</small></p></div>
    </aside>
  </main>
}

export function AuthCallback({ portal }: { portal: Portal }) {
  const { refresh, portalUrl } = useAuth()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  useEffect(() => { void refresh().then(user => {
    if (!user) setFailed(true)
    else if (canAccessPortal(user, portal)) navigate(portal === 'owner' ? '/overview' : '/admin', { replace: true })
    else location.assign(portalUrl(defaultPortal(user)))
  }) }, [navigate, portal, portalUrl, refresh])
  return failed ? <main className="auth-message"><h1>Không thể hoàn tất đăng nhập</h1><p>Phiên chưa được backend xác minh.</p><a href="/login">Thử lại</a></main> : <AuthLoading/>
}

export function RequirePortal({ portal, children, loginPath = '/login' }: { portal: Portal; children: ReactNode; loginPath?: string }) {
  const { user, loading, portalUrl } = useAuth()
  const location = useLocation()
  if (loading) return <AuthLoading/>
  if (!user) return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }}/>
  if (!canAccessPortal(user, portal)) return <main className="auth-message"><h1>Bạn không có quyền vào portal này</h1><p>Vai trò hiện tại không được backend cấp quyền truy cập.</p><a href={portalUrl(defaultPortal(user))}>Đi tới không gian được phép</a></main>
  return <>{children}</>
}

export function PortalMenu() {
  const { user, logout, portalUrl } = useAuth()
  if (!user) return null
  return <div className="portal-menu"><span>{user.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.roles.join(' · ')}</small></div>{canAccessPortal(user, 'owner') && <a href={portalUrl('owner')}>User</a>}{canAccessPortal(user, 'operations') && <a href={portalUrl('operations')}>Admin</a>}<button onClick={() => void logout()}>Đăng xuất</button></div>
}

export function AuthLoading() {
  return <div className="auth-loading"><span/><span/><span/><p>Đang xác minh phiên…</p></div>
}
