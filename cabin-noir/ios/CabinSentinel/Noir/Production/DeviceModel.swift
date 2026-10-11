import SwiftUI
import UIKit
import UserNotifications
import AudioToolbox

/// The in-car device role: this phone (or Mac) watches the rear seats and reports to the server with its own
/// device token, never with an owner's login. It cannot see door locks or a cabin thermometer and never claims to.
enum OrientationPref: String, CaseIterable, Identifiable {
    case landscape, auto, portrait
    var id: String { rawValue }
    var title: String { ["landscape": "Ngang", "auto": "Tự động", "portrait": "Dọc"][rawValue]! }
    var mask: UIInterfaceOrientationMask { self == .landscape ? .landscape : self == .portrait ? .portrait : .allButUpsideDown }
}

enum NightPref: String, CaseIterable, Identifiable {
    case auto, on, off
    var id: String { rawValue }
    var title: String { ["auto": "Tự động", "on": "Bật", "off": "Tắt"][rawValue]! }
}

@MainActor
@Observable
final class DeviceModel {
    let api: APIClient
    let sensor = PhoneSensor()
    private(set) var token: String?
    private(set) var vehicleName: String?
    private(set) var running = false
    private(set) var lastAck: Date?
    private(set) var error: String?
    private(set) var pausedUntil: Date?
    private(set) var driving = false
    private(set) var outsideTemp: Double?
    private(set) var batteryPct: Int?
    private(set) var charging = false
    private(set) var thermal = "nominal"
    var coverFaces = true
    var dimmed = false
    private(set) var night = false
    private(set) var isDay: Bool?
    private(set) var reminder: String?

    // Settings, kept on the device.
    var orientationPref: OrientationPref { didSet { save(orientationPref.rawValue, "orientation") } }
    var nightPref: NightPref { didSet { save(nightPref.rawValue, "night"); updateNight() } }
    var nightBrightness: Double { didSet { save(nightBrightness, "nightBrightness"); applyBrightness() } }
    var lens: PhoneSensor.Lens { didSet { save(lens.rawValue, "lens"); sensor.setLens(lens) } }
    var showBoxes: Bool { didSet { save(showBoxes, "showBoxes") } }
    var autoDimMinutes: Int { didSet { save(autoDimMinutes, "autoDim") } }
    var rearReminder: Bool { didSet { save(rearReminder, "rearReminder") } }

    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var outsideAt: Date?
    @ObservationIgnored private var fastSince: Date?
    @ObservationIgnored private var slowSince: Date?
    @ObservationIgnored private var savedBrightness: CGFloat?
    @ObservationIgnored private var wasDriving = false
    @ObservationIgnored private var lastTouch = Date()

    var isPaired: Bool { token != nil }

    init(api: APIClient) {
        self.api = api
        token = Keychain.read(service: Keychain.deviceService)
        vehicleName = UserDefaults.standard.string(forKey: "deviceVehicleName")
        let d = UserDefaults.standard
        orientationPref = OrientationPref(rawValue: d.string(forKey: "dev.orientation") ?? "") ?? .landscape
        nightPref = NightPref(rawValue: d.string(forKey: "dev.night") ?? "") ?? .auto
        nightBrightness = d.object(forKey: "dev.nightBrightness") as? Double ?? 0.15
        lens = PhoneSensor.Lens(rawValue: d.string(forKey: "dev.lens") ?? "") ?? .wide
        showBoxes = d.object(forKey: "dev.showBoxes") as? Bool ?? true
        autoDimMinutes = d.object(forKey: "dev.autoDim") as? Int ?? 0
        rearReminder = d.object(forKey: "dev.rearReminder") as? Bool ?? true
        sensor.lens = lens
        #if DEBUG
        // Layout checks in the Simulator (`--preview-device`): the in-car screen without pairing or a server.
        if CommandLine.arguments.contains("--preview-device") { token = "preview"; vehicleName = "Xe thử" }
        #endif
    }

    private func save(_ v: Any, _ key: String) { UserDefaults.standard.set(v, forKey: "dev." + key) }

