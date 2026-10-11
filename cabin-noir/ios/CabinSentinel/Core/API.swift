import Foundation

// MARK: - Models (mirror backend JSON, snake_case converted)

struct User: Codable, Equatable { let id: String; let phone: String; var name: String }

struct UserSettings: Codable, Equatable {
    var purpose: String
    var notifyWarning: Bool
    var notifyInfo: Bool
    var exitReminder: Bool
    var autoCool: Bool
    var demoMode: Bool
    var notifyChannel: String? = nil   // auto | telegram | ntfy | both (set from the notifications screen)
}

struct Me: Codable, Equatable { let id: String; let phone: String; let name: String; let settings: UserSettings }

struct Vehicle: Codable, Equatable, Identifiable { let id: String; let model: String; let plate: String; let name: String; let color: String; let image: String }

struct VehicleSummary: Codable, Identifiable, Equatable {
    let vehicle: Vehicle; let role: String; let level: String?; let title: String?; let incidentId: String?
    var id: String { vehicle.id }
}

struct Verdict: Codable, Equatable { let level: String; let title: String; let sub: String; let current: Bool; let seat: String?; let conf: Double? }
struct Tile: Codable, Hashable { let label: String; let value: String; let tone: String }
struct Seat: Codable, Identifiable, Hashable { let key: String; let label: String; let occ: Bool; let conf: Double; let kind: String?; var age: String? = nil; var id: String { key } }
struct CabinItem: Codable, Hashable { let name: String; let seat: String; let conf: Double }

struct EscalationStep: Codable, Identifiable, Hashable { let offset: Int; let key: String; let title: String; let note: String; let state: String; let at: Double; var detail: String? = nil; var id: String { key } }
struct Escalation: Codable, Hashable { let steps: [EscalationStep]; let current: Int; let nextIn: Int?; let stopped: Bool }
struct EventItem: Codable, Hashable { let at: Double; let kind: String; let title: String; let detail: String; let incidentId: String? }
struct Reject: Codable, Hashable { let code: String; let title: String; let message: String }

struct Incident: Codable, Identifiable, Hashable {
    let id: String
    let vehicleId: String
    let level: String
    let status: String
    let revision: Int
    let createdAt: Double
    let viewedAt: Double?
    let viewedBy: String?
    let resolvedAt: Double?
    let resolvedBy: String?
    let seat: String?
    let confidence: Double?
    let cabinTemp: Double?
    let reason: String
    let seatLabel: String?
    let elapsed: Int
    let escalation: Escalation?
    let events: [EventItem]?
    let result: String?
    let reject: Reject?
}

struct Climate: Codable, Equatable { let status: String; let target: Int; let mode: String; let fan: String; let durationMin: Int; let secondsLeft: Int; let auto: Bool? }
struct ProtectionRow: Codable, Identifiable, Hashable { let key: String; let label: String; let detail: String; let status: String; let fix: String?; var id: String { key } }
struct Protection: Codable, Hashable { let level: String; let title: String; let battery: Int; let rows: [ProtectionRow] }
struct ExitSeat: Codable, Hashable { let key: String; let label: String; let conf: Double }
struct ExitCheck: Codable, Hashable { let pending: Bool; let location: String; let seats: [ExitSeat]; let items: [CabinItem]; let confirmedAt: Double? }

struct VehicleStatus: Codable, Equatable {
    let vehicle: Vehicle
    let role: String
    let scenario: String
    let restricted: Bool
    let verdict: Verdict?
    let tiles: [Tile]?
    let seats: [Seat]?
    let items: [CabinItem]?
    let cabinTemp: Double?
    let outsideTemp: Double?
    let doorsLocked: Bool?
    let engineOn: Bool?
    let camera: String?
    let connection: String?
    let lastSeen: Double?
    let incident: Incident?
    let climate: Climate?
    let protection: Protection?
    let exitCheck: ExitCheck?
    let source: String?
    let detector: String?
    let coords: Coords?
    let geofence: Geofence?
    let inGeofence: Bool?
    let route: RouteInfo?
    var device: DeviceBrief? = nil
    var pausedUntil: Double? = nil
    var noRealData: Bool? = nil
    var lockKnown: Bool? = nil

