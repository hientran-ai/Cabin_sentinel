import SwiftUI
import Combine

// MARK: - First launch

/// Signed-out landing: choose what this device is, and which server it talks to.
struct NoirLanding: View {
    @Environment(AppModel.self) private var model
    @State private var showServer = false
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                Image("vinfast-mark").resizable().scaledToFit().frame(height: 34).foregroundStyle(.white).padding(.top, 56)
                VStack(alignment: .leading, spacing: 6) {
                    Text("An tâm").font(.largeTitle.bold())
                    Text("mỗi chuyến đi").font(.title.bold()).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 24).padding(.top, 32)
                Image("car-vf8").resizable().scaledToFit().padding(.horizontal, 16).padding(.top, 12)
                Text("Báo cho bạn khi có thể có người hoặc thú cưng bị bỏ lại trong xe. Ứng dụng hỗ trợ giám sát, không đảm bảo an toàn tuyệt đối.")
                    .font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 12)
                VStack(spacing: 12) {
                    if model.serverConfigured {
                        Button { path.append("owner") } label: { Label("Tôi là chủ xe hoặc người thân", systemImage: "person.fill").frame(maxWidth: .infinity) }
                            .buttonStyle(NoirProminent()).controlSize(.large)
                        Button { path.append("device") } label: { Label("Máy này đặt trong xe", systemImage: "camera.viewfinder").frame(maxWidth: .infinity) }
                            .buttonStyle(.bordered).controlSize(.large)
                    }
                    Button { showServer = true } label: {
                        Label(model.serverConfigured ? "Máy chủ: \(host)" : "Cài đặt máy chủ để bắt đầu", systemImage: "server.rack").font(.footnote)
                    }
                    .buttonStyle(.borderless).tint(model.serverConfigured ? .secondary : Noir.accent)
                }
                .padding(.horizontal, 20).padding(.bottom, 12)
            }
            .noirList()
            .navigationDestination(for: String.self) { $0 == "owner" ? AnyView(PhoneLoginView()) : AnyView(NoirDevicePairView()) }
            .sheet(isPresented: $showServer) { NavigationStack { NoirServerSettings() }.presentationDetents([.large]) }
            .onAppear { if !model.serverConfigured { showServer = true } }
        }
    }

    private var host: String { URL(string: model.serverURL)?.host ?? model.serverURL }
}