    static var platform: String { VisionOrientation.onMac ? "mac" : "ios" }

    // MARK: pairing

    /// Returns an error message, or nil when paired.
    func pair(code: String, label: String) async -> String? {
        do {
            let r = try await api.pairDevice(.init(code: code, label: label, platform: Self.platform))
            Keychain.save(r.deviceToken, service: Keychain.deviceService)
            UserDefaults.standard.set(r.vehicle.name, forKey: "deviceVehicleName")
            token = r.deviceToken; vehicleName = r.vehicle.name; error = nil
            return nil
        } catch { return (error as? APIError)?.message ?? error.localizedDescription }
    }

    func unpair() async {
        if let t = token { await api.deviceUnpair(token: t) }
        forget()
    }

    private func forget() {
        stop()
        Keychain.delete(service: Keychain.deviceService)
        UserDefaults.standard.removeObject(forKey: "deviceVehicleName")
        token = nil; vehicleName = nil
    }

    // MARK: running

    func start() async {
        guard token != nil, !running else { return }
        running = true
        UIDevice.current.isBatteryMonitoringEnabled = true
        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        UIApplication.shared.isIdleTimerDisabled = true       // the camera only works while the app is in front
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        await sensor.start()
        task = Task { [weak self] in
            while !Task.isCancelled { await self?.tick(); try? await Task.sleep(for: .seconds(1)) }
        }
    }

    func stop() {
        task?.cancel(); task = nil; running = false
        sensor.stop()
        UIApplication.shared.isIdleTimerDisabled = false
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
        night = false; sensor.setNight(false)
        setDim(false)
    }

    private func tick() async {
        guard let token else { return }
        #if DEBUG
        if CommandLine.arguments.contains("--preview-device") { updateDriving(); updateNight(); return }   // layout checks: no server
        #endif
        updateDriving()
        checkRearSeat()
        readDeviceHealth()
        await refreshOutsideTemp()
        updateNight()
        if autoDimMinutes > 0, !dimmed, Date().timeIntervalSince(lastTouch) > Double(autoDimMinutes) * 60 { setDim(true) }
        let (dets, items) = sensor.detections()
        let body = APIClient.DeviceFrameBody(
            detections: dets, items: items, model: sensor.detector.name,
            cameraOk: sensor.cameraState == "running" && !sensor.covered, engineOn: driving,
            lat: sensor.coord?.latitude, lon: sensor.coord?.longitude, accuracyM: sensor.accuracy,
            batteryPct: batteryPct, charging: charging, thermal: thermal, outsideTemp: outsideTemp)
        do {
            let ack = try await api.deviceTelemetry(token: token, body)
            lastAck = Date(); error = nil
            pausedUntil = ack.pausedUntil.map { Date(timeIntervalSince1970: $0) }
        } catch let e as APIError where e.code == "device_unauthorized" {
            error = e.message
            forget()
        } catch { self.error = (error as? APIError)?.message ?? "Không gửi được dữ liệu." }
    }

    // MARK: signals the device really has

    /// Moving above ~9 km/h for 5 s means the car is being driven; slower than ~4 km/h for 30 s means parked.
    private func updateDriving() {
        let v = sensor.speed
        if v > 2.5 { slowSince = nil; fastSince = fastSince ?? Date() } else if v < 1.0 { fastSince = nil; slowSince = slowSince ?? Date() }
        if let f = fastSince, Date().timeIntervalSince(f) > 5 { driving = true }
        if let s = slowSince, Date().timeIntervalSince(s) > 30 { driving = false }
    }

    private func readDeviceHealth() {
        let level = UIDevice.current.batteryLevel
        batteryPct = level >= 0 ? Int((level * 100).rounded()) : nil
        charging = [.charging, .full].contains(UIDevice.current.batteryState)
        thermal = switch ProcessInfo.processInfo.thermalState {
        case .nominal: "nominal"; case .fair: "fair"; case .serious: "serious"; case .critical: "critical"; @unknown default: "fair"
        }
    }

