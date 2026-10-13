import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'vi' | 'en'

type Messages = Record<string, string>

const messages: Record<Locale, Messages> = {
  vi: {
    demoStudio: 'Demo studio', trialGroup: 'Thử nghiệm',
    admin: 'Quản trị', operations: 'Vận hành', overview: 'Tổng quan', incidents: 'Sự cố', evaluations: 'Đánh giá an toàn', commands: 'Lệnh điều khiển',
    vehicles: 'Phương tiện', devices: 'Thiết bị', tenants: 'Tổ chức', users: 'Người dùng & quyền', models: 'Mô hình AI', rules: 'Quy tắc an toàn', audit: 'Nhật ký kiểm toán', system: 'Sức khỏe hệ thống',
    safetyOperations: 'Vận hành an toàn', fleetManagement: 'Quản lý đội xe', platformAdministration: 'Quản trị nền tảng', assurance: 'Giám sát & tuân thủ', mainNavigation: 'Menu chính', operationsHub: 'Vận hành', fleetHub: 'Đội xe', peopleHub: 'Người dùng', systemHub: 'Hệ thống',
    platformControl: 'Điều khiển nền tảng', administratorScope: 'Phạm vi quản trị viên', operatorScope: 'Phạm vi điều phối viên', live: 'Trực tuyến V1',
    refresh: 'Làm mới', refreshing: 'Đang làm mới…', search: 'Tìm kiếm', all: 'Tất cả', open: 'Đang mở', resolved: 'Đã giải quyết', unassigned: 'Chưa phân công', escalated: 'Đã chuyển cấp',
    loading: 'Đang tải dữ liệu đã xác minh…', noRecords: 'Không có dữ liệu', backendUnavailable: 'Không thể tải dữ liệu backend', failSafe: 'Không hiển thị dữ liệu giả định là an toàn.',
    assignToMe: 'Nhận xử lý', assign: 'Phân công', assignee: 'Người phụ trách', escalate: 'Chuyển cấp', addNote: 'Thêm ghi chú', note: 'Ghi chú hồ sơ', acknowledge: 'Xác nhận đã nhận', resolve: 'Đánh dấu an toàn', hold: 'Giữ sự cố mở', releaseHold: 'Bỏ giữ', cabinChecked: 'Tôi xác nhận cabin đã được kiểm tra trực tiếp',
    requestCommand: 'Yêu cầu hành động', horn: 'Bấm còi', sms: 'Gửi SMS', unlock: 'Mở khóa', confirm: 'Phê duyệt', cancel: 'Hủy', reject: 'Từ chối', reason: 'Lý do',
    activeIncidents: 'Sự cố đang mở', critical: 'Nguy hiểm', offlineVehicles: 'Xe ngoại tuyến', pendingCommands: 'Lệnh chờ xử lý',
    details: 'Chi tiết', timeline: 'Dòng thời gian', evidence: 'Bằng chứng', actions: 'Hành động', connectivity: 'Kết nối', risk: 'Mức rủi ro', ownerTenant: 'Chủ xe / tổ chức',
    createTenant: 'Tạo tổ chức', tenantName: 'Tên tổ chức', createUser: 'Tạo tài khoản', fullName: 'Họ và tên', email: 'Email', temporaryPassword: 'Mật khẩu tạm thời', role: 'Vai trò', status: 'Trạng thái',
    saveRole: 'Lưu vai trò', disableAccount: 'Vô hiệu hóa', enableAccount: 'Kích hoạt', revokeSessions: 'Thu hồi phiên đăng nhập', accessReview: 'Rà soát quyền', rolePermissions: 'Quyền theo vai trò',
    setFirmware: 'Đặt firmware', loadHeartbeats: 'Xem heartbeat', revokeDevice: 'Thu hồi thiết bị', issuePairingCode: 'Tạo mã ghép nối', telemetry: 'Telemetry',
    dangerousAction: 'Hành động này có thể ảnh hưởng đến vận hành. Bạn có muốn tiếp tục?', updatedAudited: 'Backend đã cập nhật và ghi audit.',
  },
  en: {
    demoStudio: 'Demo studio', trialGroup: 'Try it',
    admin: 'Admin', operations: 'Operations', overview: 'Overview', incidents: 'Incidents', evaluations: 'Safety evaluations', commands: 'Commands',
    vehicles: 'Vehicles', devices: 'Devices', tenants: 'Tenants', users: 'Users & access', models: 'AI models', rules: 'Safety rules', audit: 'Audit log', system: 'System health',
    safetyOperations: 'Safety operations', fleetManagement: 'Fleet management', platformAdministration: 'Platform administration', assurance: 'Assurance', mainNavigation: 'Main menu', operationsHub: 'Operations', fleetHub: 'Fleet', peopleHub: 'People', systemHub: 'System',
    platformControl: 'Platform control', administratorScope: 'Administrator scope', operatorScope: 'Operator scope', live: 'Live V1',
    refresh: 'Refresh', refreshing: 'Refreshing…', search: 'Search', all: 'All', open: 'Open', resolved: 'Resolved', unassigned: 'Unassigned', escalated: 'Escalated',
    loading: 'Loading verified backend data…', noRecords: 'No records', backendUnavailable: 'Backend data unavailable', failSafe: 'No placeholder or inferred-safe data is shown.',
    assignToMe: 'Assign to me', assign: 'Assign', assignee: 'Assignee', escalate: 'Escalate', addNote: 'Add note', note: 'Case note', acknowledge: 'Acknowledge', resolve: 'Mark cabin safe', hold: 'Keep incident open', releaseHold: 'Release hold', cabinChecked: 'I confirm the cabin was physically checked',
    requestCommand: 'Request action', horn: 'Sound horn', sms: 'Send SMS', unlock: 'Unlock', confirm: 'Approve', cancel: 'Cancel', reject: 'Reject', reason: 'Reason',
    activeIncidents: 'Active incidents', critical: 'Critical', offlineVehicles: 'Offline vehicles', pendingCommands: 'Pending commands',
    details: 'Details', timeline: 'Timeline', evidence: 'Evidence', actions: 'Actions', connectivity: 'Connectivity', risk: 'Risk', ownerTenant: 'Owner / tenant',
    createTenant: 'Create tenant', tenantName: 'Tenant name', createUser: 'Create account', fullName: 'Full name', email: 'Email', temporaryPassword: 'Temporary password', role: 'Role', status: 'Status',
    saveRole: 'Save role', disableAccount: 'Disable account', enableAccount: 'Enable account', revokeSessions: 'Revoke sessions', accessReview: 'Access review', rolePermissions: 'Role permissions',
    setFirmware: 'Set firmware', loadHeartbeats: 'Load heartbeats', revokeDevice: 'Revoke device', issuePairingCode: 'Issue pairing code', telemetry: 'Telemetry',
    dangerousAction: 'This action can affect live operations. Do you want to continue?', updatedAudited: 'Backend updated and the action was audited.',
  },
}

interface LocaleValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
  bi: (vi: string, en: string) => string
}

const LocaleContext = createContext<LocaleValue | null>(null)
const STORAGE_KEY = 'cabinsentinel_operations_locale'

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'vi' || saved === 'en') return saved
    return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
  })
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])
  const value = useMemo<LocaleValue>(() => ({
    locale,
    setLocale,
    t: key => messages[locale][key] || messages.en[key] || key,
    bi: (vi, en) => locale === 'vi' ? vi : en,
  }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('LocaleProvider missing')
  return value
}
