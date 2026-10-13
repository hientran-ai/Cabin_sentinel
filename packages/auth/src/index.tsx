import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, CabinSentinelClient } from '@cabinsentinel/api-client'
import type { Permission, User, V1Me, V1PlatformUser, V1SessionResponse } from '@cabinsentinel/contracts'

export type Portal = 'owner' | 'operations'
export type AuthMode = 'session' | 'v1-demo' | 'mock'
export type AuthErrorCode = 'session_verification_failed' | 'credentials_required' | 'demo_disabled' | 'demo_unavailable' | 'wrong_portal_operations' | 'wrong_portal_owner' | 'invalid_credentials' | 'rate_limited' | 'login_unavailable'
export interface AuthConfig {
  apiBaseUrl: string; mode: AuthMode; ownerUrl: string; operationsUrl: string
  /** Cabin Noir mobile web. When set, the "User" choice signs in there (phone number + one-time code) instead of with email. */
  mobileAppUrl?: string
}

export const DEFAULT_MOBILE_APP_URL = 'https://cabin-noir.duckdns.org/app/'

/** Where a family user signs in: the Cabin Noir mobile web when configured (https only, or localhost while developing). */
export function mobileSignInUrl(config: Pick<AuthConfig, 'mobileAppUrl'>): string | undefined {
  const raw = config.mobileAppUrl?.trim()
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    return url.protocol === 'https:' || (local && url.protocol === 'http:') ? url.toString() : undefined
  } catch {
    return undefined
  }
}
export interface LoginCredentials { email: string; password: string }

