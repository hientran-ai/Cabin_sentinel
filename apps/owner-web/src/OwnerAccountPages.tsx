import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, type JsonRecord } from '@cabinsentinel/api-client'
import { ownerPlatformClient } from './ownerRepository'
import type { Locale } from './model'

const string = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const errorText = (error: unknown, vi: boolean) => error instanceof ApiError ? error.message : vi ? 'Không thể hoàn tất yêu cầu.' : 'The request could not be completed.'

function Notice({ error, success, vi }: { error?: unknown; success?: boolean; vi: boolean }) {
  if (error) return <div className="account-notice is-error">{errorText(error, vi)}</div>
  if (success) return <div className="account-notice is-success">{vi ? 'Đã lưu theo phản hồi của backend.' : 'Saved from the authoritative backend response.'}</div>
  return null
}

export function NotificationSettingsPage({ locale }: { locale: Locale }) {
  const vi = locale === 'vi'
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['platform-notification-settings'], queryFn: () => ownerPlatformClient.v1NotificationSettings() })
  const [form, setForm] = useState({ push: true, sms: false, email: true, quiet: false, start: '22:00', end: '07:00', critical: true })
  useEffect(() => {
    if (!query.data) return
    const quiet = query.data.quiet_hours && typeof query.data.quiet_hours === 'object' ? query.data.quiet_hours as JsonRecord : {}
    setForm({ push: query.data.push === true, sms: query.data.sms === true, email: query.data.email === true, quiet: quiet.enabled === true, start: string(quiet.start, '22:00'), end: string(quiet.end, '07:00'), critical: query.data.critical_overrides_quiet_hours !== false })
  }, [query.data])
  const save = useMutation({
    mutationFn: () => ownerPlatformClient.v1UpdateNotificationSettings({ push: form.push, sms: form.sms, email: form.email, quiet_hours: { enabled: form.quiet, start: form.start, end: form.end }, critical_overrides_quiet_hours: form.critical }),
    onSuccess: data => queryClient.setQueryData(['platform-notification-settings'], data),
  })
  if (query.isLoading) return <div className="loading-state"><span/><span/><span/></div>
  if (query.isError) return <div className="owner-fail-state"><strong>{vi ? 'Không tải được cài đặt' : 'Settings unavailable'}</strong><button onClick={() => void query.refetch()}>{vi ? 'Thử lại' : 'Retry'}</button></div>
  const toggle = (key: 'push' | 'sms' | 'email' | 'quiet' | 'critical') => setForm(current => ({ ...current, [key]: !current[key] }))
  return <div className="page-enter"><div className="page-heading"><div><span className="eyebrow">{vi ? 'Thông báo' : 'Notifications'}</span><h1>{vi ? 'Cài đặt thông báo' : 'Notification settings'}</h1><p>{vi ? 'Các lựa chọn này được lưu trực tiếp vào tài khoản backend.' : 'These preferences are stored against your backend account.'}</p></div></div><div className="settings-grid"><section className="surface settings-card"><h2>{vi ? 'Kênh nhận cảnh báo' : 'Alert channels'}</h2><Toggle label="Push" detail={vi ? 'Thông báo ưu tiên trên thiết bị' : 'Priority device alerts'} checked={form.push} onChange={() => toggle('push')}/><Toggle label="SMS" detail={vi ? 'Yêu cầu số liên hệ đã xác minh' : 'Requires a verified contact'} checked={form.sms} onChange={() => toggle('sms')}/><Toggle label="Email" detail={vi ? 'Thông báo qua email tài khoản' : 'Account email notifications'} checked={form.email} onChange={() => toggle('email')}/><Toggle label={vi ? 'Giờ yên lặng' : 'Quiet hours'} detail={`${form.start} – ${form.end}`} checked={form.quiet} onChange={() => toggle('quiet')}/><Toggle label={vi ? 'Luôn ưu tiên CRITICAL' : 'Always deliver CRITICAL'} detail={vi ? 'Không tắt cảnh báo khẩn cấp trong giờ yên lặng' : 'Bypass quiet hours for critical alerts'} checked={form.critical} onChange={() => toggle('critical')}/></section><section className="surface settings-card"><h2>{vi ? 'Khung giờ' : 'Schedule'}</h2><label><span>{vi ? 'Bắt đầu' : 'Start'}</span><input type="time" value={form.start} onChange={event => setForm({ ...form, start: event.target.value })}/></label><label><span>{vi ? 'Kết thúc' : 'End'}</span><input type="time" value={form.end} onChange={event => setForm({ ...form, end: event.target.value })}/></label><p className="helper-copy">{vi ? 'Backend vẫn có thể ưu tiên cảnh báo CRITICAL theo lựa chọn phía trên.' : 'The backend may still prioritize CRITICAL alerts according to the setting above.'}</p></section></div><Notice error={save.error} success={save.isSuccess} vi={vi}/><div className="save-bar"><span>{vi ? 'Dữ liệu do backend quản lý' : 'Backend-managed preferences'}</span><button className="primary-button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? (vi ? 'Đang lưu…' : 'Saving…') : (vi ? 'Lưu thay đổi' : 'Save changes')}</button></div></div>
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: () => void }) {
  return <button className="setting-toggle" role="switch" aria-checked={checked} onClick={onChange}><div><strong>{label}</strong><span>{detail}</span></div><i className={checked ? 'is-on' : ''}><b/></i></button>
}

