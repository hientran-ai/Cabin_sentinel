import SwiftUI

// MARK: - Pairing

/// Enter the code the owner generated in the app. After this the device runs on its own token.
struct NoirDevicePairView: View {
    @Environment(DeviceModel.self) private var device
    @Environment(AppModel.self) private var model
    @State private var showServer = false
    @State private var code = ""
    @State private var label = ""
    @State private var busy = false
    @State private var error: String?

    private var cleaned: String { code.uppercased().filter { $0.isLetter || $0.isNumber } }

    var body: some View {
        Form {
            Section {
                Text("Mở Cabin Noir trên điện thoại của chủ xe, vào Tài khoản › Thiết bị trong xe › Tạo mã ghép nối, rồi nhập mã 8 ký tự vào đây.")
                    .font(.callout).foregroundStyle(.secondary)
            }
            Section("Mã ghép nối") {
                TextField("XXXX-XXXX", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .font(.title3.monospaced().weight(.semibold))
                    .onChange(of: code) { code = Self.format(code) }
            }
            Section("Tên thiết bị") {
                TextField("Ví dụ: iPhone cũ đặt ở gương", text: $label)
            }
            Section {
                LabeledContent("Đang dùng", value: URL(string: model.serverURL)?.host ?? model.serverURL)
                Button("Đổi địa chỉ máy chủ") { showServer = true }
            } header: { Text("Máy chủ") } footer: {
                Text("Mã ghép nối chỉ dùng được trên đúng máy chủ đã tạo ra nó. Nếu báo không kết nối được, địa chỉ này có thể đã cũ.")
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
            Section {
                Button {
                    Task { busy = true; error = await device.pair(code: cleaned, label: label.isEmpty ? "Thiết bị trong xe" : label); busy = false }
                } label: { Group { if busy { ProgressView() } else { Text("Ghép nối") } }.frame(maxWidth: .infinity) }
                .buttonStyle(NoirProminent()).controlSize(.large).disabled(cleaned.count != 8 || busy)
                .listRowBackground(Color.clear)
            } footer: {
                Text("Thiết bị chỉ được ghép với một xe và chỉ gửi kết quả nhận diện (ghế, độ tin cậy). Hình ảnh không rời khỏi máy.")
            }
        }
        .noirList()
        .navigationTitle("Ghép nối thiết bị")
        .sheet(isPresented: $showServer) { NavigationStack { NoirServerSettings() }.presentationDetents([.large]) }
    }

    static func format(_ raw: String) -> String {
        let c = String(raw.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
        return c.count > 4 ? c.prefix(4) + "-" + c.dropFirst(4) : c
    }
}

// MARK: - The in-car screen

struct NoirDeviceHome: View {
    @Environment(DeviceModel.self) private var device
    @Environment(\.scenePhase) private var phase
    @State private var confirmUnpair = false
    @State private var showInfo = false
    @State private var showSettings = false

    private var sensor: PhoneSensor { device.sensor }
    private let seatShort = ["rear_left": "Sau trái", "rear_mid": "Sau giữa", "rear_right": "Sau phải"]

    var body: some View {
        GeometryReader { g in
            let wide = g.size.width > g.size.height * 1.1
            ZStack {
                Color.black.ignoresSafeArea()
                if wide {
                    HStack(spacing: 0) {
                        feed.frame(maxWidth: .infinity, maxHeight: .infinity)
                            .overlay(alignment: .topLeading) { if !device.dimmed { statusChip.padding(10) } }
                        if !device.dimmed { rail }
                    }
                } else {
                    feed
                }
                if let r = device.reminder, !device.dimmed { reminderCard(r) }
                if device.dimmed { dimLayer }
            }
            .overlay(alignment: .top) { if !device.dimmed && !wide { top } }
            .overlay(alignment: .bottom) { if !device.dimmed && !wide { bottom } }
            .onChange(of: g.size) { syncOrientation() }
        }
        .simultaneousGesture(TapGesture().onEnded { device.touch() })
        .task { await device.start() }
        .onAppear { OrientationLock.apply(device.orientationPref.mask); syncOrientation() }
        .onDisappear { OrientationLock.apply(.portrait) }
        .onChange(of: device.orientationPref) { OrientationLock.apply(device.orientationPref.mask); syncOrientation() }
        .onReceive(NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)) { _ in syncOrientation() }
        .onChange(of: phase) { device.appStateChanged(active: phase == .active) }
        .confirmationDialog("Ngắt ghép nối thiết bị này?", isPresented: $confirmUnpair, titleVisibility: .visible) {
            Button("Ngắt ghép nối", role: .destructive) { Task { await device.unpair() } }
            Button("Hủy", role: .cancel) {}
        } message: { Text("Xe sẽ không còn được giám sát bởi thiết bị này. Chủ xe sẽ nhận cảnh báo mất kết nối.") }
        .sheet(isPresented: $showInfo) { info }
        .sheet(isPresented: $showSettings) { NoirDeviceSettings(onUnpair: { showSettings = false; confirmUnpair = true }) }
        .preferredColorScheme(.dark)
    }

    /// Tell the sensor how the phone is held once the rotation has settled.
    private func syncOrientation() {
        #if !targetEnvironment(macCatalyst)
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            if let o = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.effectiveGeometry.interfaceOrientation { sensor.setInterface(o) }
        }
        #endif
    }

    @ViewBuilder private var feed: some View {
        switch sensor.cameraState {
        case "running":
            ZStack {
                // Night: a grey, brighter picture is easier to read in a dark cabin. Boxes and labels keep their colours.
                PreviewLayer(session: sensor.session, rotation: sensor.previewRotation)
                    .saturation(device.night ? 0 : 1).brightness(device.night ? 0.12 : 0).contrast(device.night ? 1.15 : 1)
                if device.coverFaces { FaceBlur(faces: sensor.faces).allowsHitTesting(false) }
                DetectionOverlay(sensor: sensor, coverFaces: device.coverFaces, seatShort: seatShort, showBoxes: device.showBoxes)
            }
            .aspectRatio(sensor.aspect, contentMode: .fit).frame(maxWidth: .infinity, maxHeight: .infinity)
        case "denied":
            ContentUnavailableView {
                Label("Chưa cấp quyền camera", systemImage: "camera.fill")
            } description: {
                Text("Thiết bị cần camera để nhìn hàng ghế sau. Không có camera, xe sẽ hiện \"Chưa nhìn được ghế sau\" và chủ xe được báo.")
            } actions: {
                Button("Mở Cài đặt") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }.buttonStyle(NoirProminent())
            }
        case "unavailable":
            ContentUnavailableView("Không có camera", systemImage: "camera.metering.unknown", description: Text("Máy này không có camera nên không thể làm thiết bị trong xe."))
        default:
            ProgressView("Đang mở camera…").tint(.white)
        }
    }

