import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthLoading, canAccessPortal, defaultPortal, useAuth } from '@cabinsentinel/auth'
import { useLocale } from './i18n'
import { startAdminDemo } from './adminDemo'

function Shield() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4.5 6v5c0 5 3 8.5 7.5 10 4.5-1.5 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-4"/></svg>
}

export function OperationsLogin() {
  const { user, loading, error, config, login, portalUrl } = useAuth()
  const { locale, setLocale, bi } = useLocale()
  const locationState = useLocation().state as { from?: string } | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <AuthLoading/>
  if (user) {
    if (!canAccessPortal(user, 'operations')) {
      location.assign(portalUrl(defaultPortal(user)))
      return <AuthLoading/>
    }
    return <Navigate to={locationState?.from || '/admin'} replace/>
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    try { await login({ email, password }) } finally { setSubmitting(false) }
  }
  const demoLogin = async () => {
    setSubmitting(true)
    try { await login('operations') } finally { setSubmitting(false) }
  }

  return <main className="auth-page operations-login">
    <button className="login-locale-switch" onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}><strong>{locale.toUpperCase()}</strong><span>/ {locale === 'vi' ? 'EN' : 'VI'}</span></button>
    <section className="auth-card">
      <div className="auth-brand"><span><Shield/></span><div><strong>CabinSentinel</strong><small>{bi('Trung tâm vận hành an toàn', 'Safety operations center')}</small></div></div>
      <div className="auth-copy"><span className="auth-eyebrow">{bi('Khu vực được bảo vệ', 'Protected workspace')}</span><h1>{bi('Đăng nhập Admin & Operations', 'Admin & Operations sign in')}</h1><p>{bi('Truy cập hàng đợi sự cố, đội xe và các chức năng quản trị theo đúng quyền được backend cấp.', 'Access incident response, fleet operations and administration within your backend-authorized scope.')}</p></div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {config.mode === 'session' ? <form className="auth-form" onSubmit={submit}><label><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label><label><span>{bi('Mật khẩu', 'Password')}</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••••••"/></label><button className="auth-primary" type="submit" disabled={submitting}>{submitting ? bi('Đang đăng nhập…', 'Signing in…') : bi('Đăng nhập', 'Sign in')}</button><button className="auth-demo-button" type="button" onClick={startAdminDemo}>{bi('Xem giao diện với dữ liệu mẫu', 'Preview with sample data')}</button></form> : <div className="auth-form"><button className="auth-primary" type="button" disabled={submitting} onClick={() => void demoLogin()}>{submitting ? bi('Đang mở phiên demo…', 'Opening demo…') : bi('Vào Admin Demo', 'Enter Admin Demo')}</button></div>}
      <div className="auth-trust"><span><Shield/></span><p><strong>{bi('Quyền được xác minh ở backend', 'Backend-verified access')}</strong><small>{bi('Ẩn menu chỉ là lớp UX; mọi API vẫn được backend kiểm tra quyền.', 'Role-aware navigation is UX only; every API remains backend-authorized.')}</small></p></div>
    </section>
    <aside className="auth-visual"><span>CabinSentinel Control Plane</span><h2>{bi('Phát hiện. Điều phối. Xác minh.', 'Detect. Coordinate. Verify.')}</h2><div><b>01</b><p><strong>{bi('Vận hành an toàn', 'Safety operations')}</strong><small>{bi('Xử lý sự cố theo thời gian thực và không suy diễn dữ liệu thiếu là an toàn.', 'Respond to incidents in real time without inferring missing data as safe.')}</small></p></div><div><b>02</b><p><strong>{bi('Quản trị nền tảng', 'Platform administration')}</strong><small>{bi('Quản lý tổ chức, người dùng, thiết bị, model và ruleset.', 'Manage tenants, users, devices, models and rulesets.')}</small></p></div><div><b>03</b><p><strong>{bi('Audit đầy đủ', 'Audited actions')}</strong><small>{bi('Các thao tác nhạy cảm luôn có xác nhận và dấu vết kiểm toán.', 'Sensitive actions require confirmation and leave an audit trail.')}</small></p></div></aside>
  </main>
}
