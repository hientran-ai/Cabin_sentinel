import Foundation
import Observation
import Security
import SwiftUI
import UserNotifications

enum Phase: Equatable {
    case launching
    case signedOut
    case onboarding(OnboardingStep)
    case main
}

enum OnboardingStep: Equatable { case purpose, link, consent, notifications }

enum AppMode: String { case demo, live }

@MainActor
@Observable
final class AppModel {
    #if PRODUCTION
    static let defaultServer = ""   // production never guesses a server: it is entered (and checked) on first launch
    #else
    static let defaultServer = "http://127.0.0.1:8000"
    #endif

    let alertsSocket = WebSocketService()
    /// The phone acting as the in-car device. Owned here so it keeps feeding the backend while you look at other tabs.
    let phone = PhoneSensor()
    private(set) var phoneStreaming = false
    var phoneLocked = true
    var phoneEngineOn = false
    private(set) var notifAuth: UNAuthorizationStatus = .notDetermined
    private(set) var testRun: TestRun?
    private var testTask: Task<Void, Never>?

    /// One timed camera test: engine off + locked, camera on for N minutes, and proof of what happened.
    struct TestRun {
        var start = Date()
        var duration: TimeInterval
        var frames = 0, personFrames = 0
        var personFirstAt: Date?
        var alertAt: Date?
        var alertLevel: String?
        var incidentId: String?
        var notified: Bool?
        var finished = false
        var end: Date { start.addingTimeInterval(duration) }
        var alertDelay: TimeInterval? {
            guard let a = personFirstAt, let b = alertAt else { return nil }
            return b.timeIntervalSince(a)
        }
    }
    var phoneTemp = 30.0
    private(set) var phoneError: String?
    private var phoneTask: Task<Void, Never>?
    /// While the phone is the source, simulator scenarios are paused so alerts reflect only what the camera sees.
    var simPaused: Bool { status?.source == "phone" }
    private(set) var openAlertIds: [String] = []
    var phase: Phase = .launching
    var me: Me?
    var vehicles: [VehicleSummary] = []
    var selectedId: String? { didSet { UserDefaults.standard.set(selectedId, forKey: "selectedVehicle") } }
    var status: VehicleStatus?
    var trips: [Trip] = []
    var children: [Child] = []
    var lastError: String?
    var lastUpdated: Date?
    var tab: Int = 0
    var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: "server"); if let u = URL(string: serverURL), u.host != nil { api.baseURL = u } }
    }

    let api: APIClient
    private var pollTask: Task<Void, Never>?
    private let notifier = Notifier()

    var settings: UserSettings? { me?.settings }
    #if PRODUCTION
    var demo: Bool { false }
    var serverConfigured: Bool { !serverURL.isEmpty }
    #else
    var demo: Bool { me?.settings.demoMode ?? false }
    var serverConfigured: Bool { true }
    #endif
    /// Demo: the backend simulator drives the vehicle. Live: real phone GPS, camera and realtime channels.
    var mode: AppMode { demo ? .demo : .live }

    /// Used by the realtime channel: publish a pushed status only when it really changed.
    func apply(status ns: VehicleStatus) {
        if ns.vehicle.id == selected?.id, ns != status { withAnimation(.snappy(duration: 0.25)) { status = ns } }
    }
    var selected: VehicleSummary? { vehicles.first { $0.id == selectedId } ?? vehicles.first }

    init() {
        let server = UserDefaults.standard.string(forKey: "server") ?? Self.defaultServer
        serverURL = server
        api = APIClient(baseURL: URL(string: server) ?? URL(string: "http://127.0.0.1:8000")!)
        selectedId = UserDefaults.standard.string(forKey: "selectedVehicle")
    }

    // MARK: session

    func boot() async {
        guard serverConfigured, let token = Keychain.read() else { phase = .signedOut; return }
        api.token = token
        do {
            try await loadAccount()
            phase = vehicles.isEmpty ? .onboarding(.link) : .main
            startPolling()
        } catch let e as APIError where e.status == 401 {
            Keychain.delete(); api.token = nil; phase = .signedOut
        } catch {
            // Keep the session; show the main screen with an explicit connection error.
            lastError = (error as? APIError)?.message ?? error.localizedDescription
            phase = .main
            startPolling()
        }
    }

    func signedIn(_ auth: AuthResponse) async {
        Keychain.save(auth.token)
        api.token = auth.token
        try? await loadAccount()
        if auth.isNew || vehicles.isEmpty { phase = .onboarding(auth.isNew ? .purpose : .link) } else { phase = .main }
        startPolling()
    }

    func signOut() async {
        pollTask?.cancel()
        alertsSocket.disconnect()
        #if PRODUCTION && canImport(ActivityKit) && !targetEnvironment(macCatalyst)
        LiveActivityCenter.shared.endAll()
        #endif
        await api.logout()
        Keychain.delete()
        api.token = nil
        me = nil; vehicles = []; status = nil; trips = []; children = []; tab = 0
        phase = .signedOut
    }

    func loadAccount() async throws {
        me = try await api.me()
        vehicles = try await api.vehicles()
        children = (try? await api.children()) ?? []
        if selected == nil || !vehicles.contains(where: { $0.id == selectedId }) { selectedId = vehicles.first?.id }
        try await refreshSelected()
    }

    func updateSettings(_ change: (inout UserSettings) -> Void) async {
        guard var s = me?.settings else { return }
        change(&s)
        do {
            let saved = try await api.putSettings(s)
            if let m = me { me = Me(id: m.id, phone: m.phone, name: m.name, settings: saved) }
        } catch { lastError = (error as? APIError)?.message }
    }

    // MARK: polling

    /// Realtime alerts: a pushed change triggers an immediate refresh; 2 s polling stays as the fallback.
    private func startAlertSocket() {
        alertsSocket.connect({ [weak self] in self?.api.webSocketRequest("/ws/alerts") }) { [weak self] data in
            Task { @MainActor in
                guard let self, let f = try? self.api.decoder.decode(WSFrame.self, from: data), f.type == "alerts" else { return }
                let ids = (f.alerts ?? []).filter { $0.status == "open" }.map(\.id)
                if ids != self.openAlertIds { self.openAlertIds = ids; await self.tick() }
            }
        }
    }

    func startPolling() {
        startAlertSocket()
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func tick() async {
        guard api.token != nil else { return }
        do {
            let vs = try await api.vehicles()
            if vs != vehicles { vehicles = vs }
            if selected == nil { selectedId = vehicles.first?.id }
            try await refreshSelected()
            if lastError != nil { lastError = nil }
            lastUpdated = Date()
            notifier.observe(vehicles: vehicles, status: status, trips: trips, settings: settings)
            #if PRODUCTION && canImport(ActivityKit) && !targetEnvironment(macCatalyst)
            LiveActivityCenter.shared.observe(status: status, trips: trips, demo: demo, lastUpdated: lastUpdated)
            #endif
        } catch let e as APIError where e.status == 401 {
            await signOut()
        } catch {
            lastError = (error as? APIError)?.message ?? "Mất kết nối."
        }
    }

    func refreshSelected() async throws {
        guard let id = selected?.id else { status = nil; trips = []; return }
        async let s = api.status(id)
        async let t = try? api.trips(id)
        let (ns, nt) = try await (s, t ?? [])
        // Only publish real changes so SwiftUI does not re-render (and re-animate) every poll.
        if ns != status { withAnimation(.snappy(duration: 0.25)) { status = ns } }
        if nt != trips { trips = nt }
    }

    func select(_ id: String) async {
        selectedId = id
        status = nil
        try? await refreshSelected()
    }

    /// Run an action that returns fresh vehicle status, keeping errors visible.
    @discardableResult
    func perform(_ op: () async throws -> VehicleStatus) async -> String? {
        do {
            let ns = try await op()
            withAnimation(.snappy(duration: 0.25)) { status = ns }
            // Side lists refresh in the background; the action returns as soon as status is in.
            Task { [weak self] in
                guard let self else { return }
                if let vs = try? await api.vehicles(), vs != vehicles { vehicles = vs }
                if let id = selected?.id, let t = try? await api.trips(id), t != trips { trips = t }
            }
            return nil
        } catch {
            return (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    func startPhone() async {
        guard !phoneStreaming else { return }
        await phone.start()
        phoneStreaming = true
        phoneTask = Task { [weak self] in
            while !Task.isCancelled { await self?.pushPhone(); try? await Task.sleep(for: .seconds(1)) }
        }
    }

    func stopPhone() async {
        phoneTask?.cancel(); phoneTask = nil; phoneStreaming = false
        phone.stop()
        if let id = selected?.id { _ = await perform { try await api.telemetryStop(id) } }
    }

    private func pushPhone() async {
        guard let id = selected?.id else { return }
        let (dets, items) = phone.detections()
        let b = APIClient.TelemetryBody(cameraOk: !phone.covered, locked: phoneLocked, engineOn: phoneEngineOn, cabinTemp: phoneTemp,
                                        lat: phone.coord?.latitude, lon: phone.coord?.longitude, accuracyM: phone.accuracy,
                                        detections: dets, items: items, model: phone.detector.name)
        do {
            let ns = try await api.telemetry(id, b)
            apply(status: ns); phoneError = nil
            trackTest(sawPerson: dets.contains { $0.kind == "person" }, status: ns)
        } catch { phoneError = (error as? APIError)?.message ?? "Không gửi được dữ liệu." }
    }

    func refreshNotifAuth() async { notifAuth = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus }

    func requestNotifAuth() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        await refreshNotifAuth()
    }

    func sendTestNotification() {
        let c = UNMutableNotificationContent()
        c.title = "Thông báo thử"; c.body = "Nếu bạn thấy dòng này, cảnh báo của CabinSentinel sẽ hiện được."; c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "test-\(Date().timeIntervalSince1970)", content: c, trigger: nil))
    }

    var notifOK: Bool { notifAuth == .authorized || notifAuth == .provisional }
    var preflight: [(String, Bool)] {
        [("Camera đang mở", phone.cameraState == "running"),
         ("Thông báo đã được cho phép", notifOK),
         ("Kết nối được backend", lastError == nil),
         ("Không có sự cố cũ đang mở", status?.incident == nil),
         ("Xe đã tắt máy và khóa", !phoneEngineOn && phoneLocked)]
    }

    func startTest(minutes: Int) async {
        guard testRun == nil || testRun?.finished == true else { return }
        testRun = TestRun(duration: TimeInterval(minutes * 60))
        await startPhone()
        testTask = Task { [weak self] in
            while !Task.isCancelled, let end = self?.testRun?.end, Date() < end { try? await Task.sleep(for: .seconds(1)) }
            if !Task.isCancelled { await self?.finishTest() }
        }
    }

    func finishTest() async {
        testTask?.cancel(); testTask = nil
        if var t = testRun, !t.finished {
            if let iid = t.incidentId {
                let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
                t.notified = delivered.contains { $0.request.identifier.hasPrefix(iid) }
            }
            t.finished = true
            testRun = t
        }
        await stopPhone()   // camera off at the end of the window
    }

    func dismissTest() { testRun = nil }

    private func trackTest(sawPerson: Bool, status ns: VehicleStatus) {
        guard var t = testRun, !t.finished else { return }
        t.frames += 1
        if sawPerson { t.personFrames += 1; t.personFirstAt = t.personFirstAt ?? Date() }
        if t.alertAt == nil, let inc = ns.incident, inc.level == "warning" || inc.level == "critical" {
            t.alertAt = Date(); t.alertLevel = inc.level; t.incidentId = inc.id
        }
        testRun = t
    }

    func runScenario(_ name: String) async -> String? {
        guard let id = selected?.id else { return "Chưa có xe." }
        return await perform { try await api.scenario(id, name) }
    }

    func reloadChildren() async { children = (try? await api.children()) ?? children }
}