    /// Outside temperature from Open-Meteo (no key) at the device's position, refreshed every 15 minutes, dropped after 60.
    private func refreshOutsideTemp() async {
        if let at = outsideAt, Date().timeIntervalSince(at) > 3600 { outsideTemp = nil }
        guard let c = sensor.coord, outsideAt == nil || Date().timeIntervalSince(outsideAt!) > 900 else { return }
        outsideAt = Date()   // do not hammer the service when it fails
        let url = URL(string: "https://api.open-meteo.com/v1/forecast?latitude=\(c.latitude)&longitude=\(c.longitude)&current=temperature_2m,is_day")!
        struct R: Decodable { struct C: Decodable { let temperature_2m: Double; let is_day: Int? }; let current: C }
        if let (data, _) = try? await URLSession.shared.data(from: url), let r = try? JSONDecoder().decode(R.self, from: data) {
            outsideTemp = r.current.temperature_2m
            isDay = r.current.is_day.map { $0 == 1 }
        }
    }

    // MARK: screen

    /// A dark screen with the lowest brightness cuts heat and battery use; tapping wakes it.
    func setDim(_ on: Bool) {
        dimmed = on
        if !on { lastTouch = Date() }
        applyBrightness()
    }

    /// Any touch on the in-car screen postpones the automatic dimming.
    func touch() { lastTouch = Date() }

    /// Dimmed wins over night; night uses its own low level so the screen does not dazzle the driver.
    private func applyBrightness() {
        #if !targetEnvironment(macCatalyst)
        let target: CGFloat? = dimmed ? 0.02 : (night ? CGFloat(nightBrightness) : nil)
        if let t = target { savedBrightness = savedBrightness ?? UIScreen.main.brightness; UIScreen.main.brightness = t }
        else if let b = savedBrightness { UIScreen.main.brightness = b; savedBrightness = nil }
        #endif
    }

    // MARK: night

    /// Auto follows the sun at the device's position (Open-Meteo `is_day`); without it, 19:00-06:00.
    private func updateNight() {
        let want: Bool
        switch nightPref {
        case .on: want = true
        case .off: want = false
        case .auto:
            let h = Calendar.current.component(.hour, from: Date())
            want = isDay.map { !$0 } ?? (h >= 19 || h < 6)
        }
        guard want != night else { return }
        night = want; sensor.setNight(want); applyBrightness()
    }

    // MARK: rear-seat reminder

    /// When the car goes from driving to parked and the camera sees someone in the back, chime and say so on this screen,
    /// like a rear-seat reminder. An extra nudge only: it never replaces the alert the server sends to the owner.
    private func checkRearSeat() {
        defer { wasDriving = driving }
        guard wasDriving, !driving, rearReminder else { return }
        let who = sensor.seen.values.filter { $0.conf >= 0.5 && $0.kind != "item" }
        guard !who.isEmpty else { return }
        let seats = Set(who.map(\.seat)).sorted().map { ["rear_left": "sau trái", "rear_mid": "sau giữa", "rear_right": "sau phải"][$0] ?? $0 }
        reminder = "Có thể có người hoặc thú cưng ở ghế \(seats.joined(separator: ", ")). Hãy kiểm tra trước khi rời xe."
        setDim(false)
        Task { for _ in 0..<3 { AudioServicesPlaySystemSound(1005); try? await Task.sleep(for: .seconds(1.2)) } }
        Task { try? await Task.sleep(for: .seconds(60)); reminder = nil }
    }

    func dismissReminder() { reminder = nil }

    /// If the app leaves the foreground the camera stops. Say so on the device, because the owner is told only after ~2 minutes.
    func appStateChanged(active: Bool) {
        let center = UNUserNotificationCenter.current()
        if active { center.removeDeliveredNotifications(withIdentifiers: ["device-background"]); return }
        guard isPaired else { return }
        let c = UNMutableNotificationContent()
        c.title = "Giám sát đã dừng"
        c.body = "Mở lại Cabin Noir trên thiết bị này để tiếp tục canh hàng ghế sau."
        c.sound = .default
        center.add(UNNotificationRequest(identifier: "device-background", content: c, trigger: nil))
    }
}