    var canAct: Bool { role == "owner" || role == "confirm" }
}

/// The paired in-car device as last reported to the server.
struct DeviceBrief: Codable, Equatable { let id: String; let label: String; let platform: String; let lastSeen: Double?; let battery: Int?; let charging: Bool?; let thermal: String? }
struct DeviceInfoBody: Codable, Hashable { let battery: Int?; let charging: Bool?; let thermal: String? }
struct DeviceItem: Codable, Identifiable, Hashable { let id: String; let label: String; let platform: String; let createdAt: Double; let lastSeen: Double?; let online: Bool; let info: DeviceInfoBody? }
struct PairingCode: Codable { let code: String; let expiresIn: Int }
struct PairResponse: Codable { let deviceToken: String; let deviceId: String; let vehicle: Vehicle }
struct DeviceAck: Codable { let ok: Bool; let serverTime: Double; let pausedUntil: Double? }
struct TelegramStatus: Codable, Equatable { let configured: Bool; let linked: Bool; let bot: String? }
struct TelegramLink: Codable { let code: String; let expiresIn: Int; let bot: String?; let deepLink: String? }
struct PushInfo: Codable { let server: String; let topic: String; let subscribeUrl: String; let webUrl: String }
struct ServerConfig: Codable { let env: String; let production: Bool; let simulation: Bool; let climate: Bool; let devicePairing: Bool; let hotOutsideC: Double; let pauseMaxMin: Int }
struct ServerHealth: Codable { let status: String; let env: String?; let otp: String?; let sms: Bool? }

struct Coords: Codable, Hashable { let lat: Double; let lon: Double; let accuracyM: Double?; let at: Double?; let heading: Double?; let progress: Double? }
struct Destination: Codable, Hashable { let name: String; let lat: Double; let lon: Double }
struct RouteInfo: Codable, Hashable { let dest: Destination; let progress: Double }
struct VehicleLocation: Codable, Equatable {
    let vehicleId: String; let coords: Coords?; let source: String; let destination: Destination?
    let moving: Bool; let stale: Bool; let locationName: String
}
/// One frame from /ws/vehicles/{id} or /ws/alerts. Heartbeats carry only `type`.
struct WSFrame: Decodable { let type: String; let status: VehicleStatus?; let location: VehicleLocation?; let alerts: [Incident]? }

struct Geofence: Codable, Hashable { let name: String; let lat: Double; let lon: Double; let radiusM: Int }

struct Member: Codable, Identifiable, Hashable { let id: String; let name: String; let phone: String; let role: String; let status: String }
struct Child: Codable, Identifiable, Hashable { let id: String; var name: String; var cls: String; var seat: String; var pickup: String; var dropoff: String; var days: [Int] }
struct Contact: Codable, Identifiable, Hashable { let id: String; let name: String; let rel: String; let phone: String }
struct TripLog: Codable, Hashable { let time: String; let title: String; let detail: String; let source: String }
struct Trip: Codable, Identifiable, Hashable {
    let vehicleId: String; let child: Child; let stage: String; let log: [TripLog]; let pickup: String; let dropoff: String; let seatLabel: String; let progress: Int
    let progressKnown: Bool; let school: String?; let destination: Destination?; let origin: Destination?; let vehicleCoords: Coords?
    var id: String { child.id }
}
struct History: Codable { let incidents: [Incident]; let events: [EventItem] }