function ContactRow({ contact, locale }: { contact: JsonRecord; locale: Locale }) {
  const vi = locale === 'vi'; const queryClient = useQueryClient(); const id = string(contact.contact_id); const [code, setCode] = useState('')
  const verify = useMutation({ mutationFn: () => code ? ownerPlatformClient.v1ConfirmContactVerification(id, code) : ownerPlatformClient.v1RequestContactVerification(id), onSuccess: data => { if (data.dev_code) setCode(string(data.dev_code)); void queryClient.invalidateQueries({ queryKey: ['platform-contacts'] }) } })
  const remove = useMutation({ mutationFn: () => ownerPlatformClient.v1DeleteEmergencyContact(id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform-contacts'] }) })
  return <div className="account-person"><span>{string(contact.full_name).slice(0,2).toUpperCase()}</span><div><strong>{string(contact.full_name)}</strong><small>{string(contact.phone)} · {contact.verified ? (vi ? 'Đã xác minh' : 'Verified') : (vi ? 'Chưa xác minh' : 'Unverified')}</small>{!contact.verified && <div className="account-row-actions"><input maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder={vi ? 'Mã 6 số' : '6-digit code'}/><button disabled={verify.isPending} onClick={() => verify.mutate()}>{code.length === 6 ? (vi ? 'Xác nhận' : 'Confirm') : (vi ? 'Gửi mã' : 'Send code')}</button></div>}</div><button className="row-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{vi ? 'Xóa' : 'Delete'}</button>{(verify.error || remove.error) && <small>{errorText(verify.error || remove.error, vi)}</small>}</div>
}

function CaregiverRow({ link, locale }: { link: JsonRecord; locale: Locale }) {
  const vi = locale === 'vi'; const queryClient = useQueryClient(); const revoke = useMutation({ mutationFn: () => ownerPlatformClient.v1RevokeCaregiver(string(link.link_id)), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform-caregivers'] }) })
  return <div className="account-person"><span>CG</span><div><strong>{string(link.email, string(link.caregiver_id, vi ? 'Đang chờ nhận lời' : 'Pending acceptance'))}</strong><small>{string(link.status)} · {Array.isArray(link.vehicle_ids) ? link.vehicle_ids.join(', ') : ''}</small></div><button className="row-danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{vi ? 'Thu hồi' : 'Revoke'}</button>{revoke.error && <small>{errorText(revoke.error, vi)}</small>}</div>
}

export function ProfileSettingsPage({ locale, vehicleIds }: { locale: Locale; vehicleIds: string[] }) {
  const vi = locale === 'vi'
  const queryClient = useQueryClient()
  const profile = useQuery({ queryKey: ['platform-profile'], queryFn: () => ownerPlatformClient.v1Profile() })
  const contacts = useQuery({ queryKey: ['platform-contacts'], queryFn: () => ownerPlatformClient.v1EmergencyContacts() })
  const caregivers = useQuery({ queryKey: ['platform-caregivers'], queryFn: () => ownerPlatformClient.v1Caregivers() })
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', phone: '' })
  const [contactForm, setContactForm] = useState({ full_name: '', phone: '', relationship: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  useEffect(() => { if (profile.data) setProfileForm({ full_name: string(profile.data.full_name), email: string(profile.data.email), phone: string(profile.data.phone) }) }, [profile.data])
  const update = useMutation({ mutationFn: () => ownerPlatformClient.v1UpdateProfile({ ...profileForm, language: locale }), onSuccess: data => queryClient.setQueryData(['platform-profile'], data) })
  const addContact = useMutation({ mutationFn: () => ownerPlatformClient.v1CreateEmergencyContact(contactForm), onSuccess: () => { setContactForm({ full_name: '', phone: '', relationship: '' }); void queryClient.invalidateQueries({ queryKey: ['platform-contacts'] }) } })
  const invite = useMutation({ mutationFn: () => ownerPlatformClient.v1CreateCaregiverInvite({ email: inviteEmail, vehicle_ids: vehicleIds, can_acknowledge: true }), onSuccess: () => { setInviteEmail(''); void queryClient.invalidateQueries({ queryKey: ['platform-caregivers'] }) } })
  const acceptInvite = useMutation({ mutationFn: () => ownerPlatformClient.v1AcceptCaregiverInvite(inviteToken), onSuccess: () => { setInviteToken(''); void queryClient.invalidateQueries({ queryKey: ['platform-caregivers'] }); void queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] }) } })
  const submitContact = (event: FormEvent) => { event.preventDefault(); addContact.mutate() }
  if (profile.isLoading) return <div className="loading-state"><span/><span/><span/></div>
  if (profile.isError) return <div className="owner-fail-state"><strong>{vi ? 'Không tải được hồ sơ' : 'Profile unavailable'}</strong><button onClick={() => void profile.refetch()}>{vi ? 'Thử lại' : 'Retry'}</button></div>
  return <div className="page-enter"><div className="page-heading"><div><span className="eyebrow">{vi ? 'Tài khoản' : 'Account'}</span><h1>{vi ? 'Hồ sơ và quyền chia sẻ' : 'Profile and shared access'}</h1><p>{vi ? 'Thông tin, liên hệ khẩn cấp và caregiver được xác minh bởi backend.' : 'Profile, emergency contacts and caregiver access are backend-authoritative.'}</p></div></div><div className="account-grid"><section className="surface account-card"><h2>{vi ? 'Thông tin cá nhân' : 'Personal information'}</h2><label><span>{vi ? 'Họ tên' : 'Full name'}</span><input value={profileForm.full_name} onChange={event => setProfileForm({ ...profileForm, full_name: event.target.value })}/></label><label><span>Email</span><input type="email" value={profileForm.email} onChange={event => setProfileForm({ ...profileForm, email: event.target.value })}/></label><label><span>{vi ? 'Điện thoại' : 'Phone'}</span><input value={profileForm.phone} onChange={event => setProfileForm({ ...profileForm, phone: event.target.value })}/></label><Notice error={update.error} success={update.isSuccess} vi={vi}/><button className="primary-button" disabled={update.isPending} onClick={() => update.mutate()}>{vi ? 'Lưu hồ sơ' : 'Save profile'}</button></section><section className="surface account-card"><h2>{vi ? 'Liên hệ khẩn cấp' : 'Emergency contacts'}</h2>{contacts.data?.contacts.map(contact => <ContactRow contact={contact} locale={locale} key={string(contact.contact_id)}/>)}<form onSubmit={submitContact} className="compact-form"><input required placeholder={vi ? 'Tên liên hệ' : 'Contact name'} value={contactForm.full_name} onChange={event => setContactForm({ ...contactForm, full_name: event.target.value })}/><input required placeholder="+84…" value={contactForm.phone} onChange={event => setContactForm({ ...contactForm, phone: event.target.value })}/><input placeholder={vi ? 'Mối quan hệ' : 'Relationship'} value={contactForm.relationship} onChange={event => setContactForm({ ...contactForm, relationship: event.target.value })}/><button className="secondary-button" disabled={addContact.isPending}>{vi ? 'Thêm liên hệ' : 'Add contact'}</button></form><Notice error={addContact.error} vi={vi}/></section><section className="surface account-card account-wide"><h2>{vi ? 'Người được chia sẻ quyền' : 'Shared caregivers'}</h2>{caregivers.data?.caregivers.length ? caregivers.data.caregivers.map(link => <CaregiverRow link={link} locale={locale} key={string(link.link_id)}/>) : <p className="helper-copy">{vi ? 'Chưa chia sẻ xe với caregiver nào.' : 'No caregiver access has been shared.'}</p>}<form className="invite-form" onSubmit={event => { event.preventDefault(); invite.mutate() }}><input required type="email" placeholder="caregiver@example.com" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)}/><button className="secondary-button" disabled={invite.isPending || !vehicleIds.length}>{vi ? 'Tạo lời mời' : 'Create invite'}</button></form><Notice error={invite.error} success={invite.isSuccess} vi={vi}/>{typeof invite.data?.invite_token === 'string' && <div className="invite-token"><strong>{vi ? 'Mã mời chỉ hiển thị một lần' : 'One-time invite token'}</strong><code>{invite.data.invite_token}</code></div>}<form className="invite-form" onSubmit={event => { event.preventDefault(); acceptInvite.mutate() }}><input required placeholder={vi ? 'Dán mã lời mời caregiver' : 'Paste caregiver invite token'} value={inviteToken} onChange={event => setInviteToken(event.target.value)}/><button className="secondary-button" disabled={acceptInvite.isPending}>{vi ? 'Nhận lời mời' : 'Accept invite'}</button></form><Notice error={acceptInvite.error} success={acceptInvite.isSuccess} vi={vi}/></section></div></div>
}
