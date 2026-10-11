import SwiftUI

enum Route: Hashable {
    case alert(String)
    case confirm(String)
    case climate
    case camera
    case cabin
    case device
    case exitCheck
    case escalation
    case link
    case map
    case photo
    case selfCheck
}

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var path = NavigationPath()
    @State private var showPicker = false
    @State private var showCall = false
    @State private var toast: String?

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    if let err = model.lastError { ErrorBanner(message: err) { Task { await model.tick() } } }
                    if let s = model.status {
                        if s.restricted { restricted(s) } else { content(s) }
                    } else if model.vehicles.isEmpty {
                        noVehicle
                    } else {
                        ProgressView("Đang tải dữ liệu mới nhất từ xe…").padding(.top, 80)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .refreshable { await model.tick() }
            .screenBackground()
            .navigationTitle(model.selected?.vehicle.name ?? "Trang chủ")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { model.tab = 2 } label: { Image(systemName: "bell") }.accessibilityLabel("Lịch sử thông báo")
                }
            }
            .navigationDestination(for: Route.self) { destination($0) }
            .sheet(isPresented: $showPicker) { VehiclePicker(onLink: { showPicker = false; path.append(Route.link) }) }
            .sheet(isPresented: $showCall) { CallSheet() }
            .toast($toast)
        }
    }

    // MARK: header

    private var header: some View {
        Button { showPicker = true } label: {
            HStack(spacing: 6) {
                Text(model.selected.map { "\($0.vehicle.plate) · \($0.vehicle.model)" } ?? "Liên kết xe để bắt đầu")
                Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
            }
            .font(.system(size: 15)).foregroundStyle(Theme.ink2)
            .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Đổi xe, đang xem \(model.selected?.vehicle.name ?? "chưa có xe")")
        .padding(.top, -12)
    }

    private var noVehicle: some View {
        VStack(spacing: 14) {
            Image(systemName: "car.side").font(.system(size: 54)).foregroundStyle(Theme.muted)
            Text("Chưa có xe nào").font(.system(size: 22, weight: .bold))
            Text("Liên kết thiết bị CabinSentinel trong xe để bắt đầu giám sát.").multilineTextAlignment(.center).foregroundStyle(Theme.ink2)
            NavigationLink(value: Route.link) { Text("Liên kết xe") }.buttonStyle(PrimaryButtonStyle())
        }
        .padding(.top, 60)
    }

    private func restricted(_ s: VehicleStatus) -> some View {
        Card {
            Text("Quyền của bạn: Chỉ đưa đón").font(.system(size: 18, weight: .bold))
            Text("Bạn chỉ thấy chuyến đưa đón của bé trên xe \(s.vehicle.name). Trạng thái cabin và camera do chủ xe quản lý.")
                .font(.system(size: 15)).foregroundStyle(Theme.ink2)
            Button("Mở Đưa đón") { model.tab = 1 }.buttonStyle(PrimaryButtonStyle())
        }
        .padding(.top, 12)
    }

    // MARK: main content

    @ViewBuilder
    private func content(_ s: VehicleStatus) -> some View {
        let inc = s.incident
        if inc == nil, let p = s.protection {
            NavigationLink(value: Route.device) { ProtectionChip(p: p) }.buttonStyle(TileStyle()).transition(.opacity)
        }
        if inc == nil {
            CarPicture(vehicle: s.vehicle).frame(height: 160)
                .saturation(s.verdict?.current == false ? 0.3 : 1)
                .accessibilityLabel("\(s.vehicle.model) màu \(s.vehicle.color)")
                .transition(.opacity)
        }
        if let ec = s.exitCheck, ec.pending {
            NavigationLink(value: Route.exitCheck) { ExitBanner(check: ec) }
        }
        StatusCard(status: s)
        if let inc {
            incidentActions(inc, s)
        }
        quickActions(s)
        if let c = s.coords { Button { path.append(Route.map) } label: { CarMapCard(coords: c) }.buttonStyle(.plain) }
        if s.role != "school" {
            VStack(spacing: 8) {
                NavigationLink(value: Route.map) { RowLink(icon: "map", title: "Bản đồ và dẫn đường", subtitle: s.route != nil ? "Xe đang di chuyển" : "Vị trí xe, lộ trình, thời gian tới nơi") }
                NavigationLink(value: Route.photo) { RowLink(icon: "camera.viewfinder", title: "Gửi ảnh từ điện thoại", subtitle: "Chụp hoặc chọn ảnh, xem lại rồi mới gửi") }
            }
            .buttonStyle(.plain)
        }
        if !model.trips.isEmpty, model.settings?.purpose != "cabin" { SchoolSummary(trip: model.trips[0]) }
        if let items = s.items, !items.isEmpty, inc == nil { ItemsCard(items: items) }
        if model.demo, s.role == "owner" { if model.simPaused { SimPausedNotice() } else { DemoPanel(toast: $toast) } }
        Text("Kết luận do hệ thống CabinSentinel đưa ra. Ứng dụng chỉ điều khiển điều hòa, không mở khóa xe.")
            .font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.top, 4)
    }

    private func incidentActions(_ inc: Incident, _ s: VehicleStatus) -> some View {
        VStack(spacing: 10) {
            NavigationLink(value: Route.alert(inc.id)) {
                HStack { Text("Xem việc cần làm ngay"); Image(systemName: "chevron.right") }
            }
            .buttonStyle(PrimaryButtonStyle(color: inc.level == "critical" ? Theme.red : Theme.orange))
            HStack(spacing: 8) {
                Link(destination: URL(string: "tel:112")!) { Label("Gọi 112", systemImage: "phone.fill") }
                    .buttonStyle(SecondaryButtonStyle(color: Theme.redDark))
                if s.canAct {
                    NavigationLink(value: Route.climate) { Label("Làm mát", systemImage: "fan") }.buttonStyle(SecondaryButtonStyle())
                    NavigationLink(value: Route.camera) { Label("Camera", systemImage: "camera") }.buttonStyle(SecondaryButtonStyle())
                }
            }
        }
    }

    private func quickActions(_ s: VehicleStatus) -> some View {
        HStack(spacing: 8) {
            quick("camera", "Camera", s.canAct ? Route.camera : nil)
            quick("carseat.right", "Ghế", Route.cabin)
            quick("fan", "Điều hòa", s.canAct ? Route.climate : nil)
            Button { showCall = true } label: {
                tile("phone", "Khẩn cấp", fg: Theme.redDark, bg: Theme.redBg)
            }
        }
    }

    @ViewBuilder
    private func quick(_ icon: String, _ label: String, _ route: Route?) -> some View {
        if let route {
            NavigationLink(value: route) { tile(icon, label) }.buttonStyle(TileStyle())
        } else {
            Button { toast = "Quyền của bạn không cho phép mở \(label.lowercased())." } label: { tile(icon, label).opacity(0.45) }
        }
    }

    private func tile(_ icon: String, _ label: String, fg: Color = Theme.ink, bg: Color = Theme.card) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 22, weight: .regular))
            Text(label).font(.system(size: 14, weight: .bold))
        }
        .foregroundStyle(fg)
        .frame(maxWidth: .infinity, minHeight: 92)
        .background(bg, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder
    private func destination(_ r: Route) -> some View {
        switch r {
        case .alert(let id): AlertDetailView(incidentId: id, path: $path)
        case .confirm(let id): ConfirmCheckView(incidentId: id, path: $path)
        case .climate: ClimateView()
        case .camera: CameraView()
        case .cabin: CabinView()
        case .device: DeviceHealthView()
        case .exitCheck: ExitReminderView()
        case .escalation: EscalationView()
        case .link: LinkVehicleView(onDone: { path = NavigationPath() })
        case .map: VehicleMapView()
        case .photo: PhotoCaptureView()
        case .selfCheck: PhotoCaptureView()
        }
    }
}

