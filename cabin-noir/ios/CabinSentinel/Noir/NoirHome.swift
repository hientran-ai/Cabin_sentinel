import SwiftUI

/// Home of Cabin Noir. Same data and destinations as HomeView; the hierarchy follows the safety brief:
/// occupant / risk status first, then the vehicle, then sensors. The verdict comes only from the backend
/// and nothing here unlocks the car.
struct NoirHome: View {
    @Environment(AppModel.self) private var model
    @Namespace private var zoom
    @State private var path = NavigationPath()
    @State private var showPicker = false
    @State private var showCall = false
    @State private var showGlance = false
    @AppStorage(NoirHome.toolbarKey) private var classicToolbar = NoirHome.defaultClassic

    /// "Cabin Noir" shows the new bar (people / items badges); the side-by-side copy "Noir v1" starts with the first bar.
    static let toolbarKey = "toolbarClassic"
    static let defaultClassic = Bundle.main.bundleIdentifier?.contains(".v1") == true
    @State private var toast: String?
    @AppStorage("pushSetupSeen") private var pushSeen = false
    @State private var showPush = false

    private var level: String? { model.status?.incident?.level ?? model.status?.verdict?.level }
    private var glow: Color { model.status?.restricted == true ? Noir.accent : LevelStyle.of(level).color }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 24) {
                    if let s = model.status {
                        if s.restricted { restricted(s) } else { content(s) }
                    } else {
                        emptyState
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .refreshable { await model.tick() }
            .background(alignment: .top) {
                if let st = model.status, !st.restricted { CoverBackdrop().frame(height: 460).ignoresSafeArea() }
            }
            .noirCanvas(glow: glow)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar { toolbar }
            .navigationDestination(for: Route.self) { destination($0).toolbar(.hidden, for: .tabBar) }
            .sheet(isPresented: $showPicker) { VehiclePicker(onLink: { showPicker = false; path.append(Route.link) }) }
            .sheet(isPresented: $showCall) { CallSheet() }
            .sheet(isPresented: $showGlance) { NoirCabinGlance().presentationDetents([.medium, .large]) }
            .sheet(isPresented: $showPush, onDismiss: { pushSeen = true }) {
                NavigationStack { NoirPushSetup().toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { showPush = false } } } }
            }
            .task(id: model.status?.vehicle.id) {
                #if PRODUCTION
                if !pushSeen, model.status != nil { showPush = true }
                #endif
            }
            .toast($toast)
        }
    }

    #if PRODUCTION
    private static let disclaimer = "Kết luận do hệ thống CabinSentinel đưa ra từ thiết bị trong xe. Ứng dụng chỉ giám sát và báo cảnh, không điều khiển xe và không mở khóa xe."
    #else
    private static let disclaimer = "Kết luận do hệ thống CabinSentinel đưa ra. Ứng dụng chỉ điều khiển điều hòa, không mở khóa xe."
    #endif

    // MARK: toolbar (native)

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarLeading) { logoButton }.sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarLeading) { logoButton }
        }
        if classicToolbar {
            // First version of the bar: notification bell and a "more" menu.
            ToolbarItemGroup(placement: .topBarTrailing) {
                NoirBellButton { routeNotification($0) }
                Menu {
                    Button("Thiết bị và bảo vệ", systemImage: "cpu") { path.append(Route.device) }
                    Button("Đổi xe", systemImage: "arrow.left.arrow.right") { showPicker = true }
                    Button("Liên kết xe mới", systemImage: "plus") { path.append(Route.link) }
                } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("Thêm")
            }
        } else if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarTrailing) { glanceBubble }.sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarTrailing) { glanceBubble }
        }
    }

    /// The VinFast emblem on its own, no container. It opens the vehicle menu.
    @ViewBuilder private var logoButton: some View {
        if classicToolbar {
            Button { showPicker = true } label: {
                Image("vinfast-mark").resizable().scaledToFit().frame(height: 22).foregroundStyle(.white)
            }
            .accessibilityLabel("Đổi xe, đang xem \(model.selected?.vehicle.name ?? "chưa có xe")")
        } else { logoMenu }
    }

    private var logoMenu: some View {
        Menu {
            Button("Đổi xe", systemImage: "arrow.left.arrow.right") { showPicker = true }
            Button("Thiết bị và bảo vệ", systemImage: "cpu") { path.append(Route.device) }
            Button("Liên kết xe mới", systemImage: "plus") { path.append(Route.link) }
            Button("Lịch sử thông báo", systemImage: "bell") { model.tab = 2 }
        } label: {
            Image("vinfast-mark").resizable().scaledToFit().frame(height: 22).foregroundStyle(.white)
        }
        .accessibilityLabel("Menu xe, đang xem \(model.selected?.vehicle.name ?? "chưa có xe")")
    }

    /// Where a tapped notification leads.
    private func routeNotification(_ n: NotificationItem) {
        switch n.kind {
        case "alert": if let id = n.incidentId { path.append(Route.alert(id)) }
        case "resolved": UserDefaults.standard.set("alerts", forKey: "histSeg"); model.tab = 2
        case "camera", "offline": UserDefaults.standard.set("activity", forKey: "histSeg"); model.tab = 2
        case "device": path.append(Route.device)
        case "update": if let u = n.url, let url = URL(string: u) { UIApplication.shared.open(url) }
        default: break
        }
    }

    // MARK: the glass bubble (same two functions as the first bar)

    /// Notification bell and the "more" menu, in one glass bubble. The quick look at the cabin is an item of the menu.
    private var glanceBubble: some View {
        HStack(spacing: 0) {
            NoirBellButton { routeNotification($0) }
            Menu {
                Button("Xem nhanh trong cabin", systemImage: "figure.child") { showGlance = true }
                Button("Thiết bị và bảo vệ", systemImage: "cpu") { path.append(Route.device) }
                Button("Đổi xe", systemImage: "arrow.left.arrow.right") { showPicker = true }
                Button("Liên kết xe mới", systemImage: "plus") { path.append(Route.link) }
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).foregroundStyle(Noir.accent).frame(width: 37, height: 40)
            }
            .accessibilityLabel("Thêm")
        }
        .frame(height: 40)
        .noirGlass(in: Capsule(), interactive: true)
    }

    // MARK: empty / loading / error

    @ViewBuilder private var emptyState: some View {
        if let err = model.lastError {
            ContentUnavailableView {
                Label("Không kết nối được", systemImage: "wifi.exclamationmark")
            } description: {
                Text(err)
            } actions: {
                Button("Thử lại") { Task { await model.tick() } }.buttonStyle(NoirProminent())
            }
            .padding(.top, 80)
        } else if model.vehicles.isEmpty {
            ContentUnavailableView {
                Label("Chưa có xe", systemImage: "car")
            } description: {
                Text("Liên kết thiết bị CabinSentinel trong xe để bắt đầu giám sát.")
            } actions: {
                Button("Liên kết xe") { path.append(Route.link) }.buttonStyle(NoirProminent())
            }
            .padding(.top, 80)
        } else {
            ProgressView("Đang tải dữ liệu mới nhất từ xe…").padding(.top, 160)
        }
    }

    private func restricted(_ s: VehicleStatus) -> some View {
        ContentUnavailableView {
            Label("Chỉ xem đưa đón", systemImage: "figure.and.child.holdinghands")
        } description: {
            Text("Bạn chỉ thấy chuyến đưa đón của bé trên xe \(s.vehicle.name). Trạng thái cabin và camera do chủ xe quản lý.")
        } actions: {
            Button("Mở Đưa đón") { model.tab = 1 }.buttonStyle(NoirProminent())
        }
        .padding(.top, 80)
    }

    // MARK: content

    @ViewBuilder
    private func content(_ s: VehicleStatus) -> some View {
        let stale = s.verdict?.current == false
        VStack(spacing: 20) {
            if let err = model.lastError {
                Label(err, systemImage: "wifi.exclamationmark").font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 20)
            }
            carStage(s, stale: stale)
            statusHeader(s, stale: stale)
            primaryActions(s)
        }
        VStack(spacing: 16) {
            if let ec = s.exitCheck, ec.pending {
                NavigationLink(value: Route.exitCheck) { ExitBanner(check: ec) }.buttonStyle(NoirPress())
            }
            facts(s, stale: stale)
            if let c = s.coords { Button { path.append(Route.map) } label: { CarMapCard(coords: c) }.buttonStyle(.plain) }
            if !model.trips.isEmpty, model.settings?.purpose != "cabin" { SchoolSummary(trip: model.trips[0]) }
            if let items = s.items, !items.isEmpty, s.incident == nil { ItemsCard(items: items) }
            if model.demo, s.role == "owner" { if model.simPaused { SimPausedNotice() } else { DemoPanel(toast: $toast) } }
            Text(Self.disclaimer)
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(.horizontal, 16)
    }

    // MARK: car

    private func carStage(_ s: VehicleStatus, stale: Bool) -> some View {
        CarPicture(vehicle: s.vehicle)
            .frame(maxWidth: .infinity).frame(height: 210).padding(.horizontal, 12)
            .saturation(stale ? 0.2 : 1).opacity(stale ? 0.65 : 1)
            .shadow(color: .black.opacity(0.4), radius: 14, y: 10)
            .animation(.smooth, value: stale)
            .accessibilityLabel("\(s.vehicle.model) màu \(s.vehicle.color)")
    }

    // MARK: status (the first thing to read)

    @ScaledMetric(relativeTo: .largeTitle) private var heroSymbol: CGFloat = 52

    private func statusHeader(_ s: VehicleStatus, stale: Bool) -> some View {
        let style = LevelStyle.of(level)
        let online = s.connection == "online"
        return VStack(spacing: 10) {
            Image(systemName: style.icon).font(.system(size: heroSymbol))
                .symbolRenderingMode(.hierarchical).foregroundStyle(style.color)
                .contentTransition(.symbolEffect(.replace))
                .symbolEffect(.bounce, value: level)
                .symbolEffect(.pulse, isActive: level == "critical")
            Text(style.label.uppercased()).font(.caption.bold()).tracking(1.2).foregroundStyle(style.color)
                .contentTransition(.opacity)
            Text(title(s)).font(.title.bold()).multilineTextAlignment(.center).contentTransition(.opacity)
            Text(subtitle(s)).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if let inc = s.incident { NoirElapsed(incident: inc, color: style.color) }
            Label(lockText(s, online: online), systemImage: !online ? "wifi.slash" : (s.lockKnown == false ? "parkingsign.circle" : (s.doorsLocked == true ? "lock.fill" : "lock.open.fill")))
                .font(.footnote).foregroundStyle(.secondary).padding(.top, 2)
        }
        .padding(.horizontal, 24)
        .animation(.smooth(duration: 0.45), value: level)
        .sensoryFeedback(trigger: level) { _, new in
            switch new { case "critical": .error; case "warning": .warning; case "safe": .success; default: nil }
        }
        .accessibilityElement(children: .combine)
    }

    private func lockText(_ s: VehicleStatus, online: Bool) -> String {
        if !online { return "Mất kết nối xe · \(updated(s.lastSeen))" }
        // A device without a door sensor never says "locked": it only knows the car is parked.
        let lock = s.lockKnown == false ? "Xe đang đỗ" : (s.doorsLocked == true ? "Đã khóa" : "Chưa khóa")
        return lock + " · " + updated(s.lastSeen)
    }

    private func updated(_ t: Double?) -> String {
        guard let t else { return "chưa nhận dữ liệu" }
        if abs(Date().timeIntervalSince1970 - t) < 45 { return "cập nhật vừa xong" }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "vi_VN"); f.unitsStyle = .full
        return "cập nhật " + f.localizedString(for: Date(timeIntervalSince1970: t), relativeTo: Date())
    }

    private func title(_ s: VehicleStatus) -> String {
        if let inc = s.incident, s.verdict?.level != inc.level {
            return inc.level == "critical" ? "Sự cố nghiêm trọng vẫn mở" : "Sự cố cảnh báo vẫn mở"
        }
        return s.verdict?.title ?? "—"
    }

    private func subtitle(_ s: VehicleStatus) -> String {
        if let inc = s.incident, s.verdict?.level != inc.level {
            return "Hiện tại: \(s.verdict?.title.lowercased() ?? "chưa rõ"). Sự cố chỉ đóng khi có người xác nhận đã kiểm tra xe."
        }
        return s.verdict?.sub ?? ""
    }

    // MARK: actions (one primary, the rest grouped)

    private func primaryActions(_ s: VehicleStatus) -> some View {
        VStack(spacing: 14) {
            if let inc = s.incident {
                HStack(spacing: 10) {
                    NavigationLink(value: Route.alert(inc.id)) {
                        Label("Xử lý ngay", systemImage: "exclamationmark.bubble.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NoirProminent(tint: inc.level == "critical" ? Theme.red : Theme.orange)).controlSize(.large)
                    Menu {
                        Link(destination: URL(string: "tel:112")!) { Label("Gọi 112", systemImage: "phone.fill") }
                        Button("Người liên hệ khẩn cấp", systemImage: "person.crop.circle.badge.exclamationmark") { showCall = true }
                    } label: { Label("Liên hệ", systemImage: "phone") }
                    .buttonStyle(.bordered).controlSize(.large)
                }
                .padding(.horizontal, 16)
            }
            controlGroup(s)
        }
    }

    /// Floating functional controls: the only glass on this screen besides the system bars.
    private func controlGroup(_ s: VehicleStatus) -> some View {
        NoirGlassGroup(spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                #if PRODUCTION
                controlLink("carseat.right", "Ghế", .cabin, enabled: true)
                controlLink("map.fill", "Bản đồ", .map, enabled: true)
                controlLink("cpu", "Thiết bị", .device, enabled: true)
                #else
                controlLink("camera.fill", "Camera", .camera, enabled: s.canAct)
                controlLink("fan", "Điều hòa", .climate, enabled: s.canAct)
                controlLink("map.fill", "Bản đồ", .map, enabled: true)
                #endif
                Menu {
                    #if PRODUCTION
                    if s.pausedUntil != nil {
                        Button("Bật lại giám sát", systemImage: "play.fill") { run { try await model.api.resume(s.vehicle.id) } }
                    } else if s.canAct, s.incident == nil {
                        Menu("Tạm dừng giám sát", systemImage: "pause.fill") {
                            ForEach([15, 30, 60], id: \.self) { m in Button("\(m) phút") { run { try await model.api.pause(s.vehicle.id, minutes: m) } } }
                        }
                    }
                    #else
                    Button("Ghế và đồ vật", systemImage: "carseat.right") { path.append(Route.cabin) }
                    #endif
                    Button("Tự kiểm tra cabin bằng camera", systemImage: "camera.viewfinder") { path.append(Route.selfCheck) }
                    Button("Gọi khẩn cấp", systemImage: "phone.fill") { showCall = true }
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: "ellipsis").font(.title3).frame(width: 56, height: 56).noirGlass(in: Circle(), interactive: true)
                        Text("Thêm").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .foregroundStyle(.white).accessibilityLabel("Thêm hành động")
            }
        }
    }

    private func run(_ op: @escaping () async throws -> VehicleStatus) {
        Task { toast = await model.perform(op) }
    }

    private func controlLink(_ icon: String, _ label: String, _ route: Route, enabled: Bool) -> some View {
        Button {
            if enabled { path.append(route) } else { toast = "Quyền của bạn không cho phép mở \(label.lowercased())." }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title3).symbolRenderingMode(.hierarchical).frame(width: 56, height: 56)
                    .noirGlass(in: Circle(), interactive: true)
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
            .opacity(enabled ? 1 : 0.45)
        }
        .buttonStyle(NoirPress()).foregroundStyle(.white)
        .noirZoomSource(label, in: zoom)
        .sensoryFeedback(.impact(weight: .light), trigger: path.count)
    }

    // MARK: facts (one grouped list, not a grid of cards)

    private func facts(_ s: VehicleStatus, stale: Bool) -> some View {
        let rear = (s.seats ?? []).filter { $0.key.hasPrefix("rear_") }
        let seen = rear.filter(\.occ)
        let seatText = stale ? "Chưa rõ" : (seen.isEmpty ? "Không thấy ai" : seen.map { "\($0.label.replacingOccurrences(of: "Ghế sau ", with: "").capitalized) \(Int(($0.conf * 100).rounded()))%" }.joined(separator: ", "))
        let temp = s.cabinTemp
        return VStack(spacing: 0) {
            if temp != nil {
                fact("thermometer.medium", "Nhiệt độ cabin", stale ? "—" : "\(Int(temp!.rounded()))°C", tone: (temp ?? 0) >= 35 && !stale ? Theme.red : nil)
            } else {
                fact("thermometer.sun", "Ngoài trời", stale || s.outsideTemp == nil ? "Chưa có" : "\(Int(s.outsideTemp!.rounded()))°C", tone: (s.outsideTemp ?? 0) >= 28 && !stale ? Theme.orange : nil)
            }
            Divider().padding(.leading, 52)
            fact("carseat.right", "Ghế sau", seatText, tone: !stale && !seen.isEmpty ? Theme.orange : nil)
            #if !PRODUCTION
            Divider().padding(.leading, 52)
            fact("fan", "Điều hòa", s.climate?.status == "on" ? "Đang chạy" : "Tắt")
            #endif
            DisclosureGroup {
                VStack(spacing: 0) {
                    fact("video", "Camera", stale ? "Chưa rõ" : (s.camera == "ok" ? "Hoạt động" : "Bị che"), tone: s.camera == "ok" || stale ? nil : Theme.orange)
                    Divider().padding(.leading, 52)
                    fact("cpu", "Thiết bị", s.device.map { "\($0.label) · pin \($0.battery.map(String.init) ?? "—")%" } ?? s.protection.map { "\($0.title) · pin \($0.battery)%" } ?? "—")
                    Divider().padding(.leading, 52)
                    fact("thermometer.sun", "Ngoài trời", s.outsideTemp.map { "\(Int($0.rounded()))°C" } ?? "—")
                    if let d = s.detector { Divider().padding(.leading, 52); fact("viewfinder", "Nguồn nhận diện", d) }
                }
            } label: {
                Text("Chi tiết cảm biến").font(.subheadline).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
        }
        .noirGroup()
    }

    private func fact(_ icon: String, _ label: String, _ value: String, tone: Color? = nil) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).symbolRenderingMode(.hierarchical).foregroundStyle(tone ?? .secondary).frame(width: 28)
            Text(label).font(.body)
            Spacer(minLength: 8)
            Text(value).font(.body).foregroundStyle(tone ?? .secondary).multilineTextAlignment(.trailing).contentTransition(.numericText())
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    // MARK: destinations

    @ViewBuilder
    private func destination(_ r: Route) -> some View {
        switch r {
        case .alert(let id): NoirAlertDetail(incidentId: id, path: $path)
        case .confirm(let id): NoirConfirmCheck(incidentId: id, path: $path)
        case .climate: NoirClimate().noirZoomDestination("Điều hòa", in: zoom)
        case .camera: NoirCamera().noirZoomDestination("Camera", in: zoom)
        case .cabin: NoirCabin()
        case .device: NoirDevice()
        case .exitCheck: NoirExit()
        case .escalation: NoirEscalation()
        #if PRODUCTION
        case .link: NoirAddVehicleView(onDone: { path = NavigationPath() })
        #else
        case .link: LinkVehicleView(onDone: { path = NavigationPath() })
        #endif
        case .map: VehicleMapView().noirZoomDestination("Bản đồ", in: zoom)
        case .photo: PhotoCaptureView()
        case .selfCheck: NoirSelfCheck { path.append(Route.photo) }
        }
    }
}

