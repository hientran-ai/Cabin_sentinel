import SwiftUI

/// Chi tiết cảnh báo: status first, three steps as native list sections, one primary action at the bottom.
/// Same rules as AlertDetailView: "Đã xem" never resolves, only a confirmed cabin check does.
struct NoirAlertDetail: View {
    let incidentId: String
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model
    @State private var fetched: Incident?
    private var inc: Incident? { fetched ?? model.status?.incident.flatMap { $0.id == incidentId ? $0 : nil } }
    @State private var done: Set<Int> = []
    @State private var showCall = false
    @State private var error: String?
    @State private var loadedAt = Date()
    @State private var now = Date()

    private var canAct: Bool { model.status?.canAct ?? false }

    var body: some View {
        List {
            if let inc {
                let st = LevelStyle.of(inc.level)
                Section {
                    NoirStatusBlock(symbol: inc.status == "resolved" ? "checkmark.shield.fill" : st.icon,
                                    color: inc.status == "resolved" ? Theme.green : st.color,
                                    kicker: "\(st.label) · \(mmss(inc.elapsed + Int(now.timeIntervalSince(loadedAt))))",
                                    title: inc.status == "resolved" ? "Sự cố đã đóng" : "Làm theo 3 bước", detail: inc.reason)
                        .padding(.vertical, 6)
                    ProgressView(value: Double(done.count), total: 3) { Text("Đã xong \(done.count)/3 bước").font(.footnote).foregroundStyle(.secondary) }
                        .tint(Noir.accent)
                }
                if canAct, inc.status == "open" {
                    Section { NoirLiveCard(vehicleId: inc.vehicleId) }
                }
                if let esc = inc.escalation {
                    Section {
                        NavigationLink(value: Route.escalation) {
                            let step = esc.steps[esc.current]
                            let last = esc.current == esc.steps.count - 1 && step.state == "done"
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(esc.stopped ? "Đã dừng leo thang vì có người xem" : (last ? "Chưa ai xử lý sau 3 phút. Hãy gọi 112" : "Đã: \(step.title.lowercased())")).font(.body)
                                    if last { Text("Ứng dụng không tự gọi 112 và không mở khóa xe.").font(.footnote).foregroundStyle(.secondary) }
                                    else if let n = esc.nextIn, !esc.stopped, let next = esc.steps.first(where: { $0.state == "pending" }) {
                                        Text("Tiếp theo sau \(mmss(n)): \(next.title.lowercased())").font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            } icon: { Image(systemName: "bell.badge.waveform").foregroundStyle(last ? Theme.red : Noir.accent) }
                        }
                    }
                }
                if inc.viewedAt != nil, inc.status == "open" {
                    Section {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(inc.viewedBy ?? "Bạn") đã xem lúc \(clock(inc.viewedAt))").font(.body)
                                Text("Sự cố vẫn mở cho tới khi có người xác nhận đã kiểm tra xe.").font(.footnote).foregroundStyle(.secondary)
                            }
                        } icon: { Image(systemName: "eye") }
                    }
                }
                #if PRODUCTION
                stepSection(0, "Đến xe ngay, hoặc nhờ người gần nhất", "Gọi người thân ở gần xe nếu bạn ở xa. Ứng dụng không điều khiển xe và không mở khóa xe.") {
                    Button { showCall = true } label: { Label("Gọi người thân", systemImage: "phone") }
                }
                stepSection(1, "Nhìn kỹ ghế sau và sàn xe", "Trẻ nhỏ, thú cưng có thể nằm thấp hoặc bị che. Nhận diện chỉ hỗ trợ, có thể bỏ sót.") {
                    NavigationLink(value: Route.cabin) { Label("Sơ đồ ghế", systemImage: "carseat.right") }
                }
                #else
                stepSection(0, "Đến xe ngay, hoặc nhờ người gần nhất", "Gọi người thân ở gần xe nếu bạn ở xa. Trong lúc chờ, có thể bật làm mát từ xa.") {
                    Button { showCall = true } label: { Label("Gọi người thân", systemImage: "phone") }
                    if canAct { NavigationLink(value: Route.climate) { Label("Bật làm mát", systemImage: "fan") } }
                }
                stepSection(1, "Nhìn kỹ ghế sau và sàn xe", "Trẻ nhỏ, thú cưng có thể nằm thấp hoặc bị che. Camera chỉ hỗ trợ quan sát.") {
                    if canAct { NavigationLink(value: Route.camera) { Label("Xem camera", systemImage: "camera") } }
                    NavigationLink(value: Route.cabin) { Label("Sơ đồ ghế", systemImage: "carseat.right") }
                }
                #endif
                stepSection(2, "Thấy người hoặc thú cưng: gọi ngay", "Không chờ hệ thống. Hết thời gian không có nghĩa là đã an toàn.") {
                    Link(destination: URL(string: "tel:112")!) { Label("Gọi 112", systemImage: "phone.fill") }.foregroundStyle(Theme.red)
                    Link(destination: URL(string: "tel:115")!) { Label("Gọi 115", systemImage: "cross.case.fill") }.foregroundStyle(Theme.red)
                }
                Section {
                    DisclosureGroup("Vì sao có cảnh báo này?") {
                        VStack(alignment: .leading, spacing: 8) {
                            if let seat = inc.seatLabel, let c = inc.confidence {
                                Text("Chưa xác minh: người \(Int(c * 100))% ở \(seat.lowercased()), theo camera. Không biết tuổi; có thể bỏ sót người bị che.")
                            }
                            if let t = inc.cabinTemp { Text("Cabin \(Int(t))°C lúc phát hiện.") }
                            ForEach(inc.events ?? [], id: \.self) { e in
                                HStack(alignment: .top, spacing: 10) {
                                    Text(clock(e.at)).font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(e.title).font(.subheadline.bold())
                                        Text(e.detail).font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .font(.subheadline).padding(.top, 6)
                    }
                }
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
            } else if let error {
                ContentUnavailableView {
                    Label("Không tải được cảnh báo", systemImage: "wifi.exclamationmark")
                } description: { Text(error) } actions: {
                    Button("Thử lại") { Task { await load() } }.buttonStyle(NoirProminent())
                }
                .listRowBackground(Color.clear)
            } else {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .noirList()
        .safeAreaInset(edge: .bottom) { bottomBar }
        .navigationTitle("Cảnh báo").navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .sheet(isPresented: $showCall) { CallSheet() }
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(3))
            }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .sensoryFeedback(.selection, trigger: done)
    }

    @ViewBuilder private var bottomBar: some View {
        if let inc, inc.status == "open" {
            VStack(spacing: 10) {
                if canAct {
                    NavigationLink(value: Route.confirm(inc.id)) { Text("Tôi đã kiểm tra xe").frame(maxWidth: .infinity) }
                        .buttonStyle(NoirProminent()).controlSize(.large)
                }
                HStack(spacing: 10) {
                    Button { showCall = true } label: { Label("Gọi khẩn cấp", systemImage: "phone.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered).controlSize(.large).tint(inc.level == "critical" ? Theme.red : Theme.orange)
                    Button(inc.viewedAt == nil ? "Đã xem, kiểm tra sau" : "Về trang chủ") {
                        Task {
                            if inc.viewedAt == nil { _ = try? await model.api.view(inc.id) }
                            path = NavigationPath()
                        }
                    }
                    .buttonStyle(.bordered).controlSize(.large)
                }
                Text("Sự cố vẫn mở cho tới khi có người xác nhận đã kiểm tra xe.").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.bar)
        }
    }

    private func stepSection<A: View>(_ i: Int, _ title: String, _ body: String, @ViewBuilder actions: () -> A) -> some View {
        let on = done.contains(i)
        return Section {
            actions()
            Button {
                withAnimation(.smooth(duration: 0.25)) { if on { done.remove(i) } else { done.insert(i) } }
            } label: {
                Label(on ? "Đã xong" : "Đánh dấu đã xong", systemImage: on ? "checkmark.circle.fill" : "circle")
                    .contentTransition(.symbolEffect(.replace)).foregroundStyle(on ? Theme.green : .secondary)
            }
            .accessibilityAddTraits(on ? .isSelected : [])
        } header: {
            Text("\(i + 1) · \(title)").font(.headline).textCase(nil).foregroundStyle(.primary)
        } footer: { Text(body) }
    }

    private func load() async {
        do { let i = try await model.api.incident(incidentId); fetched = i; loadedAt = Date(); error = nil }
        catch { self.error = (error as? APIError)?.message }
    }
}

/// Xác nhận đã kiểm tra xe. The server re-checks fresh data before closing; this screen only collects the confirmation.
struct NoirConfirmCheck: View {
    let incidentId: String
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model
    @State private var checks: Set<String> = []
    @State private var fetched: Incident?
    private var inc: Incident? { fetched ?? model.status?.incident.flatMap { $0.id == incidentId ? $0 : nil } }
    @State private var result: Incident?
    @State private var busy = false
    @State private var error: String?
    @State private var askOverride = false
    @State private var overridden = false

    private let items: [(String, String)] = [
        ("seats", "Tôi đã nhìn tất cả ghế, kể cả ghế trẻ em"),
        ("floor", "Tôi đã nhìn sàn xe, dưới và giữa các ghế"),
        ("trunk", "Tôi đã kiểm tra cốp xe"),
    ]

    var body: some View {
        List {
            if let r = result, r.result == "resolved" {
                Section {
                    NoirStatusBlock(symbol: "checkmark.shield.fill", color: Theme.green, kicker: "Hoàn tất", title: "Đã đóng sự cố",
                                    detail: overridden
                                        ? "\(r.resolvedBy ?? "Bạn") đóng sự cố lúc \(clock(r.resolvedAt)) dù hệ thống vẫn thấy có người. Cả gia đình được báo. Nếu camera còn thấy người, sự cố mới sẽ mở lại."
                                        : "\(r.resolvedBy ?? "Bạn") xác nhận đã kiểm tra xe lúc \(clock(r.resolvedAt)). Hệ thống không còn phát hiện người trong xe. Cả gia đình đã nhận thông báo.")
                        .padding(.vertical, 6)
                }
                Section {
                    Button("Về trang chủ") { path = NavigationPath() }
                    Button("Xem lịch sử") { path = NavigationPath(); model.tab = 2 }
                }
            } else {
                Section {
                    NoirStatusBlock(symbol: "checklist", color: Noir.accent, kicker: "Xác nhận", title: "Xác nhận đã kiểm tra xe",
                                    detail: "Chỉ xác nhận khi bạn hoặc người thân đang đứng cạnh xe và đã nhìn tận mắt. Hệ thống sẽ kiểm tra lại dữ liệu mới nhất trước khi đóng sự cố.")
                        .padding(.vertical, 6)
                }
                Section {
                    ForEach(items, id: \.0) { k, t in
                        Button {
                            withAnimation(.smooth(duration: 0.2)) { if checks.contains(k) { checks.remove(k) } else { checks.insert(k) } }
                        } label: {
                            Label(t, systemImage: checks.contains(k) ? "checkmark.circle.fill" : "circle")
                                .contentTransition(.symbolEffect(.replace))
                                .foregroundStyle(checks.contains(k) ? Noir.accent : .primary)
                        }
                        .accessibilityAddTraits(checks.contains(k) ? .isSelected : [])
                    }
                }
                if let r = result?.reject { rejected(r) }
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
            }
        }
        .noirList()
        .safeAreaInset(edge: .bottom) {
            if result?.result != "resolved" {
                Button { Task { await submit() } } label: {
                    Group { if busy { ProgressView() } else { Text(result?.reject == nil ? "Gửi xác nhận" : "Gửi lại xác nhận") } }.frame(maxWidth: .infinity)
                }
                .buttonStyle(NoirProminent()).controlSize(.large).disabled(checks.count < 3 || busy)
                .padding(.horizontal, 16).padding(.vertical, 10).background(.bar)
            }
        }
        .sensoryFeedback(.success, trigger: result?.result == "resolved")
        .confirmationDialog("Đóng sự cố dù hệ thống vẫn thấy người?", isPresented: $askOverride, titleVisibility: .visible) {
            Button("Tôi xác nhận xe không có ai, đóng sự cố", role: .destructive) { Task { await submit(override: true) } }
            Button("Quay lại kiểm tra xe", role: .cancel) {}
        } message: {
            Text("Chỉ làm khi bạn đang đứng cạnh xe và đã tự nhìn tận mắt. Cả gia đình sẽ được báo, việc này được ghi vào lịch sử, và nếu camera vẫn thấy người thì sự cố mới sẽ mở lại.")
        }
        .navigationTitle("Tôi đã kiểm tra xe").navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .task { fetched = try? await model.api.incident(incidentId) }
    }

    @ViewBuilder private func rejected(_ r: Reject) -> some View {
        Section {
            Label { Text(r.title).font(.headline) } icon: { Image(systemName: "xmark.octagon.fill").foregroundStyle(Theme.red) }
            Text(r.message).font(.callout)
            Text("Sự cố vẫn mở.").font(.footnote.bold()).foregroundStyle(.secondary)
            if r.code == "stale" || r.code == "changed" {
                Button("Yêu cầu dữ liệu mới") {
                    Task {
                        if let vid = inc?.vehicleId { _ = await model.perform { try await model.api.refresh(vid) } }
                        fetched = try? await model.api.incident(incidentId)
                    }
                }
            }
            if r.code == "presence" {
                Link(destination: URL(string: "tel:112")!) { Label("Thấy người trong xe? Gọi 112", systemImage: "phone.fill") }.foregroundStyle(Theme.red)
                Button("Hệ thống nhầm? Đóng thủ công…") { askOverride = true }.disabled(busy || checks.count < 3)
                if model.demo, model.status?.role == "owner" {
                    Button("Mô phỏng: đã đưa người ra khỏi xe") {
                        Task { _ = await model.runScenario("presence_clear"); fetched = try? await model.api.incident(incidentId) }
                    }
                }
            }
        }
    }

    private func submit(override: Bool = false) async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let current = try await model.api.incident(incidentId)
            let rev = result?.reject == nil ? (inc?.revision ?? current.revision) : current.revision
            let r = try await model.api.confirm(incidentId, revision: rev, checks: Array(checks), override: override)
            overridden = override && r.result == "resolved"
            result = r; fetched = r
            if r.result == "resolved" { await model.tick() }
        } catch { self.error = (error as? APIError)?.message }
    }
}