// MARK: - Pieces

struct ProtectionChip: View {
    let p: Protection
    var body: some View {
        let c: Color = p.level == "ok" ? Theme.green : p.level == "partial" ? Theme.orange : Theme.ink2
        let bg: Color = p.level == "ok" ? Theme.greenBg : p.level == "partial" ? Theme.orangeBg : Theme.card
        HStack(spacing: 8) {
            Circle().fill(c).frame(width: 10, height: 10)
            Text(p.title).font(.system(size: 14, weight: .bold))
            Spacer()
            Text(p.level == "off" ? "Mất kết nối xe" : p.level == "partial" ? (p.rows.first { $0.status == "bad" || $0.status == "warn" }?.label ?? "") : "Pin \(p.battery)%")
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink2)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 14).frame(minHeight: 44)
        .background(bg, in: Capsule())
        .accessibilityLabel("\(p.title). Mở thiết bị và bảo vệ")
    }
}

struct StatusCard: View {
    let status: VehicleStatus
    @State private var now = Date()

    var body: some View {
        let inc = status.incident
        let v = status.verdict
        let level = inc?.level ?? v?.level
        let style = LevelStyle.of(level)
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: style.icon).font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 48, height: 48).background(style.color, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(style.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(style.color)
                        Spacer()
                        if let inc { Text("Đã \(mmss(inc.elapsed + Int(now.timeIntervalSince(loadedAt))))").font(.system(size: 15, weight: .semibold).monospacedDigit()).foregroundStyle(style.color).contentTransition(.numericText()) }
                    }
                    Text(title).font(.system(size: 22, weight: .bold)).foregroundStyle(Theme.ink).contentTransition(.opacity)
                    Text(subtitle).font(.system(size: 15)).foregroundStyle(Theme.ink2)
                }
            }
            if let tiles = status.tiles {
                HStack(spacing: 8) {
                    ForEach(tiles, id: \.self) { t in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.label).font(.system(size: 13)).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
                            Text(t.value).font(.system(size: 17, weight: .semibold)).foregroundStyle(toneColor(t.tone)).lineLimit(1).minimumScaleFactor(0.7).contentTransition(.numericText())
                        }
                        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
            }
        }
        .padding(18)
        .background(style.tint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { t in if status.incident != nil { withAnimation(.snappy(duration: 0.2)) { now = t } } }
        .onChange(of: status.incident?.elapsed) { loadedAt = Date(); now = Date() }
    }

    @State private var loadedAt = Date()

    private var title: String {
        if let inc = status.incident, status.verdict?.level != inc.level {
            return inc.level == "critical" ? "Sự cố Nghiêm trọng vẫn mở" : "Sự cố Cảnh báo vẫn mở"
        }
        return status.verdict?.title ?? "—"
    }

    private var subtitle: String {
        if let inc = status.incident, status.verdict?.level != inc.level {
            return "Hiện tại: \(status.verdict?.title.lowercased() ?? "chưa rõ"). Sự cố chỉ đóng khi có người xác nhận đã kiểm tra xe."
        }
        return status.verdict?.sub ?? ""
    }
}