/// Live "Đã mm:ss" counter for an open incident.
private struct NoirElapsed: View {
    let incident: Incident
    let color: Color
    @State private var loadedAt = Date()
    @State private var now = Date()

    var body: some View {
        Text("Đã \(mmss(incident.elapsed + Int(now.timeIntervalSince(loadedAt))))")
            .font(.callout.monospacedDigit().bold()).foregroundStyle(color).contentTransition(.numericText())
            .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { t in withAnimation(.smooth(duration: 0.2)) { now = t } }
            .onChange(of: incident.elapsed) { loadedAt = Date(); now = Date() }
    }
}

/// One soft lift behind the car, nothing else.
struct CoverBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x1B222D), Noir.canvas], startPoint: .top, endPoint: .bottom)
            Ellipse().fill(Color(hex: 0x8FA3BD).opacity(0.22)).frame(width: 360, height: 220).blur(radius: 70).offset(y: 150)
        }
        .mask(LinearGradient(colors: [.white, .white, .clear], startPoint: .top, endPoint: .bottom))
    }
}

extension View {
    @ViewBuilder func noirZoomSource(_ id: String, in ns: Namespace.ID) -> some View {
        if #available(iOS 18.0, *) { self.matchedTransitionSource(id: id, in: ns) } else { self }
    }
    @ViewBuilder func noirZoomDestination(_ id: String, in ns: Namespace.ID) -> some View {
        if #available(iOS 18.0, *) { self.navigationTransition(.zoom(sourceID: id, in: ns)) } else { self }
    }
}