/// Server address with a real check: it must answer, and a production app warns when the server is not in production mode.
struct NoirServerSettings: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var health: ServerHealth?
    @State private var error: String?
    @State private var busy = false

    private var url: URL? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard let u = URL(string: t), let scheme = u.scheme, ["http", "https"].contains(scheme), u.host != nil else { return nil }
        return u
    }
    private var insecure: Bool {
        guard let u = url, u.scheme == "http", let h = u.host else { return false }
        return !(h == "localhost" || h.hasSuffix(".local") || h.hasPrefix("192.168.") || h.hasPrefix("10.") || h.hasPrefix("172.") || h == "127.0.0.1")
    }

    var body: some View {
        Form {
            Section {
                TextField("https://may-chu-cua-ban.vn", text: $text).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            } header: { Text("Địa chỉ máy chủ") } footer: {
                Text("Dùng https khi máy chủ ở ngoài Internet. Trong mạng nội bộ có thể dùng http, ví dụ http://192.168.1.10:8000.")
            }
            if insecure { Section { Label("Địa chỉ http ngoài mạng nội bộ không được iOS cho phép. Hãy dùng https.", systemImage: "lock.trianglebadge.exclamationmark").foregroundStyle(Theme.orange) } }
            if let health {
                Section("Kết quả kiểm tra") {
                    LabeledContent("Máy chủ", value: "Hoạt động")
                    LabeledContent("Chế độ", value: health.env == "production" ? "Production" : (health.env ?? "—"))
                    LabeledContent("Gửi mã đăng nhập", value: ["sms": "SMS", "ntfy_admin": "Kênh quản trị", "dev": "Chỉ thử nghiệm", "none": "Chưa cấu hình"][health.otp ?? "none"] ?? "—")
                    LabeledContent("SMS khẩn cấp", value: health.sms == true ? "Đã cấu hình" : "Chưa cấu hình")
                }
                if health.env != "production" {
                    Section { Label("Máy chủ này không chạy chế độ production. Cảnh báo và đăng nhập có thể không đáng tin cậy.", systemImage: "exclamationmark.triangle.fill").foregroundStyle(Theme.orange) }
                }
            }
            if let error { Section { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Theme.red) } }
            Section {
                Button { Task { await check() } } label: { Group { if busy { ProgressView() } else { Text("Kiểm tra và lưu") } }.frame(maxWidth: .infinity) }
                    .buttonStyle(NoirProminent()).controlSize(.large).disabled(url == nil || busy || insecure)
                    .listRowBackground(Color.clear)
            }
        }
        .noirList().navigationTitle("Máy chủ").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } } }
        .onAppear { text = model.serverURL }
    }

    private func check() async {
        guard let u = url else { return }
        busy = true; error = nil; health = nil
        defer { busy = false }
        let probe = APIClient(baseURL: u)
        do {
            health = try await probe.health()
            model.serverURL = u.absoluteString
            if health?.otp == "none" { error = "Máy chủ chưa cấu hình kênh gửi mã đăng nhập nên chưa thể đăng nhập." }
        } catch { self.error = "Không kết nối được tới máy chủ này. Kiểm tra địa chỉ, mạng, và máy chủ đang chạy." }
    }
}

// MARK: - Adding a vehicle and pairing its device

struct NoirAddVehicleView: View {
    var onDone: () -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var vehicleModel = "VinFast VF 8"
    @State private var plate = ""
    @State private var color = "white"
    @State private var busy = false
    @State private var error: String?
    @State private var created: Vehicle?

    private let models = ["VinFast VF 3", "VinFast VF 5", "VinFast VF 6", "VinFast VF 7", "VinFast VF 8", "VinFast VF 9", "Xe khác"]

    var body: some View {
        if let created {
            NoirPairInstructions(vehicle: created) { onDone(); if model.phase == .main { dismiss() } }
        } else {
            Form {
                Section("Xe của bạn") {
                    TextField("Tên xe, ví dụ: SUV gia đình", text: $name)
                    Picker("Dòng xe", selection: $vehicleModel) { ForEach(models, id: \.self) { Text($0) } }
                    TextField("Biển số", text: $plate).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Picker("Màu xe", selection: $color) { Text("Trắng").tag("white"); Text("Đen").tag("black"); Text("Đỏ").tag("red") }
                }
                Section {
                    CarPicture(vehicle: Vehicle(id: "", model: vehicleModel, plate: "", name: "", color: color, image: ""))
                        .frame(height: 120).frame(maxWidth: .infinity)
                }
                .listRowBackground(Color.clear)
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
                Section {
                    Button { Task { await create() } } label: { Group { if busy { ProgressView() } else { Text("Tiếp tục: ghép thiết bị") } }.frame(maxWidth: .infinity) }
                        .buttonStyle(NoirProminent()).controlSize(.large).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                        .listRowBackground(Color.clear)
                } footer: { Text("Bước sau, bạn nhận một mã để ghép thiết bị đặt trong xe (một điện thoại hoặc máy tính có camera).") }
            }
            .noirList().navigationTitle("Thêm xe")
        }
    }

    private func create() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let st = try await model.api.createVehicle(.init(name: name.trimmingCharacters(in: .whitespaces), model: vehicleModel, plate: plate, color: color))
            try? await model.loadAccount()
            await model.select(st.vehicle.id)
            created = st.vehicle
        } catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
    }
}