// MARK: - Keychain

enum Keychain {
    private static let sessionService = "vn.cabinsentinel.session"
    static let deviceService = "vn.cabinsentinel.device"

    /// Unsigned Simulator builds cannot always use the Keychain, so there the token is mirrored in UserDefaults
    /// (never on a real device, where only the Keychain is used).
    #if targetEnvironment(simulator)
    private static func mirrorKey(_ s: String) -> String { "sim.keychain." + s }
    #endif

    static func save(_ token: String, service: String = sessionService) {
        delete(service: service)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecValueData as String: Data(token.utf8),
                                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
        #if targetEnvironment(simulator)
        UserDefaults.standard.set(token, forKey: mirrorKey(service))
        #endif
    }

    static func read(service: String = sessionService) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data { return String(data: d, encoding: .utf8) }
        #if targetEnvironment(simulator)
        return UserDefaults.standard.string(forKey: mirrorKey(service))
        #else
        return nil
        #endif
    }

    static func delete(service: String = sessionService) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
        #if targetEnvironment(simulator)
        UserDefaults.standard.removeObject(forKey: mirrorKey(service))
        #endif
    }
}

// MARK: - Local notifications (stand-in for push until APNs is configured)

@MainActor
final class Notifier {
    private var seenIncidents: [String: String] = [:]
    private var tripStages: [String: String] = [:]
    private var exitPending = false
    private var climateStatus: String?
    private var primed = false

