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
  operations: { id: 'operator-demo', displayName: 'Control Operator', email: 'ops@demo.cabinsentinel.vn', roles: ['OPERATOR', 'AUDITOR'], permissions: ['operations:view', 'audit:view', 'vehicle:view'], vehicleIds: [] },
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
    try {
      if (config.mode === 'mock') sessionStorage.removeItem(MOCK_KEY)
      else if (config.mode === 'v1-demo') sessionStorage.removeItem(V1_TOKEN_KEY)
      else await client.v1PlatformLogout(csrfToken())
    } catch {
      // Local credentials are still cleared if the backend is temporarily unavailable.
    } finally {
      clearSession()
      setUser(undefined)
      location.assign('/login')
    }
  }, [client, config.mode])

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

  const demoLabel = config.mode === 'v1-demo' ? 'Backend V1 demo — chọn vai trò để đăng nhập:' : 'Demo frontend — chọn luồng để xem giao diện:'
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span><Shield/></span><div><strong>CabinSentinel</strong><small>Connected safety platform</small></div></div><div className="auth-copy"><span className="auth-eyebrow">Đăng nhập an toàn</span><h1>{portal === 'owner' ? 'Theo dõi người thân trên mọi hành trình' : 'Điều hành hệ thống từ một control room'}</h1><p>Một tài khoản, hai không gian làm việc. Quyền truy cập được backend xác minh theo vai trò và quan hệ với phương tiện.</p></div>{error && <div className="auth-error" role="alert">{error}</div>}{config.mode === 'session' ? <form className="auth-form" onSubmit={submit}><label><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label><label><span>Mật khẩu</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••••••"/></label><button className="auth-primary" type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button></form> : <div className="auth-personas"><p>{demoLabel}</p><button onClick={() => void choose('owner')}><span>Chủ xe / Người chăm sóc</span><small>OWNER</small></button><button onClick={() => void choose('operations')}><span>Nhân viên vận hành</span><small>ADMIN</small></button></div>}<div className="auth-trust"><span><Shield/></span><p><strong>{config.mode === 'v1-demo' ? 'Token demo chỉ lưu trong sessionStorage.' : 'Phiên production dùng refresh cookie HttpOnly.'}</strong><small>{config.mode === 'v1-demo' ? 'Backend tự tắt endpoint này trong production.' : 'Access token ngắn hạn không được lưu trong localStorage.'}</small></p></div></section><aside className="auth-visual"><span>CabinSentinel</span><h2>Phát hiện sớm.<br/>Phản ứng đúng.<br/>Bảo vệ riêng tư.</h2><div><b>01</b><p><strong>Edge-first</strong><small>Dữ liệu nhạy cảm được xử lý gần phương tiện.</small></p></div><div><b>02</b><p><strong>Role-aware</strong><small>Mỗi người chỉ thấy đúng tài nguyên được phép.</small></p></div><div><b>03</b><p><strong>Fail-safe</strong><small>Không bao giờ suy diễn trạng thái chưa xác minh là an toàn.</small></p></div></aside></main>
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

export function RequirePortal({ portal, children }: { portal: Portal; children: ReactNode }) {
  const { user, loading, portalUrl } = useAuth()
  const location = useLocation()
  if (loading) return <AuthLoading/>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }}/>
  if (!canAccessPortal(user, portal)) return <main className="auth-message"><h1>Bạn không có quyền vào portal này</h1><p>Vai trò hiện tại không được backend cấp quyền truy cập.</p><a href={portalUrl(defaultPortal(user))}>Đi tới không gian được phép</a></main>
  return <>{children}</>
}

export function PortalMenu() {
  const { user, logout, portalUrl } = useAuth()
  if (!user) return null
  return <div className="portal-menu"><span>{user.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.roles.join(' · ')}</small></div>{canAccessPortal(user, 'owner') && <a href={portalUrl('owner')}>Owner</a>}{canAccessPortal(user, 'operations') && <a href={portalUrl('operations')}>Operations</a>}<button onClick={() => void logout()}>Đăng xuất</button></div>
}

export function AuthLoading() {
  return <div className="auth-loading"><span/><span/><span/><p>Đang xác minh phiên…</p></div>
}