/// Shows the pairing code for a vehicle with a countdown, and waits for the device to connect.
struct NoirPairInstructions: View {
    let vehicle: Vehicle
    var onDone: () -> Void
    @Environment(AppModel.self) private var model
    @State private var code: PairingCode?
    @State private var issuedAt = Date()
    @State private var now = Date()
    @State private var error: String?
    @State private var devices: [DeviceItem] = []
    private let tick = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    private var left: Int { max(0, (code?.expiresIn ?? 0) - Int(now.timeIntervalSince(issuedAt))) }

    var body: some View {
        List {
            Section {
                NoirStatusBlock(symbol: devices.contains { $0.online } ? "checkmark.circle.fill" : "link", color: devices.contains { $0.online } ? Theme.green : Noir.accent,
                                kicker: vehicle.name, title: devices.contains { $0.online } ? "Thiết bị đã kết nối" : "Ghép thiết bị trong xe",
                                detail: devices.contains { $0.online } ? "Xe đang được giám sát." : "Trên thiết bị đặt trong xe, mở Cabin Noir, chọn \"Máy này đặt trong xe\" và nhập mã dưới đây.")
                    .padding(.vertical, 6)
            }
            if !devices.contains(where: { $0.online }) {
            Section {
                if let code, left > 0 {
                    VStack(spacing: 6) {
                        Text(code.code).font(.system(size: 44, weight: .semibold, design: .monospaced)).minimumScaleFactor(0.6).contentTransition(.numericText())
                        Text("Hết hạn sau \(mmss(left))").font(.footnote).foregroundStyle(.secondary).monospacedDigit()
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 8).accessibilityElement(children: .combine)
                } else {
                    Text(code == nil ? "Đang tạo mã…" : "Mã đã hết hạn").foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
                Button { Task { await issue() } } label: { Label("Tạo mã mới", systemImage: "arrow.clockwise") }
            } footer: { Text("Mỗi mã dùng được một lần trong 10 phút.") }
            }
            if !devices.isEmpty {
                Section("Thiết bị đã ghép") {
                    ForEach(devices) { d in
                        HStack {
                            Label(d.label, systemImage: d.platform == "mac" ? "laptopcomputer" : "iphone")
                            Spacer()
                            Text(d.online ? "Đang gửi dữ liệu" : "Chưa gửi").font(.footnote).foregroundStyle(d.online ? Theme.green : .secondary)
                        }
                    }
                }
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
            Section {
                Button { onDone() } label: { Text(devices.contains { $0.online } ? "Xong" : "Để sau").frame(maxWidth: .infinity) }
                    .buttonStyle(NoirProminent()).controlSize(.large).listRowBackground(Color.clear)
            }
        }
        .noirList().navigationTitle("Ghép thiết bị").navigationBarTitleDisplayMode(.inline)
        .task { await issue() }
        .onReceive(tick) { now = $0; Task { devices = (try? await model.api.devices(vehicle.id)) ?? devices } }
        .sensoryFeedback(.success, trigger: devices.contains { $0.online })
    }

    private func issue() async {
        do { code = try await model.api.pairingCode(vehicle.id); issuedAt = Date(); now = Date(); error = nil }
        catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
    }
}

// MARK: - Managing devices (Tài khoản)

struct NoirDevices: View {
    @Environment(AppModel.self) private var model
    @State private var devices: [DeviceItem] = []
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        List {
            if let v = model.selected?.vehicle {
                Section {
                    ForEach(devices) { d in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Label(d.label, systemImage: d.platform == "mac" ? "laptopcomputer" : "iphone").font(.headline)
                                Spacer()
                                Text(d.online ? "Đang gửi dữ liệu" : "Mất kết nối").font(.footnote).foregroundStyle(d.online ? Theme.green : Theme.red)
                            }
                            Text(detail(d)).font(.footnote).foregroundStyle(.secondary)
                        }
                        .swipeActions { Button("Ngắt", role: .destructive) { Task { await revoke(v.id, d.id) } } }
                    }
                    if loaded && devices.isEmpty {
                        ContentUnavailableView("Chưa có thiết bị", systemImage: "camera.viewfinder", description: Text("Xe này chưa được giám sát. Ghép một thiết bị đặt trong xe."))
                            .listRowBackground(Color.clear)
                    }
                } header: { Text(v.name) }
                Section {
                    NavigationLink { NoirPairInstructions(vehicle: v, onDone: {}) } label: { Label("Tạo mã ghép nối", systemImage: "plus.circle") }
                } footer: { Text("Vuốt sang trái trên một thiết bị để ngắt. Thiết bị bị ngắt không thể gửi dữ liệu nữa.") }
            } else {
                ContentUnavailableView("Chưa có xe", systemImage: "car", description: Text("Thêm xe trước khi ghép thiết bị."))
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
        }
        .noirList().navigationTitle("Thiết bị trong xe")
        .task(id: model.selected?.id) { await load() }
        .refreshable { await load() }
    }