export function loginMethodForPortal(portal: Portal, config: AuthConfig): 'mobile-app' | 'credentials' | 'demo' {
  if (portal === 'owner' && mobileSignInUrl(config)) return 'mobile-app'
  return config.mode === 'session' ? 'credentials' : 'demo'
}
interface AuthValue {
  user?: User
  loading: boolean
  error?: AuthErrorCode
  config: AuthConfig
  login: (input?: Portal | LoginCredentials, expectedPortal?: Portal) => Promise<void>
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
  const [error, setError] = useState<AuthErrorCode>()
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
        setError('session_verification_failed')
      }
      return undefined
    } finally {
      setLoading(false)
    }
  }, [client, config.apiBaseUrl, config.mode])

  useEffect(() => { void refresh() }, [refresh])
  const portalUrl = useCallback((portal: Portal) => portal === 'owner' ? config.ownerUrl : config.operationsUrl, [config])

  const login = useCallback(async (input?: Portal | LoginCredentials, expectedPortal?: Portal) => {
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
        setError(reason instanceof ApiError && reason.status === 404 ? 'demo_disabled' : 'demo_unavailable')
      }
      return
    }
    if (!input || typeof input === 'string') {
      setError('credentials_required')
      return
    }
    try {
      const session = await client.v1PlatformLogin(input.email.trim(), input.password)
      storeSession(session)
      const next = mapV1User(await client.v1Me(), session.user)
      if (expectedPortal && !canAccessPortal(next, expectedPortal)) {
        try { await client.v1PlatformLogout(csrfToken()) } catch { /* The local session is still rejected below. */ }
        clearSession()
        setUser(undefined)
        setError(expectedPortal === 'operations' ? 'wrong_portal_operations' : 'wrong_portal_owner')
        return
      }
      setUser(next)
    } catch (reason) {
      clearSession()
      setError(reason instanceof ApiError && reason.status === 401
        ? 'invalid_credentials'
        : reason instanceof ApiError && reason.status === 429 ? 'rate_limited' : 'login_unavailable')
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

export const UNIFIED_LOGIN_PATH = '/admin/login'

export function safeReturnPath(value?: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined
  try {
    const parsed = new URL(value, 'https://cabinsentinel.local')
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    if (['/login', '/user/login', '/admin/login', '/signin', '/sign-in'].includes(parsed.pathname.replace(/\/+$/, '') || '/')) return undefined
    return path
  } catch {
    return undefined
  }
}

export function portalForPath(path: string): Portal {
  return path === '/admin' || path.startsWith('/admin/') ? 'operations' : 'owner'
}

export function UnifiedLoginRedirect() {
  const routeLocation = useLocation()
  const locationState = routeLocation.state as { from?: string } | null
  useEffect(() => {
    const from = safeReturnPath(locationState?.from)
    const target = from ? `${UNIFIED_LOGIN_PATH}?from=${encodeURIComponent(from)}` : UNIFIED_LOGIN_PATH
    window.location.replace(target)
  }, [locationState?.from])
  return <AuthLoading/>
}

type LoginLocale = 'vi' | 'en'
const loginCopy = {
  vi: {
    brand: 'Hệ thống an toàn kết nối', language: 'English', eyebrow: 'Chào mừng trở lại', title: 'Đăng nhập vào hệ thống',
    intro: 'Một tài khoản, một trang đăng nhập. Chọn không gian bạn muốn truy cập; quyền thực tế luôn do backend xác minh.',
    roleLabel: 'Bạn muốn truy cập không gian', user: 'User', userDetail: 'Theo dõi phương tiện và cảnh báo', admin: 'Admin', adminDetail: 'Quản trị và vận hành hệ thống',
    email: 'Email', password: 'Mật khẩu', show: 'Hiện', hide: 'Ẩn', showPassword: 'Hiện mật khẩu', hidePassword: 'Ẩn mật khẩu',
    signingIn: 'Đang xác minh…', signIn: (role: string) => `Đăng nhập với vai trò ${role}`, opening: 'Đang mở phiên…', continue: (role: string) => `Tiếp tục với vai trò ${role}`,
    demoHint: 'Chế độ demo chỉ dùng phiên mô phỏng và không thay đổi cơ chế đăng nhập production.',
    sessionSafe: 'Phiên đăng nhập được bảo vệ an toàn.', sessionSafeDetail: 'Vai trò thật được backend xác minh sau khi đăng nhập.',
    demoSafe: 'Token demo chỉ lưu trong sessionStorage.', demoSafeDetail: 'Backend tự tắt endpoint demo trong môi trường production.',
    hero: <>Một cổng đăng nhập.<br/>Hai vai trò.<br/>Đúng quyền truy cập.</>,
    mobileTitle: 'Chủ xe và người thân dùng Cabin Noir', mobileDetail: 'Đăng nhập bằng số điện thoại, mã một lần gửi qua Telegram. Mở được trên điện thoại và máy tính.', mobileOpen: 'Mở Cabin Noir', mobileNote: 'Không cần email. Tài khoản Cabin Noir tách riêng với tài khoản quản trị.',
    adminHero: 'Quản trị người dùng, phương tiện và toàn bộ hệ thống.', userHero: 'Theo dõi phương tiện, trạng thái cabin và các cảnh báo.', rbac: 'Bảo mật theo vai trò', rbacHero: 'Mỗi tài khoản chỉ thấy dữ liệu và chức năng được cấp phép.',
  },
  en: {
    brand: 'Connected safety system', language: 'Tiếng Việt', eyebrow: 'Welcome back', title: 'Sign in to CabinSentinel',
    intro: 'One account, one login page. Choose the workspace you want; the backend always verifies your actual access.',
    roleLabel: 'Choose a workspace', user: 'User', userDetail: 'Monitor vehicles and alerts', admin: 'Admin', adminDetail: 'Manage and operate the system',
    email: 'Email', password: 'Password', show: 'Show', hide: 'Hide', showPassword: 'Show password', hidePassword: 'Hide password',
    signingIn: 'Verifying…', signIn: (role: string) => `Sign in as ${role}`, opening: 'Opening session…', continue: (role: string) => `Continue as ${role}`,
    demoHint: 'Demo mode uses a simulated session and does not change production authentication.',
    sessionSafe: 'Your session is securely protected.', sessionSafeDetail: 'The backend verifies your actual role after sign-in.',
    demoSafe: 'The demo token stays in sessionStorage.', demoSafeDetail: 'The backend disables demo login in production.',
    hero: <>One login gateway.<br/>Two workspaces.<br/>Verified access.</>,
    mobileTitle: 'Owners and family use Cabin Noir', mobileDetail: 'Sign in with your phone number and a one-time code sent over Telegram. Works on phones and computers.', mobileOpen: 'Open Cabin Noir', mobileNote: 'No email needed. Cabin Noir accounts are separate from admin accounts.',
    adminHero: 'Manage users, vehicles and system operations.', userHero: 'Monitor vehicles, cabin status and safety alerts.', rbac: 'Role-based security', rbacHero: 'Each account only sees authorized data and capabilities.',
  },
} as const

const authErrorCopy: Record<LoginLocale, Record<AuthErrorCode, string>> = {
  vi: {
    session_verification_failed: 'Không thể xác minh phiên đăng nhập. Vui lòng thử lại.', credentials_required: 'Vui lòng nhập email và mật khẩu.',
    demo_disabled: 'Backend đã tắt demo login. Hãy dùng chế độ session cho production.', demo_unavailable: 'Không thể đăng nhập vào backend V1. Hãy kiểm tra backend đang chạy.',
    wrong_portal_operations: 'Tài khoản này không có quyền Admin hoặc Operations.', wrong_portal_owner: 'Tài khoản này không có quyền truy cập không gian User.',
    invalid_credentials: 'Email hoặc mật khẩu không đúng.', rate_limited: 'Đăng nhập tạm thời bị giới hạn. Vui lòng thử lại sau.', login_unavailable: 'Không thể đăng nhập. Hãy kiểm tra kết nối backend và thử lại.',
  },
  en: {
    session_verification_failed: 'Your session could not be verified. Please try again.', credentials_required: 'Enter your email and password.',
    demo_disabled: 'Demo login is disabled by the backend. Use session mode in production.', demo_unavailable: 'The V1 backend is unavailable. Check the backend and try again.',
    wrong_portal_operations: 'This account does not have Admin or Operations access.', wrong_portal_owner: 'This account does not have access to the User workspace.',
    invalid_credentials: 'The email or password is incorrect.', rate_limited: 'Sign-in is temporarily rate limited. Please try again later.', login_unavailable: 'Unable to sign in. Check the backend connection and try again.',
  },
}

export function LoginPage({ portal }: { portal: Portal }) {
  const { user, loading, error, config, login, portalUrl } = useAuth()
  const routeLocation = useLocation()
  const locationState = routeLocation.state as { from?: string } | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedPortal, setSelectedPortal] = useState<Portal>(portal)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [locale, setLocale] = useState<LoginLocale>(() => {
    const saved = localStorage.getItem('cs_login_locale')
    return saved === 'en' || saved === 'vi' ? saved : navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
  })
  const copy = loginCopy[locale]
  const mobileUrl = mobileSignInUrl(config)
  const loginMethod = loginMethodForPortal(selectedPortal, config)

  useEffect(() => {
    localStorage.setItem('cs_login_locale', locale)
    document.documentElement.lang = locale
  }, [locale])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    try { await login({ email, password }, selectedPortal) } finally { setSubmitting(false) }
  }
  const demoLogin = async () => {
    setSubmitting(true)
    try { await login(selectedPortal) } finally { setSubmitting(false) }
  }

  if (loading) return <AuthLoading/>
  if (user) {
    const destination = defaultPortal(user)
    const queryFrom = new URLSearchParams(routeLocation.search).get('from')
    const requested = safeReturnPath(locationState?.from || queryFrom)
    const target = requested && canAccessPortal(user, portalForPath(requested))
      ? requested
      : destination === 'owner' ? '/overview' : '/admin'
    if (portalForPath(target) !== portal) {
      location.assign(requested ? new URL(target, window.location.origin).toString() : portalUrl(destination))
      return <AuthLoading/>
    }
    return <Navigate to={target} replace/>
  }

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><img className="brand-logo" src="cabinsentinel-logo.png" alt="CabinSentinel"/><div><strong>CabinSentinel</strong><small>{copy.brand}</small></div><button className="auth-language" type="button" onClick={() => setLocale(value => value === 'vi' ? 'en' : 'vi')} aria-label={copy.language}>{copy.language}</button></div>
      <div className="auth-copy">
        <span className="auth-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </div>

      <div className="auth-role-picker">
        <p id="auth-role-label">{copy.roleLabel}</p>
        <div role="tablist" aria-labelledby="auth-role-label">
          <button type="button" role="tab" className={selectedPortal === 'owner' ? 'is-active' : ''} aria-selected={selectedPortal === 'owner'} onClick={() => setSelectedPortal('owner')}>
            <span className="auth-role-icon auth-role-user">U</span>
            <span><strong>{copy.user}</strong><small>{copy.userDetail}</small></span>
          </button>
          <button type="button" role="tab" className={selectedPortal === 'operations' ? 'is-active' : ''} aria-selected={selectedPortal === 'operations'} onClick={() => setSelectedPortal('operations')}>
            <span className="auth-role-icon"><Shield/></span>
            <span><strong>{copy.admin}</strong><small>{copy.adminDetail}</small></span>
          </button>
        </div>
      </div>

      {error && <div className="auth-error" role="alert">{authErrorCopy[locale][error]}</div>}
      {loginMethod === 'mobile-app' && mobileUrl ? <div className="auth-mobile">
        <p className="auth-mobile-title">{copy.mobileTitle}</p>
        <p className="auth-mobile-detail">{copy.mobileDetail}</p>
        <a className="auth-primary auth-mobile-open" href={mobileUrl}>{copy.mobileOpen}</a>
        <p className="auth-mobile-note">{copy.mobileNote}</p>
      </div> : loginMethod === 'credentials' ? <form className="auth-form" onSubmit={submit}>
        <label><span>{copy.email}</span><input type="email" inputMode="email" autoComplete="username" required disabled={submitting} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
        <label><span>{copy.password}</span><div className="auth-password"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={submitting} value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••••••"/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? copy.hidePassword : copy.showPassword} aria-pressed={showPassword}>{showPassword ? copy.hide : copy.show}</button></div></label>
        <button className="auth-primary" type="submit" disabled={submitting} aria-busy={submitting}>{submitting && <span className="auth-button-spinner" aria-hidden="true"/>}{submitting ? copy.signingIn : copy.signIn(selectedPortal === 'operations' ? copy.admin : copy.user)}</button>
      </form> : <div className="auth-demo-login"><p className="auth-demo-hint">{copy.demoHint}</p><button className="auth-primary" type="button" disabled={submitting} onClick={() => void demoLogin()}>{submitting ? copy.opening : copy.continue(selectedPortal === 'operations' ? copy.admin : copy.user)}</button></div>}

      <div className="auth-trust"><span><Shield/></span><p><strong>{config.mode === 'v1-demo' ? copy.demoSafe : copy.sessionSafe}</strong><small>{config.mode === 'v1-demo' ? copy.demoSafeDetail : copy.sessionSafeDetail}</small></p></div>
    </section>
    <aside className="auth-visual">
      <span>CabinSentinel</span>
      <div className="auth-visual-art" aria-hidden="true">
        <i className="auth-orbit auth-orbit-one"/>
        <i className="auth-orbit auth-orbit-two"/>
        <div className="auth-visual-console">
          <header><span/><span/><span/><b>LIVE</b></header>
          <div className="auth-console-grid">
            <i/><i/><i/>
          </div>
          <div className="auth-console-chart"><span/><span/><span/><span/><span/><span/></div>
        </div>
        <div className="auth-visual-signal"><i/><span>Cabin protected</span><b>99.9%</b></div>
      </div>
      <h2>{copy.hero}</h2>
      <div><b>01</b><p><strong>{copy.admin}</strong><small>{copy.adminHero}</small></p></div>
      <div><b>02</b><p><strong>{copy.user}</strong><small>{copy.userHero}</small></p></div>
      <div><b>03</b><p><strong>{copy.rbac}</strong><small>{copy.rbacHero}</small></p></div>
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
