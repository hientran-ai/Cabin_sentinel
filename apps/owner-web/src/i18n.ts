import type { Locale } from './model'

const messages = {
  vi: {
    overview: 'Tổng quan', cabin: 'Theo dõi cabin', vehicles: 'Xe của tôi', events: 'Sự kiện', notifications: 'Thông báo', profile: 'Hồ sơ', demo: 'Demo Controls',
    ownerPortal: 'CabinSentinel Owner', safetyFirst: 'An toàn bắt đầu từ những điều nhỏ nhất.', collapse: 'Thu gọn', expand: 'Mở rộng',
    greeting: 'Chào buổi sáng, Thu Hiền', overviewSub: 'Mọi điều quan trọng về cabin, trong một cái nhìn.', demoMode: 'Chế độ Demo', liveMonitoring: 'Đang giám sát',
    currentStatus: 'Trạng thái hiện tại', updated: 'Cập nhật', currentData: 'Dữ liệu hiện tại', staleData: 'Dữ liệu cũ hoặc chưa đầy đủ', recommended: 'Khuyến nghị', checkCabin: 'Kiểm tra cabin', viewDetails: 'Xem chi tiết',
    temperature: 'Nhiệt độ', occupancy: 'Occupancy', camera: 'Camera', connectivity: 'Kết nối', engine: 'Động cơ', doors: 'Cửa xe', locked: 'Đã khóa', unlocked: 'Đang mở',
    whyStatus: 'Vì sao có trạng thái này?', decisionDetails: 'Chi tiết quyết định', rule: 'Quy tắc', revision: 'Phiên bản', evidence: 'Bằng chứng', noRawImage: 'Không hiển thị hình ảnh cabin thô',
    activeIncident: 'Sự kiện đang hoạt động', recentActivity: 'Hoạt động gần đây', viewAll: 'Xem tất cả', actionProgress: 'Tiến trình phản ứng', noActions: 'Không có hành động phản ứng cho trạng thái này.',
    vehiclesTitle: 'Xe của tôi', vehiclesSub: 'Theo dõi trạng thái an toàn của các xe trong gia đình.', addVehicle: 'Thêm xe', vehicleStatus: 'Trạng thái xe', deviceHealth: 'Sức khỏe thiết bị', edgeUnit: 'Bộ xử lý Edge', cloudSync: 'Đồng bộ Cloud', cabinSensors: 'Cảm biến cabin',
    eventsTitle: 'Lịch sử sự kiện', eventsSub: 'Dòng thời gian minh bạch của mọi cảnh báo và quyết định.', all: 'Tất cả', active: 'Đang hoạt động', monitoring: 'Đang theo dõi', resolved: 'Đã xử lý', searchEvents: 'Tìm theo mã hoặc quy tắc…', incident: 'Sự kiện', time: 'Thời gian', status: 'Trạng thái', details: 'Chi tiết',
    notificationsTitle: 'Cài đặt thông báo', notificationsSub: 'Chọn cách CabinSentinel liên hệ với bạn.', push: 'Thông báo đẩy', sms: 'Tin nhắn SMS', email: 'Email', quietHours: 'Giờ yên lặng', emergencyContact: 'Liên hệ khẩn cấp', saveChanges: 'Lưu thay đổi', saved: 'Đã lưu cài đặt demo',
    profileTitle: 'Hồ sơ & quyền riêng tư', profileSub: 'Quản lý thông tin và các lựa chọn riêng tư của gia đình.', personalInfo: 'Thông tin cá nhân', fullName: 'Họ và tên', phone: 'Số điện thoại', language: 'Ngôn ngữ', privacy: 'Quyền riêng tư', privacyCopy: 'CabinSentinel ưu tiên metadata đã xử lý và không hiển thị raw cabin frame trong Owner Web.', sharedAccess: 'Quyền truy cập được chia sẻ', comingSoon: 'Sẵn sàng kết nối khi backend hỗ trợ.',
    demoTitle: 'Điều khiển Demo Day', demoSub: 'Trình diễn mọi trạng thái frontend mà không cần backend.', scenario: 'Kịch bản', scenarioHelp: 'Kịch bản chỉ thay đổi dữ liệu trình diễn; không điều khiển xe thật.', resetDemo: 'Đặt lại demo', presentationTips: 'Kịch bản trình diễn đề xuất', openOverview: 'Mở trang Tổng quan',
    demoSafe: 'An toàn', demoNotice: 'Nhắc vật dụng', demoWarning: 'Cảnh báo occupant', demoCritical: 'Cabin nguy hiểm', demoActionFailure: 'Action thất bại', demoCamera: 'Camera bị che', demoStale: 'Dữ liệu cũ', demoOffline: 'Mất kết nối Cloud',
    simulated: 'Mô phỏng', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', failed: 'Thất bại', unavailable: 'Không khả dụng', present: 'Có mặt', suspected: 'Nghi ngờ', absent: 'Không có', unknown: 'Chưa rõ', connected: 'Đã kết nối', degraded: 'Suy giảm', offline: 'Ngoại tuyến',
    back: 'Quay lại', notFound: 'Không tìm thấy nội dung', notFoundCopy: 'Trang hoặc sự kiện này không tồn tại trong dữ liệu demo.', minutesAgo: 'phút trước', justNow: 'vừa xong', daysAgo: 'ngày trước', demoDisclosure: 'Demo frontend — không có hành động vật lý nào được thực hiện.',
  },
  en: {
    overview: 'Overview', cabin: 'Cabin monitor', vehicles: 'My vehicles', events: 'Events', notifications: 'Notifications', profile: 'Profile', demo: 'Demo Controls',
    ownerPortal: 'CabinSentinel Owner', safetyFirst: 'Safety starts with the smallest details.', collapse: 'Collapse', expand: 'Expand',
    greeting: 'Good morning, Thu Hien', overviewSub: 'Everything important about your cabin, at a glance.', demoMode: 'Demo mode', liveMonitoring: 'Monitoring',
    currentStatus: 'Current status', updated: 'Updated', currentData: 'Current data', staleData: 'Stale or incomplete data', recommended: 'Recommended', checkCabin: 'Check cabin', viewDetails: 'View details',
    temperature: 'Temperature', occupancy: 'Occupancy', camera: 'Camera', connectivity: 'Connectivity', engine: 'Engine', doors: 'Doors', locked: 'Locked', unlocked: 'Unlocked',
    whyStatus: 'Why this status?', decisionDetails: 'Decision details', rule: 'Rule', revision: 'Revision', evidence: 'Evidence', noRawImage: 'No raw cabin imagery is displayed',
    activeIncident: 'Active incident', recentActivity: 'Recent activity', viewAll: 'View all', actionProgress: 'Response progress', noActions: 'No response action is associated with this state.',
    vehiclesTitle: 'My vehicles', vehiclesSub: 'Monitor the safety status of your family vehicles.', addVehicle: 'Add vehicle', vehicleStatus: 'Vehicle status', deviceHealth: 'Device health', edgeUnit: 'Edge unit', cloudSync: 'Cloud sync', cabinSensors: 'Cabin sensors',
    eventsTitle: 'Event history', eventsSub: 'A transparent timeline of every alert and decision.', all: 'All', active: 'Active', monitoring: 'Monitoring', resolved: 'Resolved', searchEvents: 'Search by ID or rule…', incident: 'Incident', time: 'Time', status: 'Status', details: 'Details',
    notificationsTitle: 'Notification settings', notificationsSub: 'Choose how CabinSentinel should reach you.', push: 'Push notifications', sms: 'SMS messages', email: 'Email', quietHours: 'Quiet hours', emergencyContact: 'Emergency contact', saveChanges: 'Save changes', saved: 'Demo settings saved',
    profileTitle: 'Profile & privacy', profileSub: 'Manage your family information and privacy choices.', personalInfo: 'Personal information', fullName: 'Full name', phone: 'Phone number', language: 'Language', privacy: 'Privacy', privacyCopy: 'CabinSentinel prioritizes processed metadata and displays no raw cabin frames in Owner Web.', sharedAccess: 'Shared access', comingSoon: 'Ready to connect when the backend supports it.',
    demoTitle: 'Demo Day controls', demoSub: 'Present every frontend state without requiring a backend.', scenario: 'Scenario', scenarioHelp: 'Scenarios only change presentation data; they never control a real vehicle.', resetDemo: 'Reset demo', presentationTips: 'Suggested presentation flow', openOverview: 'Open Overview',
    demoSafe: 'Safe', demoNotice: 'Forgotten item', demoWarning: 'Occupant warning', demoCritical: 'Dangerous cabin', demoActionFailure: 'Action failure', demoCamera: 'Camera blocked', demoStale: 'Stale data', demoOffline: 'Cloud disconnected',
    simulated: 'Simulated', pending: 'Pending confirmation', confirmed: 'Confirmed', failed: 'Failed', unavailable: 'Unavailable', present: 'Present', suspected: 'Suspected', absent: 'Absent', unknown: 'Unknown', connected: 'Connected', degraded: 'Degraded', offline: 'Offline',
    back: 'Back', notFound: 'Content not found', notFoundCopy: 'This page or incident does not exist in the demo data.', minutesAgo: 'minutes ago', justNow: 'just now', daysAgo: 'days ago', demoDisclosure: 'Frontend demo — no physical action is performed.',
  },
} as const

export type MessageKey = keyof typeof messages.vi
export function translator(locale: Locale) { return (key: MessageKey): string => messages[locale][key] }