    private func detail(_ d: DeviceItem) -> String {
        var parts: [String] = []
        if let b = d.info?.battery { parts.append("Pin \(b)%" + (d.info?.charging == true ? " (đang sạc)" : "")) }
        if let t = d.info?.thermal { parts.append(["nominal": "Máy mát", "fair": "Máy hơi ấm", "serious": "Máy nóng", "critical": "Máy quá nóng"][t] ?? t) }
        if let s = d.lastSeen { parts.append("Gửi lần cuối \(clock(s))") }
        return parts.isEmpty ? "Chưa gửi dữ liệu" : parts.joined(separator: " · ")
    }

    private func load() async {
        guard let id = model.selected?.id else { return }
        do { devices = try await model.api.devices(id); error = nil } catch { self.error = (error as? APIError)?.message }
        loaded = true
    }

    private func revoke(_ vehicle: String, _ device: String) async {
        do { devices = try await model.api.revokeDevice(vehicle: vehicle, device: device) } catch { self.error = (error as? APIError)?.message }
    }
}

// MARK: - Push

/// Cảnh báo tới điện thoại kể cả khi app đóng: through ntfy until APNs is available. Explains why before asking for anything.
struct NoirPushSetup: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var info: PushInfo?
    @State private var error: String?
    @State private var testResult: Bool?
    @State private var busy = false
    @State private var telegram: TelegramStatus?
    @State private var channel = "auto"
    @State private var tgNote: String?
    @State private var linking = false

    var body: some View {
        List {
            if let t = telegram, t.configured { telegramSection(t) }
            Section {
                NoirStatusBlock(symbol: "bell.badge.fill", color: Noir.accent, kicker: "Thông báo đẩy", title: "Nhận cảnh báo khi đã đóng ứng dụng",
                                detail: "Cabin Noir gửi cảnh báo qua ntfy, một ứng dụng miễn phí. Nhờ vậy điện thoại rung và hiện cảnh báo ngay cả khi bạn không mở ứng dụng.")
                    .padding(.vertical, 6)
            }
            Section("Cách bật (một lần)") {
                step(1, "Cài ứng dụng ntfy", "ntfy trên App Store.")
                step(2, "Đăng ký kênh riêng của bạn", "Bấm nút dưới, ntfy tự thêm kênh. Đừng chia sẻ tên kênh.")
                step(3, "Cho phép thông báo trong ntfy", "Chọn \"Thông báo khẩn\" nếu iOS hỏi.")
            }
            Section {
                Button { if let u = info.flatMap({ URL(string: $0.subscribeUrl) }) { openURL(u) } } label: { Label("Đăng ký trong ntfy", systemImage: "arrow.up.forward.app") }.disabled(info == nil)
                Button { openURL(URL(string: "https://apps.apple.com/app/ntfy/id1625396347")!) } label: { Label("Tải ntfy trên App Store", systemImage: "arrow.down.app") }
                Button {
                    Task { busy = true; testResult = (try? await model.api.pushTest())?["sent"]; busy = false }
                } label: { HStack { Label("Gửi thông báo thử", systemImage: "paperplane"); if busy { Spacer(); ProgressView() } } }
                .disabled(busy)
                if let r = testResult {
                    Label(r ? "Đã gửi. Kiểm tra điện thoại của bạn." : "Không gửi được. Kiểm tra máy chủ và kết nối ntfy.", systemImage: r ? "checkmark.circle.fill" : "xmark.octagon.fill")
                        .foregroundStyle(r ? Theme.green : Theme.red)
                }
            }
            if let info {
                Section("Kênh của bạn") {
                    LabeledContent("Máy chủ ntfy", value: URL(string: info.server)?.host ?? info.server)
                    Text(info.topic).font(.footnote.monospaced()).textSelection(.enabled)
                }
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
        }
        .noirList().navigationTitle("Thông báo đẩy").navigationBarTitleDisplayMode(.inline)
        .task {
            do { info = try await model.api.pushInfo() } catch { self.error = (error as? APIError)?.message }
            telegram = try? await model.api.telegramStatus()
            channel = model.me?.settings.notifyChannel ?? "auto"
        }
    }

    /// Telegram replaces ntfy while it is linked. Messages hold only the vehicle name, plate and what the camera saw, never photos or phone numbers.
    @ViewBuilder private func telegramSection(_ t: TelegramStatus) -> some View {
        Section {
            Label(t.linked ? "Đã liên kết Telegram" : "Chưa liên kết Telegram", systemImage: t.linked ? "checkmark.circle.fill" : "paperplane.circle")
                .foregroundStyle(t.linked ? Theme.green : .secondary)
            if t.linked {
                Button {
                    Task { busy = true; defer { busy = false }; let ok = (try? await model.api.telegramTest())?["sent"] ?? false; tgNote = ok ? "Đã gửi tin thử tới Telegram." : "Không gửi được tin thử." }
                } label: { Label("Gửi tin thử", systemImage: "paperplane") }.disabled(busy)
                Button(role: .destructive) {
                    Task { try? await model.api.telegramUnlink(); telegram = try? await model.api.telegramStatus() }
                } label: { Label("Hủy liên kết", systemImage: "xmark.circle") }
            } else {
                Button {
                    Task { await linkTelegram() }
                } label: { HStack { Label("Liên kết Telegram", systemImage: "link"); if linking { Spacer(); ProgressView() } } }.disabled(linking)
            }
            Picker("Kênh nhận thông báo", selection: $channel) {
                Text("Tự động").tag("auto"); Text("Telegram").tag("telegram"); Text("ntfy").tag("ntfy"); Text("Cả hai").tag("both")
            }
            .onChange(of: channel) { _, v in Task { try? await model.api.setNotifyChannel(v) } }
            if let tgNote { Text(tgNote).font(.footnote).foregroundStyle(.secondary) }
        } header: { Text("Telegram") } footer: {
            Text("Tự động: dùng Telegram khi đã liên kết, nếu Telegram lỗi thì chuyển sang ntfy để không mất cảnh báo. Telegram là dịch vụ nước ngoài, chỉ liên kết khi bạn đồng ý.")
        }
    }

    private func linkTelegram() async {
        linking = true; defer { linking = false }
        guard let l = try? await model.api.telegramLink(), let link = l.deepLink.flatMap({ URL(string: $0) }) else { tgNote = "Không tạo được liên kết. Kiểm tra máy chủ."; return }
        openURL(link)
        // Bấm Start trong Telegram xong, máy chủ ghi nhận; hỏi lại vài lần cho tới khi thấy đã liên kết.
        for _ in 0..<45 {
            try? await Task.sleep(for: .seconds(2))
            if let st = try? await model.api.telegramStatus(), st.linked { telegram = st; tgNote = "Đã liên kết."; return }
        }
        tgNote = "Chưa thấy liên kết. Mở Telegram, bấm Start rồi thử lại."
    }

    private func step(_ n: Int, _ t: String, _ d: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)").font(.footnote.bold()).frame(width: 24, height: 24).background(.quaternary, in: Circle())
            VStack(alignment: .leading, spacing: 2) { Text(t).font(.body); Text(d).font(.footnote).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Escalation, with honest states

/// What was really sent. A step that could not run (no SMS provider, no automatic calls) says so instead of "done".
struct NoirEscalation: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let esc = model.status?.incident?.escalation
        List {
            Section {
                Text("Hệ thống thử lần lượt các kênh dưới đây cho tới khi có người mở cảnh báo, bấm \"Đã xem\" hoặc xác nhận đã kiểm tra xe. Bước nào không gửi được sẽ ghi rõ, không báo là đã làm.")
                    .font(.callout).foregroundStyle(.secondary)
            }
            Section {
                ForEach(steps(esc)) { s in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: icon(s.state)).foregroundStyle(color(s.state)).frame(width: 26)
                            .symbolRenderingMode(.hierarchical)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(s.title).font(.body)
                            Text(s.note).font(.footnote).foregroundStyle(.secondary)
                            Text(label(s)).font(.footnote.weight(.semibold)).foregroundStyle(color(s.state))
                        }
                        Spacer(minLength: 0)
                        Text(s.offset >= 60 ? "\(s.offset / 60)′\(s.offset % 60 == 0 ? "" : String(format: "%02d", s.offset % 60))" : "\(s.offset)″").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .noirList().navigationTitle("Khi không nhận được thông báo").navigationBarTitleDisplayMode(.inline)
    }

    private func steps(_ e: Escalation?) -> [EscalationStep] {
        if let e { return e.steps }
        let base: [(Int, String, String)] = [(0, "Thông báo khẩn tới mọi điện thoại trong gia đình", "Nhắc lại mỗi 60 giây"),
                                              (30, "SMS tới chủ xe", "Nếu chưa ai mở cảnh báo"), (60, "Gọi tự động tới chủ xe", "Chưa hỗ trợ"),
                                              (90, "SMS người liên hệ khẩn cấp", "Áp dụng cho sự cố Nghiêm trọng"),
                                              (120, "Gọi người nhà dùng chung ứng dụng", "Chưa hỗ trợ"),
                                              (180, "Gợi ý gọi 112", "Ứng dụng không tự gọi 112 và không mở khóa xe")]
        return base.map { EscalationStep(offset: $0.0, key: "\($0.0)", title: $0.1, note: $0.2, state: "idle", at: 0) }
    }

    private func label(_ s: EscalationStep) -> String {
        switch s.state {
        case "done": return "Đã gửi lúc \(clock(s.at))" + (s.detail.map { $0.isEmpty ? "" : " · \($0)" } ?? "")
        case "skipped": return "Không thực hiện" + (s.detail.map { $0.isEmpty ? "" : ": " + $0.replacingOccurrences(of: "skipped: ", with: "") } ?? "")
        case "failed": return "Gửi lỗi" + (s.detail.map { $0.isEmpty ? "" : ": \($0)" } ?? "") + ", sẽ thử lại"
        case "pending": return "Chờ tới \(clock(s.at))"
        case "stopped": return "Đã dừng · có người xem"
        default: return "Sau \(s.offset) giây kể từ khi phát hiện"
        }
    }

    private func icon(_ state: String) -> String {
        ["done": "checkmark.circle.fill", "skipped": "minus.circle", "failed": "exclamationmark.triangle.fill", "stopped": "hand.raised.fill", "pending": "clock"][state] ?? "circle"
    }

    private func color(_ state: String) -> Color {
        switch state { case "done": return Theme.green; case "failed": return Theme.red; case "skipped": return Theme.orange; case "stopped": return Theme.green; default: return .secondary }
    }
}