// Cabin log, incident report, overview (server: cabinlog.py). `basis` is "measured", "simulated" or "unknown".
struct CabinLogItem: Codable, Identifiable, Hashable {
    let id: String; let kind: String; let label: String; let startedAt: Double; let endedAt: Double?; let durationS: Int; let ongoing: Bool
    let seat: String?; let seatLabel: String?; let level: String?; let incidentId: String?; let outcome: String?; let outcomeLabel: String?
    let basis: String; let ackS: Double?; let notifyS: Double?; let sealed: Bool
    var clip: String? = nil; var confMax: Double? = nil; var note: String? = nil
}
struct CabinStats: Codable, Hashable {
    let leftBehind: Int; let critical: Int; let open: Int; let confirmed: Int; let manualClose: Int
    let medianAckS: Double?; let medianResolveS: Double?; let medianNotifyS: Double?
    let cameraBlocked: Int; let cameraBlockedMin: Double; let offline: Int; let offlineMin: Double; let basis: [String]
}
struct ChainStatus: Codable, Hashable { let ok: Bool; let checked: Int; let brokenAt: String? }
struct CabinLog: Codable { let days: Int; let items: [CabinLogItem]; let stats: CabinStats; let chain: ChainStatus; let retentionDays: Int; let note: String }
struct DeliveryTrace: Codable, Hashable { let kind: String; let at: Double; let status: String; let detail: String; let delayS: Double }
struct ObsPoint: Codable, Hashable { let ts: Double; let people: Int; let childrenHint: Int; let pets: Int; let items: Int; let cameraOk: Int; let cabinTemp: Double? }
struct IncidentReport: Codable {
    let incident: Incident; let log: CabinLogItem?; let deliveries: [DeliveryTrace]; let observations: [ObsPoint]
    let observationsKeptDays: Int; let related: [CabinLogItem]; let chain: ChainStatus; let notes: String
}
// Live view: boxes and labels from the in-car sensor (positions only, never the picture).
struct LiveDetection: Codable, Hashable { let seat: String; let label: String; let kind: String?; let conf: Double; let age: String?; let box: [Double]? }
struct LiveItem: Codable, Hashable { let name: String; let seat: String; let conf: Double; let box: [Double]? }
struct LiveSnapshot: Codable {
    let available: Bool; let updatedAt: Double?; let ageS: Double; let level: String; let note: String; let basis: String; let detector: String?
    let reason: String?; let message: String?; let detections: [LiveDetection]?; let items: [LiveItem]?
}
// The bell (server: notifications.py). `kind`: alert, resolved, device, camera, offline, update. Plain text only.
struct NotificationItem: Codable, Identifiable, Hashable {
    let id: String; let kind: String; let level: String; let title: String; let detail: String; let at: Double
    let vehicleId: String?; let vehicleName: String?; let incidentId: String?; let url: String?
}
struct NotificationFeed: Codable { let items: [NotificationItem]; let serverBuild: String?; let update: Bool }
// Top of History: the last 7 days as a strip, and how much of the time the vehicle was really watched (server: cabinlog.summary).
struct SummaryDay: Codable, Identifiable, Hashable {
    let start: Double; let label: String; let today: Bool; let worst: String; let incidents: Int; let open: Int; let cameraS: Int; let offlineS: Int
    var span: Int? = nil                                        // days in the bar: 1, or 7 on the 90-day view
    var id: Double { start }
}
struct CoverageSegment: Codable, Hashable { let kind: String; let from: Double; let to: Double }
struct Coverage: Codable, Hashable { let pct: Double; let windowS: Int; let lostS: Int; let segments: [CoverageSegment]; let basis: String; let note: String }
struct LogSummary: Codable { let days: [SummaryDay]; let coverage: Coverage?; let tzMin: Int }
struct OverviewDevice: Codable, Hashable { let known: Bool; let online: Bool; let lastSeen: Double? }
struct OverviewVehicle: Codable, Identifiable, Hashable {
    let vehicleId: String; let name: String; let plate: String; let role: String
    let leftBehind: Int; let critical: Int; let open: Int; let manualClose: Int
    let cameraBlocked: Int; let cameraBlockedMin: Double; let offline: Int; let offlineMin: Double; let device: OverviewDevice
    var id: String { vehicleId }
}
struct OverviewTotal: Codable, Hashable {
    let leftBehind: Int; let critical: Int; let open: Int; let manualClose: Int; let cameraBlocked: Int; let cameraBlockedMin: Double
    let offline: Int; let offlineMin: Double; let medianAckS: Double?; let medianNotifyS: Double?; let vehicles: Int
}
struct Overview: Codable { let days: Int; let basis: [String]; let total: OverviewTotal; let vehicles: [OverviewVehicle]; let note: String }
struct Detection: Codable, Hashable { let seat: String; let label: String; let kind: String?; let conf: Double; let age: String? }
struct CameraInfo: Codable { let available: Bool; let reason: String?; let message: String?; let level: String?; let detections: [Detection]?; let items: [CabinItem]? }
struct LinkStart: Codable { let challengeId: String; let model: String; let plate: String; let suggestedName: String; let devCode: String? }
struct TelegramLogin: Codable { let bot: String?; let deepLink: String? }
struct OtpResponse: Codable { let sent: Bool; let expiresIn: Int; let devCode: String?; let telegram: TelegramLogin? }
struct AuthResponse: Codable { let token: String; let user: User; let isNew: Bool }