struct ExitBanner: View {
    let check: ExitCheck
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.fill.questionmark").font(.system(size: 20)).foregroundStyle(.white)
                .frame(width: 44, height: 44).background(Theme.orange, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("Kiểm tra ghế sau trước khi khóa xe").font(.system(size: 16, weight: .bold))
                Text("Còn người ở \(check.seats.map(\.label).joined(separator: ", ").lowercased())").font(.system(size: 14)).foregroundStyle(Theme.ink2)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
        }
        .foregroundStyle(Theme.ink).padding(14)
        .background(Theme.orangeBg, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct SchoolSummary: View {
    let trip: Trip
    @Environment(AppModel.self) private var model
    var body: some View {
        Button { model.tab = 1 } label: {
            HStack(spacing: 12) {
                Image(systemName: "graduationcap").font(.system(size: 20)).foregroundStyle(stage.1)
                    .frame(width: 48, height: 48).background(stage.2, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Đưa đón · hôm nay").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.muted)
                    Text(stage.0).font(.system(size: 16, weight: .bold))
                    Text(trip.log.first.map { "\($0.time) · \($0.detail)" } ?? "Đón lúc \(trip.pickup)").font(.system(size: 14)).foregroundStyle(Theme.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
            }
            .foregroundStyle(Theme.ink).padding(14)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        }
    }

    private var stage: (String, Color, Color) { tripStageStyle(trip) }
}

func tripStageStyle(_ t: Trip) -> (String, Color, Color) {
    let n = t.child.name
    // Only say "trường" when a school or destination is really set; otherwise we do not know where the trip ended.
    let place = t.school ?? t.destination?.name
    switch t.stage {
    case "boarded": return ("\(n) đã lên xe", Theme.blue, Theme.blueBg)
    case "enroute": return (place.map { "Đang tới \($0)" } ?? "Đang trên đường", Theme.blue, Theme.blueBg)
    case "arrived": return (place.map { "\(n) đã xuống xe tại \($0)" } ?? "\(n) đã xuống xe", Theme.green, Theme.greenBg)
    case "late": return ("Chưa thấy \(n) lên xe", Theme.orange, Theme.orangeBg)
    case "leftin": return ("Có thể \(n) còn trong xe", Theme.red, Theme.redBg)
    default: return ("\(n) chưa lên xe", Theme.ink2, Theme.card)
    }
}

struct ItemsCard: View {
    let items: [CabinItem]
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "backpack").font(.system(size: 20)).foregroundStyle(.white).frame(width: 48, height: 48).background(Theme.blue, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("Còn \(items.count) đồ vật trên xe").font(.system(size: 16, weight: .bold))
                Text(items.map(\.name).joined(separator: ", ")).font(.system(size: 14)).foregroundStyle(Theme.ink2)
            }
            Spacer(minLength: 0)
        }
        .padding(14).background(Theme.blueBg, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct DemoPanel: View {
    @Binding var toast: String?
    @Environment(AppModel.self) private var model
    @State private var busy = false

    private let scenarios: [(String, String)] = [
        ("safe", "Bình thường"), ("warning", "Cảnh báo"), ("critical", "Nghiêm trọng"), ("presence_clear", "Đã đưa người ra"),
        ("camera_blocked", "Camera bị che"), ("offline", "Mất kết nối"), ("low_battery", "Pin yếu"), ("items_left", "Quên đồ"),
        ("exit_child", "Tắt máy, bé còn trên xe"), ("driving", "Đang lái"), ("climate_fail_on", "Điều hòa lỗi"), ("climate_fail_off", "Điều hòa hết lỗi"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { DemoBadge(text: "Chế độ dùng thử"); Spacer(); if busy { ProgressView() } }
            Text("Tạo dữ liệu xe giả để thử luồng. Tắt trong Tài khoản.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(scenarios, id: \.0) { s in
                    Button(s.1) {
                        Task {
                            busy = true
                            if let e = await model.runScenario(s.0) { toast = e } else { toast = "Mô phỏng: \(s.1)" }
                            busy = false
                        }
                    }
                    .font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.primary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .disabled(busy)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct VehiclePicker: View {
    var onLink: () -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.vehicles) { v in
                    Button {
                        Task { await model.select(v.id); dismiss() }
                    } label: {
                        HStack(spacing: 12) {
                            CarPicture(vehicle: v.vehicle).frame(width: 72, height: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.vehicle.name).font(.system(size: 16, weight: .bold))
                                Text("\(v.vehicle.plate) · \(roleLabels[v.role] ?? v.role)").font(.system(size: 13)).foregroundStyle(Theme.muted)
                                if let t = v.title {
                                    Text(t).font(.system(size: 13, weight: .semibold)).foregroundStyle(LevelStyle.of(v.level).color)
                                }
                            }
                            Spacer()
                            if v.id == model.selected?.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.ink) }
                        }
                        .foregroundStyle(Theme.ink)
                    }
                }
                Button { onLink() } label: { Label("Liên kết xe mới", systemImage: "plus.circle") }.foregroundStyle(Theme.ink)
            }
            .navigationTitle("Chọn xe").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Đóng") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

struct CallSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    @State private var contacts: [Contact] = []

    var body: some View {
        NavigationStack {
            List {
                Section("Khẩn cấp") {
                    callRow("Gọi 112", "Cứu nạn", "112", red: true)
                    callRow("Gọi 115", "Cấp cứu y tế", "115", red: true)
                }
                Section("Người liên hệ khẩn cấp") {
                    if contacts.isEmpty { Text("Chưa có. Thêm trong Tài khoản.").foregroundStyle(Theme.muted) }
                    ForEach(contacts) { c in callRow("\(c.name) (\(c.rel))", c.phone, c.phone, red: false) }
                }
            }
            .navigationTitle("Gọi ai?").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Đóng") { dismiss() } } }
            .task { contacts = (try? await model.api.contacts()) ?? [] }
        }
        .presentationDetents([.medium, .large])
    }

    private func callRow(_ title: String, _ sub: String, _ number: String, red: Bool) -> some View {
        Link(destination: URL(string: "tel:\(number)")!) {
            HStack(spacing: 12) {
                Image(systemName: "phone.fill").foregroundStyle(red ? Theme.red : Theme.ink)
                VStack(alignment: .leading) {
                    Text(title).font(.system(size: 16, weight: .bold)).foregroundStyle(red ? Theme.redDark : Theme.ink)
                    Text(sub).font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
            }
        }
    }
}

struct TileStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.modifier(PressScale(pressed: configuration.isPressed))
            .sensoryFeedback(.selection, trigger: configuration.isPressed) { _, new in new }
    }
}