    func observe(vehicles: [VehicleSummary], status: VehicleStatus?, trips: [Trip], settings: UserSettings?) {
        defer { primed = true }
        for v in vehicles {
            guard let iid = v.incidentId, let level = v.level else { continue }
            let key = "\(iid):\(level)"
            if seenIncidents[iid] != key {
                if primed, level == "critical" || level == "warning", settings?.notifyWarning != false || level == "critical" {
                    post(id: key,
                         title: level == "critical" ? "Nghiêm trọng: \(v.title ?? "có thể có người trong xe")" : "Cảnh báo: \(v.title ?? "có thể có người trong xe")",
                         body: "\(v.vehicle.name) · \(v.vehicle.plate). Mở ứng dụng để xem việc cần làm.")
                }
                seenIncidents[iid] = key
            }
        }
        for t in trips where tripStages[t.child.id] != t.stage {
            if primed, settings?.notifyInfo != false, let line = tripLine(t) { post(id: "trip-\(t.child.id)-\(t.stage)", title: line.0, body: line.1) }
            tripStages[t.child.id] = t.stage
        }
        if let ec = status?.exitCheck {
            if ec.pending && !exitPending && primed && settings?.exitReminder != false {
                post(id: "exit-\(Date().timeIntervalSince1970)", title: "Kiểm tra ghế sau trước khi khóa xe",
                     body: "Cảm biến vẫn thấy có người ở \(ec.seats.first?.label.lowercased() ?? "ghế sau").")
            }
            exitPending = ec.pending
        }
        if let c = status?.climate?.status {
            if c == "fail" && climateStatus != "fail" && primed { post(id: "climate-fail", title: "Xe chưa phản hồi lệnh điều hòa", body: "Kiểm tra sóng di động rồi thử lại.") }
            climateStatus = c
        }
    }

    private func tripLine(_ t: Trip) -> (String, String)? {
        let n = t.child.name
        switch t.stage {
        case "boarded": return ("\(n) đã lên xe", "\(t.seatLabel) · tại Nhà")
        case "arrived": return ("\(n) đã xuống xe tại trường", "Cổng Trường TH Kim Đồng")
        case "late": return ("Chưa thấy \(n) lên xe", "Đã quá giờ đón \(t.pickup).")
        case "leftin": return ("Có thể \(n) còn trong xe", "Xe đã khóa. Kiểm tra xe ngay.")
        default: return nil
        }
    }

    private func post(id: String, title: String, body: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }
}