let roleLabels: [String: String] = ["owner": "Chủ xe", "confirm": "Xem và xác nhận", "view": "Chỉ xem", "school": "Chỉ đưa đón"]
let roleDescriptions: [String: String] = [
    "confirm": "Nhận cảnh báo, xem camera khi có sự cố, xác nhận đã kiểm tra xe và bật làm mát.",
    "view": "Nhận cảnh báo và xem trạng thái. Không xem camera, không xác nhận, không điều khiển.",
    "school": "Chỉ thấy chuyến đưa đón của bé. Không thấy trạng thái cabin hay camera.",
]

// MARK: - Errors

struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String
    var errorDescription: String? { message }

    static let offline = APIError(status: 0, code: "network", message: "Không kết nối được máy chủ CabinSentinel. Kiểm tra mạng rồi thử lại. Trạng thái xe chưa được đánh dấu an toàn.")
}

private struct ErrorEnvelope: Decodable {
    struct Detail: Decodable { let code: String; let message: String }
    let detail: Detail?
}

// MARK: - Client

final class APIClient: @unchecked Sendable {
    var baseURL: URL
    var token: String?
    private let session: URLSession
    let decoder: JSONDecoder = {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase; return d
    }()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder(); e.keyEncodingStrategy = .convertToSnakeCase; return e
    }()

    init(baseURL: URL) {
        self.baseURL = baseURL
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 8
        cfg.waitsForConnectivity = false
        session = URLSession(configuration: cfg)
    }

    func send<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil, query: [String: String] = [:], bearer: String? = nil) async throws -> T {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let t = bearer ?? token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }
        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) } catch { throw APIError.offline }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            if let env = try? decoder.decode(ErrorEnvelope.self, from: data), let d = env.detail {
                throw APIError(status: code, code: d.code, message: d.message)
            }
            throw APIError(status: code, code: "http_\(code)", message: code == 422 ? "Thông tin chưa hợp lệ. Kiểm tra lại." : "Máy chủ đang bận (lỗi \(code)). Thử lại sau.")
        }
        do { return try decoder.decode(T.self, from: data) } catch {
            throw APIError(status: code, code: "decode", message: "Phản hồi từ máy chủ không đọc được. Cập nhật ứng dụng hoặc thử lại.")
        }
    }

    // Server, production vehicles and the paired in-car device
    func health() async throws -> ServerHealth { try await send("GET", "/health") }
    func config() async throws -> ServerConfig { try await send("GET", "/v1/config") }
    struct NewVehicleBody: Encodable { let name: String; let model: String; let plate: String; let color: String }
    func createVehicle(_ b: NewVehicleBody) async throws -> VehicleStatus { try await send("POST", "/v1/vehicles", body: b) }
    func pairingCode(_ vehicle: String) async throws -> PairingCode { try await send("POST", "/v1/vehicles/\(vehicle)/devices/pairing") }
    struct PairBody: Encodable { let code: String; let label: String; let platform: String }
    func pairDevice(_ b: PairBody) async throws -> PairResponse { try await send("POST", "/v1/device/pair", body: b, bearer: "") }
    func devices(_ vehicle: String) async throws -> [DeviceItem] { try await send("GET", "/v1/vehicles/\(vehicle)/devices") }
    func revokeDevice(vehicle: String, device: String) async throws -> [DeviceItem] { try await send("DELETE", "/v1/vehicles/\(vehicle)/devices/\(device)") }
    struct DeviceFrameBody: Encodable {
        var detections: [DetBody]; var items: [ItemBody]; var model: String?; var cameraOk: Bool; var engineOn: Bool
        var lat: Double?; var lon: Double?; var accuracyM: Double?
        var batteryPct: Int?; var charging: Bool; var thermal: String?; var outsideTemp: Double?
    }
    func deviceTelemetry(token: String, _ b: DeviceFrameBody) async throws -> DeviceAck { try await send("POST", "/v1/device/telemetry", body: b, bearer: token) }
    func deviceUnpair(token: String) async { let _: [String: Bool]? = try? await send("DELETE", "/v1/device", bearer: token) }
    struct PauseBody: Encodable { let minutes: Int }
    func pause(_ vehicle: String, minutes: Int) async throws -> VehicleStatus { try await send("POST", "/v1/vehicles/\(vehicle)/pause", body: PauseBody(minutes: minutes)) }
    func resume(_ vehicle: String) async throws -> VehicleStatus { try await send("DELETE", "/v1/vehicles/\(vehicle)/pause") }
    func pushInfo() async throws -> PushInfo { try await send("GET", "/v1/me/push") }
    func pushTest() async throws -> [String: Bool] { try await send("POST", "/v1/me/push/test") }
    func telegramStatus() async throws -> TelegramStatus { try await send("GET", "/v1/me/telegram") }
    func telegramLink() async throws -> TelegramLink { try await send("POST", "/v1/me/telegram/link") }
    func telegramUnlink() async throws { let _: [String: Bool] = try await send("DELETE", "/v1/me/telegram") }
    func telegramTest() async throws -> [String: Bool] { try await send("POST", "/v1/me/telegram/test") }
    /// auto | telegram | ntfy | both. Telegram is used when linked; a failed send falls back to ntfy so an alert is never lost.
    struct ChannelBody: Encodable { let notifyChannel: String }
    func setNotifyChannel(_ channel: String) async throws { let _: UserSettings = try await send("PUT", "/v1/me/settings", body: ChannelBody(notifyChannel: channel)) }

    // Auth
    func sendOtp(phone: String) async throws -> OtpResponse { try await send("POST", "/v1/auth/otp", body: ["phone": phone]) }
    func verify(phone: String, code: String, name: String?) async throws -> AuthResponse {
        try await send("POST", "/v1/auth/verify", body: ["phone": phone, "code": code, "name": name ?? ""])
    }
    func logout() async { let _: [String: Bool]? = try? await send("POST", "/v1/auth/logout") }
    func me() async throws -> Me { try await send("GET", "/v1/me") }
    func updateName(_ name: String) async throws -> Me { try await send("PATCH", "/v1/me", body: ["name": name]) }
    func putSettings(_ s: UserSettings) async throws -> UserSettings { try await send("PUT", "/v1/me/settings", body: s) }

    // Vehicles
    func vehicles() async throws -> [VehicleSummary] { try await send("GET", "/v1/vehicles") }
    func status(_ id: String) async throws -> VehicleStatus { try await send("GET", "/v1/vehicles/\(id)/status") }
    func refresh(_ id: String) async throws -> VehicleStatus { try await send("POST", "/v1/vehicles/\(id)/refresh") }
    func linkStart(code: String) async throws -> LinkStart { try await send("POST", "/v1/vehicles/link", body: ["pair_code": code]) }
    func linkConfirm(challenge: String, code: String, name: String, color: String) async throws -> VehicleStatus {
        try await send("POST", "/v1/vehicles/link/confirm", body: ["challenge_id": challenge, "code": code, "name": name, "color": color])
    }
    func unlink(_ id: String) async throws { let _: [String: Bool] = try await send("DELETE", "/v1/vehicles/\(id)") }
    func scenario(_ id: String, _ name: String) async throws -> VehicleStatus { try await send("POST", "/v1/sim/vehicles/\(id)/scenario", body: ["name": name]) }
    func exitConfirm(_ id: String) async throws -> VehicleStatus { try await send("POST", "/v1/vehicles/\(id)/exit-check/confirm") }
    func camera(_ id: String) async throws -> CameraInfo { try await send("GET", "/v1/vehicles/\(id)/camera") }
    func history(_ id: String, days: Int, level: String) async throws -> History {
        try await send("GET", "/v1/vehicles/\(id)/history", query: ["days": String(days), "level": level])
    }

    func cabinLog(_ id: String, days: Int, kind: String = "all") async throws -> CabinLog {
        try await send("GET", "/v1/vehicles/\(id)/log", query: ["days": String(days), "kind": kind])
    }
    func live(_ id: String) async throws -> LiveSnapshot { try await send("GET", "/v1/vehicles/\(id)/live") }
    func notifications(app: String) async throws -> NotificationFeed { try await send("GET", "/v1/me/notifications", query: ["limit": "30", "app": app]) }
    func logSummary(_ id: String, days: Int) async throws -> LogSummary {
        try await send("GET", "/v1/vehicles/\(id)/log/summary", query: ["days": String(days), "tz": String(TimeZone.current.secondsFromGMT() / 60)])
    }
    func incidentReport(_ id: String) async throws -> IncidentReport { try await send("GET", "/v1/incidents/\(id)/report") }
    func overview(days: Int) async throws -> Overview { try await send("GET", "/v1/me/overview", query: ["days": String(days)]) }
    /// The log as a CSV file (the server builds it; the app only passes it on to the share sheet).
    func cabinLogCSV(_ id: String, days: Int) async throws -> Data {
        var comps = URLComponents(url: baseURL.appendingPathComponent("/v1/vehicles/\(id)/log.csv"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "days", value: String(days))]
        var req = URLRequest(url: comps.url!)
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) } catch { throw APIError.offline }
        guard let code = (resp as? HTTPURLResponse)?.statusCode, (200..<300).contains(code) else {
            throw APIError(status: (resp as? HTTPURLResponse)?.statusCode ?? 0, code: "csv", message: "Không tải được tệp CSV.")
        }
        return data
    }

    struct ClimateBody: Encodable { let action: String; var target: Int?; var mode: String?; var fan: String?; var durationMin: Int? }
    func climate(_ id: String, _ body: ClimateBody) async throws -> VehicleStatus { try await send("POST", "/v1/vehicles/\(id)/climate", body: body) }

    // Phone as a test sensor (dev only)
    struct DetBody: Encodable { let seat: String; let kind: String; let conf: Double; var age: String?; var box: [Double]? = nil }
    struct ItemBody: Encodable { let name: String; let seat: String; let conf: Double; var box: [Double]? = nil }
    struct TelemetryBody: Encodable {
        var seat = "rear_right"; var personConf = 0.0; var petConf = 0.0; var cameraOk: Bool; var locked: Bool; var engineOn = false
        var cabinTemp: Double?; var lat: Double?; var lon: Double?; var accuracyM: Double?
        var detections: [DetBody]?; var items: [ItemBody]?; var model: String?
    }
    func telemetry(_ id: String, _ b: TelemetryBody) async throws -> VehicleStatus { try await send("POST", "/v1/vehicles/\(id)/telemetry", body: b) }
    func telemetryStop(_ id: String) async throws -> VehicleStatus { try await send("DELETE", "/v1/vehicles/\(id)/telemetry") }

    struct GeofenceBody: Encodable { let name: String; let lat: Double; let lon: Double; let radiusM: Int }
    func setGeofence(_ id: String, _ b: GeofenceBody) async throws -> VehicleStatus { try await send("PUT", "/v1/vehicles/\(id)/geofence", body: b) }
    func clearGeofence(_ id: String) async throws -> VehicleStatus { try await send("DELETE", "/v1/vehicles/\(id)/geofence") }

    // Location, alerts, check-in, photo
    func location(_ id: String) async throws -> VehicleLocation { try await send("GET", "/v1/vehicles/\(id)/location") }
    struct LocationBody: Encodable { let vehicleId: String; let lat: Double; let lon: Double; let accuracyM: Double?; let heading: Double? }
    func postLocation(_ b: LocationBody) async throws -> VehicleLocation { try await send("POST", "/v1/location", body: b) }
    func alerts() async throws -> [Incident] { try await send("GET", "/v1/alerts") }
    struct CheckInBody: Encodable { let vehicleId: String; var cabinChecked = false }
    func pickup(child: String, vehicle: String) async throws -> Trip { try await send("POST", "/v1/trips/\(child)/pickup", body: CheckInBody(vehicleId: vehicle)) }
    func dropoff(child: String, vehicle: String, cabinChecked: Bool = false) async throws -> Trip { try await send("POST", "/v1/trips/\(child)/dropoff", body: CheckInBody(vehicleId: vehicle, cabinChecked: cabinChecked)) }
    struct PhotoReceipt: Decodable { let id: String; let bytes: Int }

    func uploadPhoto(_ jpeg: Data, vehicle: String) async throws -> PhotoReceipt {
        var comps = URLComponents(url: baseURL.appendingPathComponent("/v1/media/photo"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "vehicle_id", value: vehicle)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.timeoutInterval = 30
        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.upload(for: req, from: jpeg) } catch { throw APIError.offline }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            if let env = try? decoder.decode(ErrorEnvelope.self, from: data), let d = env.detail { throw APIError(status: code, code: d.code, message: d.message) }
            throw APIError(status: code, code: "http_\(code)", message: "Không gửi được ảnh (lỗi \(code)). Thử lại sau.")
        }
        return try decoder.decode(PhotoReceipt.self, from: data)
    }

    /// ws:// or wss:// URL for a realtime path, carrying the session token.
    func webSocketRequest(_ path: String) -> URLRequest? {
        guard var c = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { return nil }
        c.scheme = c.scheme == "https" ? "wss" : "ws"
        guard let url = c.url else { return nil }
        var r = URLRequest(url: url)
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return r
    }

    // Incidents
    func incident(_ id: String) async throws -> Incident { try await send("GET", "/v1/incidents/\(id)") }
    func view(_ id: String) async throws -> Incident { try await send("POST", "/v1/incidents/\(id)/view") }
    struct ConfirmBody: Encodable { let revision: Int; let checks: [String]; let override: Bool }
    func confirm(_ id: String, revision: Int, checks: [String], override: Bool = false) async throws -> Incident {
        try await send("POST", "/v1/incidents/\(id)/confirm", body: ConfirmBody(revision: revision, checks: checks, override: override))
    }

    // Family
    func members(_ vid: String) async throws -> [Member] { try await send("GET", "/v1/vehicles/\(vid)/members") }
    func invite(_ vid: String, name: String, phone: String, role: String) async throws -> [Member] {
        try await send("POST", "/v1/vehicles/\(vid)/members", body: ["name": name, "phone": phone, "role": role])
    }
    func setRole(_ vid: String, member: String, role: String) async throws -> [Member] {
        try await send("PATCH", "/v1/vehicles/\(vid)/members/\(member)", body: ["role": role])
    }
    func removeMember(_ vid: String, member: String) async throws -> [Member] { try await send("DELETE", "/v1/vehicles/\(vid)/members/\(member)") }

    // Children
    struct ChildBody: Encodable { let name: String; let cls: String; let seat: String; let pickup: String; let dropoff: String; let days: [Int] }
    func children() async throws -> [Child] { try await send("GET", "/v1/children") }
    func addChild(_ b: ChildBody) async throws -> [Child] { try await send("POST", "/v1/children", body: b) }
    func editChild(_ id: String, _ b: ChildBody) async throws -> [Child] { try await send("PUT", "/v1/children/\(id)", body: b) }
    func deleteChild(_ id: String) async throws -> [Child] { try await send("DELETE", "/v1/children/\(id)") }
    func trips(_ vid: String) async throws -> [Trip] { try await send("GET", "/v1/vehicles/\(vid)/trips") }

    // Contacts
    func contacts() async throws -> [Contact] { try await send("GET", "/v1/contacts") }
    func addContact(name: String, rel: String, phone: String) async throws -> [Contact] {
        try await send("POST", "/v1/contacts", body: ["name": name, "rel": rel, "phone": phone])
    }
    func deleteContact(_ id: String) async throws -> [Contact] { try await send("DELETE", "/v1/contacts/\(id)") }
}
