// Vietnamese first, English second. Keys are short and grouped by screen.
const S = {
  simulated: ['MÔ PHỎNG', 'SIMULATED'],
  owner: ['Chủ xe', 'Owner'],
  park: ['Đỗ', 'Park'], parked: ['Đang đỗ', 'Parked'], driving: ['Đang chạy', 'Driving'], reverse: ['Lùi', 'Reverse'], neutral: ['Số mo', 'Neutral'],
  locked: ['Đã khoá', 'Locked'], unlocked: ['Đã mở khoá', 'Unlocked'], open: ['MỞ', 'OPEN'], closed: ['ĐÓNG', 'CLOSED'], charging: ['ĐANG SẠC', 'CHARGING'],
  frunk: ['Cốp trước', 'Frunk'], trunk: ['Cốp sau', 'Trunk'], chargePort: ['Cổng sạc', 'Charge port'],
  frontLeft: ['Cửa trước trái', 'Front left door'], frontRight: ['Cửa trước phải', 'Front right door'], rearLeft: ['Cửa sau trái', 'Rear left door'], rearRight: ['Cửa sau phải', 'Rear right door'],
  range: ['Phạm vi', 'Range'], seatbelt: ['Thắt dây an toàn', 'Fasten seatbelt'], parkingBrake: ['Phanh đỗ', 'Parking brake'], headlights: ['Đèn pha', 'Headlights'],
  modelNote: ['Xe: Car Concept, Khronos Group, CC-BY 4.0 (2 cửa, mô hình minh hoạ)', 'Car: Car Concept, Khronos Group, CC-BY 4.0 (2-door, illustrative)'],
  // dock
  vehicle: ['Xe', 'Vehicle'], music: ['Âm nhạc', 'Music'], camera: ['Camera', 'Camera'], frontDefrost: ['Sấy kính trước', 'Front defrost'], wipers: ['Gạt mưa', 'Wipers'],
  seatHeat: ['Sưởi ghế', 'Seat heat'], ac: ['Điều hoà', 'A/C'], rearDefrost: ['Sấy kính sau', 'Rear defrost'], volume: ['Âm lượng', 'Volume'], apps: ['Ứng dụng', 'Apps'],
  climateOff: ['Tắt', 'Off'],
  // map
  navigate: ['Điều hướng', 'Navigate'], searchDest: ['Tìm điểm đến', 'Search destination'], recent: ['Gợi ý', 'Suggestions'], arrival: ['Đến nơi', 'Arrival'],
  remaining: ['Còn lại', 'Remaining'], duration: ['Thời gian', 'Duration'], endRoute: ['Kết thúc', 'End'], recenter: ['Về vị trí xe', 'Recenter'], mapOffline: ['Không tải được bản đồ. Lộ trình vẫn hoạt động.', 'Map tiles unavailable. Routing still works.'],
  routeMock: ['Lộ trình mô phỏng', 'Simulated route'], routeOsrm: ['Lộ trình OSRM (máy chủ thử)', 'OSRM route (demo server)'], noTyping: ['Không nhập liệu khi đang chạy', 'Typing disabled while driving'],
  arrived: ['Đã tới nơi', 'Arrived'], routing: ['Đang tìm đường…', 'Finding route…'], charger: ['Trạm sạc', 'Charger'],
  // media
  radio: ['Radio', 'Radio'], bluetooth: ['Bluetooth', 'Bluetooth'], streaming: ['Nhạc trực tuyến', 'Streaming'], local: ['Nhạc trên máy', 'Local music'],
  favorites: ['Yêu thích', 'Favorites'], nowPlaying: ['Đang phát', 'Now playing'], noFavorites: ['Chưa có kênh yêu thích', 'No favourite stations yet'], mediaNote: ['Âm thanh mô phỏng, không phát tiếng', 'Simulated playback, no audio'],
  // climate
  climate: ['Điều hoà', 'Climate'], driver: ['Tài xế', 'Driver'], passenger: ['Hành khách', 'Passenger'], sync: ['Đồng bộ', 'Sync'], fan: ['Quạt', 'Fan'], auto: ['Tự động', 'Auto'],
  recirc: ['Lấy gió trong', 'Recirculate'], airflow: ['Hướng gió', 'Airflow'], face: ['Mặt', 'Face'], faceFeet: ['Mặt + chân', 'Face + feet'], feet: ['Chân', 'Feet'], windshield: ['Kính', 'Windshield'],
  climateOn: ['Bật điều hoà', 'Climate on'],
  // vehicle overlay
  quick: ['Điều khiển nhanh', 'Quick controls'], drivingTab: ['Lái xe', 'Driving'], safety: ['An toàn', 'Safety'], chargingTab: ['Sạc', 'Charging'], display: ['Hiển thị', 'Display'], settings: ['Cài đặt', 'Settings'],
  lock: ['Khoá', 'Lock'], unlock: ['Mở khoá', 'Unlock'], lights: ['Đèn', 'Lights'], off: ['Tắt', 'Off'], on: ['Bật', 'On'], windows: ['Cửa kính', 'Windows'], vent: ['Hé', 'Vent'], close: ['Đóng', 'Close'], openAll: ['Mở', 'Open'],
  doors: ['Cửa', 'Doors'], steering: ['Chế độ lái', 'Steering'], comfort: ['Nhẹ', 'Comfort'], standard: ['Tiêu chuẩn', 'Standard'], sport: ['Thể thao', 'Sport'], acceleration: ['Tăng tốc', 'Acceleration'], chill: ['Êm', 'Chill'],
  regen: ['Phanh tái sinh', 'Regenerative braking'], low: ['Thấp', 'Low'], high: ['Cao', 'High'], childLock: ['Khoá trẻ em', 'Child lock'], sentry: ['Chế độ canh gác', 'Sentry mode'], cabinMonitoring: ['Giám sát cabin', 'Cabin monitoring'],
  batteryLevel: ['Mức pin', 'Battery'], chargeLimit: ['Giới hạn sạc', 'Charge limit'], cable: ['Cáp sạc', 'Charge cable'], plugIn: ['Cắm cáp', 'Plug in'], unplug: ['Rút cáp', 'Unplug'], estRange: ['Phạm vi ước tính', 'Estimated range'],
  disconnected: ['Chưa cắm', 'Not connected'], connected: ['Đã cắm, chưa sạc', 'Connected'], chargingNow: ['Đang sạc', 'Charging'], complete: ['Đã đầy tới giới hạn', 'Complete'],
  brightness: ['Độ sáng', 'Brightness'], appearance: ['Giao diện', 'Appearance'], light: ['Sáng', 'Light'], dark: ['Tối', 'Dark'], design: ['Thiết kế', 'Design'],
  language: ['Ngôn ngữ', 'Language'], units: ['Đơn vị', 'Units'], metric: ['km, °C', 'km, °C'], imperial: ['mi, °F', 'mi, °F'], profile: ['Hồ sơ', 'Profile'], system: ['Thông tin hệ thống', 'System information'],
  paint: ['Màu sơn', 'Paint'], view: ['Góc nhìn', 'View'], resetView: ['Đặt lại', 'Reset'], threeQuarter: ['3/4', '3/4'], side: ['Ngang', 'Side'], top: ['Trên', 'Top'], rear: ['Sau', 'Rear'],
  notWhileDriving: ['Không dùng được khi đang chạy', 'Not available while driving'], doorWhileDriving: ['Không mở cửa khi xe đang chạy', 'Doors stay closed while driving'],
  // camera
  front: ['Trước', 'Front'], left: ['Trái', 'Left'], right: ['Phải', 'Right'], cabin: ['Cabin', 'Cabin'], useDevice: ['Dùng camera của máy này', 'Use this device camera'],
  sample: ['Hình mẫu', 'Sample'], cameraDenied: ['Trình duyệt chưa cho dùng camera. Đang dùng hình mẫu.', 'Camera permission denied. Showing a sample.'],
  cameraNone: ['Máy này không có camera. Đang dùng hình mẫu.', 'No camera on this device. Showing a sample.'], cabinParkOnly: ['Camera cabin chỉ xem khi xe ở số P', 'Cabin camera is only available in Park'],
  cabinBlurred: ['Đã làm mờ toàn khung để bảo vệ riêng tư', 'Whole frame blurred for privacy'], syntheticFeed: ['Hình mô phỏng, không phải camera thật', 'Synthetic picture, not a real camera'],
  fullscreen: ['Toàn màn hình', 'Fullscreen'],
  // cabin monitoring
  risk: ['Mức rủi ro', 'Risk'], occupancy: ['Người trong xe', 'Occupancy'], lastUpdate: ['Cập nhật', 'Updated'], temperature: ['Nhiệt độ cabin', 'Cabin temperature'],
  SAFE: ['An toàn', 'Safe'], WARNING: ['Cảnh báo', 'Warning'], CRITICAL: ['Nguy hiểm', 'Critical'], UNKNOWN: ['Chưa xác minh', 'Unknown'],
  adult: ['Người lớn', 'Adult'], child: ['Trẻ em', 'Child'], pet: ['Thú cưng', 'Pet'], nobody: ['Không phát hiện ai', 'Nobody detected'], verifiedEmpty: ['Xe trống (khớp ảnh tham chiếu)', 'Empty (matches reference)'],
  nothingNotEmpty: ['Không phát hiện gì không có nghĩa là xe trống', 'Nothing detected does not mean the cabin is empty'], simSource: ['Nguồn: dữ liệu mô phỏng. Chưa nối CabinSentinel.', 'Source: simulated data. CabinSentinel not connected.'],
  // notifications
  dismiss: ['Đóng', 'Dismiss'],
  // launcher
  navigation: ['Dẫn đường', 'Navigation'], appsTitle: ['Ứng dụng', 'Applications'],
  // dev
  dev: ['Bảng mô phỏng', 'Simulation panel'],
} as const

export type StringKey = keyof typeof S
export function translate(lang: 'vi' | 'en', key: StringKey): string { return S[key][lang === 'vi' ? 0 : 1] }