    private var dimLayer: some View {
        Color.black.ignoresSafeArea().overlay {
            VStack(spacing: 8) {
                Image(systemName: statusIcon).font(.title).foregroundStyle(statusColor)
                Text(statusText).font(.callout).foregroundStyle(.white.opacity(0.7))
                Text("Chạm để bật màn hình").font(.caption).foregroundStyle(.white.opacity(0.4))
            }
        }
        .onTapGesture { device.setDim(false) }
    }

    private func reminderCard(_ text: String) -> some View {
        VStack(spacing: 12) {
            Label("Kiểm tra ghế sau", systemImage: "figure.child.and.lock.open.fill").font(.headline).foregroundStyle(Theme.orange)
            Text(text).font(.callout).multilineTextAlignment(.center)
            Button("Đã kiểm tra") { device.dismissReminder() }.buttonStyle(NoirProminent())
        }
        .padding(20).frame(maxWidth: 420).noirGlass(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .foregroundStyle(.white).padding()
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: portrait chrome

    private var top: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                statusChip
                if let n = notice { noticeChip(n) }
            }
            Spacer()
            Button { showInfo = true } label: { Image(systemName: "info.circle").font(.title3).frame(width: 44, height: 44).noirGlass(in: Circle(), interactive: true) }
                .accessibilityLabel("Thông tin thiết bị")
        }
        .foregroundStyle(.white).padding(.horizontal, 16).padding(.top, 4)
    }

    private var bottom: some View {
        NoirGlassGroup(spacing: 16) { HStack(spacing: 14) { controls(size: 52) } }
            .foregroundStyle(.white).padding(.bottom, 16)
    }

    // MARK: landscape rail

    private var rail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let n = notice { noticeChip(n) }
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        let seat = Cabin.seat(forX: (CGFloat(i) + 0.5) / 3, mirrored: sensor.mirrored)
                        let st = seatState(seat)
                        VStack(spacing: 4) {
                            Text(seatShort[seat] ?? "").font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6))
                            Text(st.0).font(.caption.weight(.bold)).foregroundStyle(st.1).multilineTextAlignment(.center).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, minHeight: 56).padding(.horizontal, 2)
                        .noirGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
                Text(sensor.cameraState == "running" ? "\(sensor.fps) fps" + (device.night ? " · ban đêm" : "") : " ")
                    .font(.caption2.monospacedDigit()).foregroundStyle(.white.opacity(0.5))
                NoirGlassGroup(spacing: 10) {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) { controls(size: 50) }
                }
                Button { showInfo = true } label: { Label("Thông tin", systemImage: "info.circle").font(.footnote).frame(maxWidth: .infinity, minHeight: 36).noirGlass(in: Capsule(), interactive: true) }
            }
            .foregroundStyle(.white).padding(12)
        }
        .frame(width: 236).background(Color(white: 0.04))
    }

    @ViewBuilder private func controls(size: CGFloat) -> some View {
        control("eye.slash", on: device.coverFaces, "Làm mờ mặt", size) { device.coverFaces.toggle() }
        control("arrow.left.and.right", on: sensor.mirrored, "Đảo trái phải", size) { sensor.mirrored.toggle() }
        control("moon.stars", on: device.night, "Chế độ ban đêm", size) { device.nightPref = device.night ? .off : .on }
        control("slider.horizontal.3", on: false, "Cài đặt", size) { showSettings = true }
        Button { device.setDim(true) } label: { Image(systemName: "moon.fill").font(.title3).frame(width: size, height: size).noirGlass(in: Circle(), interactive: true) }
            .accessibilityLabel("Tắt màn hình, vẫn giám sát")
    }

    private func control(_ icon: String, on: Bool, _ label: String, _ size: CGFloat, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.title3).foregroundStyle(on ? Noir.accent : .white).frame(width: size, height: size).noirGlass(in: Circle(), interactive: true) }
            .accessibilityLabel(label).accessibilityValue(on ? "Bật" : "Tắt").sensoryFeedback(.selection, trigger: on)
    }

    private func seatState(_ seat: String) -> (String, Color) {
        guard sensor.cameraState == "running" else { return ("—", .secondary) }
        let s = sensor.seen.values.filter { $0.seat == seat && $0.conf >= 0.5 }.sorted { $0.conf > $1.conf }
        if let p = s.first(where: { $0.kind != "item" }) { return ("\(p.name)\n\(Int(p.conf * 100))%", Theme.red) }
        if let i = s.first { return (i.name, Theme.blue) }
        return ("Chưa thấy", .secondary)
    }

    // MARK: status

    private var statusChip: some View {
        Label(statusText, systemImage: statusIcon).font(.footnote.weight(.semibold)).foregroundStyle(statusColor)
            .padding(.horizontal, 14).frame(height: 44).noirGlass(in: Capsule())
            .contentTransition(.symbolEffect(.replace)).animation(.smooth, value: statusText)
    }

    /// Extra line under the status: darkness the detector has to work with. Never worded as "safe".
    private var notice: String? {
        guard sensor.cameraState == "running", !sensor.covered else { return nil }
        if sensor.lightLevel < 0.12 { return "Thiếu sáng: nhận diện kém tin cậy" }
        return nil
    }
    private func noticeChip(_ t: String) -> some View {
        Label(t, systemImage: "moon.zzz").font(.caption.weight(.semibold)).foregroundStyle(Theme.orange)
            .padding(.horizontal, 12).frame(height: 32).noirGlass(in: Capsule())
    }

    private var linkOK: Bool { device.lastAck.map { Date().timeIntervalSince($0) < 10 } ?? false }
    private var statusText: String {
        if device.error != nil, !linkOK { return "Mất kết nối máy chủ" }
        if device.pausedUntil != nil { return "Chủ xe tạm dừng giám sát" }
        if device.driving { return "Xe đang chạy" }
        if sensor.cameraState != "running" { return "Chưa có camera" }
        if sensor.covered { return "Camera bị che hoặc quá tối" }
        return "Đang giám sát · \(device.vehicleName ?? "xe")"
    }
    private var statusIcon: String {
        if device.error != nil, !linkOK { return "wifi.slash" }
        if sensor.cameraState != "running" { return "camera.badge.ellipsis" }
        if sensor.covered { return "eye.slash" }
        return device.pausedUntil != nil || device.driving ? "pause.circle" : "checkmark.shield.fill"
    }
    private var statusColor: Color {
        if device.error != nil, !linkOK { return Theme.red }
        if sensor.cameraState != "running" || sensor.covered { return Theme.orange }
        return device.pausedUntil != nil || device.driving ? .secondary : Theme.green
    }

    private var info: some View {
        NavigationStack {
            List {
                Section("Xe") { LabeledContent("Đang giám sát", value: device.vehicleName ?? "—") }
                Section("Thiết bị") {
                    LabeledContent("Pin", value: device.batteryPct.map { "\($0)%" + (device.charging ? " · đang sạc" : "") } ?? "—")
                    LabeledContent("Nhiệt độ máy", value: ["nominal": "Bình thường", "fair": "Hơi ấm", "serious": "Nóng", "critical": "Quá nóng"][device.thermal] ?? device.thermal)
                    LabeledContent("Ngoài trời", value: device.outsideTemp.map { "\(Int($0.rounded()))°C" } ?? "Chưa có")
                    LabeledContent("Độ sáng cảnh", value: sensor.cameraState == "running" ? "\(Int(sensor.lightLevel * 100))%" : "—")
                    LabeledContent("Tốc độ phát hiện", value: sensor.cameraState == "running" ? "\(sensor.fps) fps" : "—")
                    LabeledContent("Gửi lần cuối", value: device.lastAck.map { clock($0.timeIntervalSince1970) } ?? "—")
                }
                Section {} footer: {
                    Text("Giữ ứng dụng ở phía trước và màn hình không khóa. Khi xe nóng, đặt thiết bị ở nơi thoáng; máy quá nóng sẽ báo cho chủ xe là chưa thể đánh giá.")
                }
                if let e = device.error { Section { Label(e, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
                Section {
                    Button("Ngắt ghép nối thiết bị này", role: .destructive) { showInfo = false; confirmUnpair = true }
                } footer: { Text("Dùng khi muốn ghép lại bằng mã mới hoặc đổi địa chỉ máy chủ.") }
            }
            .noirList().navigationTitle("Thiết bị trong xe").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { showInfo = false } } }
        }
        .presentationDetents([.medium, .large])
    }
}
