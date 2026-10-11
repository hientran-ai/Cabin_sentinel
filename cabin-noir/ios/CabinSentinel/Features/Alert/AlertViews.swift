import SwiftUI

struct AlertDetailView: View {
    let incidentId: String
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var fetched: Incident?
    /// Show the incident already in memory at once; the network copy replaces it when it lands.
    private var inc: Incident? { fetched ?? model.status?.incident.flatMap { $0.id == incidentId ? $0 : nil } }
    @State private var done: Set<Int> = []
    @State private var why = false
    @State private var showCall = false
    @State private var error: String?
    @State private var loadedAt = Date()
    @State private var now = Date()

    private var canAct: Bool { model.status?.canAct ?? false }

    var body: some View {
        ScrollView {
            if let inc {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        let st = LevelStyle.of(inc.level)
                        Label("\(st.label.capitalized) · \(mmss(inc.elapsed + Int(now.timeIntervalSince(loadedAt))))", systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 15, weight: .bold).monospacedDigit()).foregroundStyle(.white)
                            .padding(.horizontal, 14).frame(height: 40).background(st.color, in: Capsule())
                        Spacer()
                        if inc.status == "resolved" { Text("Đã đóng").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.green) }
                    }
                    Text("Làm theo 3 bước").font(.system(size: 28, weight: .bold))
                    Text(inc.reason).font(.system(size: 16)).foregroundStyle(Theme.ink2)
                    HStack(spacing: 6) { ForEach(0..<3, id: \.self) { i in Capsule().fill(done.contains(i) ? Theme.ink : Theme.line).frame(height: 6) } }
                        .accessibilityLabel("Đã xong \(done.count) trên 3 bước")

                    if let esc = inc.escalation { EscalationBanner(esc: esc) }
                    if inc.viewedAt != nil, inc.status == "open" {
                        Card(tint: Theme.ink, stroke: .clear) {
                            Text("\(inc.viewedBy ?? "Bạn") đã xem lúc \(clock(inc.viewedAt))").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                            Text("Sự cố vẫn mở cho tới khi có người xác nhận đã kiểm tra xe.").font(.system(size: 14)).foregroundStyle(Theme.card)
                        }
                    }

                    step(0, "Đến xe ngay, hoặc nhờ người gần nhất", "Gọi người thân ở gần xe nếu bạn ở xa. Trong lúc chờ, có thể bật làm mát từ xa.") {
                        Button("Gọi người thân") { showCall = true }.buttonStyle(SecondaryButtonStyle())
                        if canAct { NavigationLink(value: Route.climate) { Text("Bật làm mát") }.buttonStyle(PrimaryButtonStyle(color: Theme.blue)) }
                    }
                    step(1, "Nhìn kỹ ghế sau và sàn xe", "Trẻ nhỏ, thú cưng có thể nằm thấp hoặc bị che. Camera chỉ hỗ trợ quan sát.") {
                        if canAct { NavigationLink(value: Route.camera) { Text("Xem camera") }.buttonStyle(SecondaryButtonStyle()) }
                        NavigationLink(value: Route.cabin) { Text("Sơ đồ ghế") }.buttonStyle(SecondaryButtonStyle())
                    }
                    step(2, "Thấy người hoặc thú cưng: gọi ngay", "Không chờ hệ thống. Hết thời gian không có nghĩa là đã an toàn.") {
                        Link(destination: URL(string: "tel:112")!) { Text("Gọi 112") }.buttonStyle(PrimaryButtonStyle(color: Theme.red))
                        Link(destination: URL(string: "tel:115")!) { Text("Gọi 115") }.buttonStyle(PrimaryButtonStyle(color: Theme.red))
                    }

                    DisclosureGroup(isExpanded: $why) {
                        VStack(alignment: .leading, spacing: 8) {
                            if let seat = inc.seatLabel, let c = inc.confidence {
                                Text("Chưa xác minh: người \(Int(c * 100))% ở \(seat.lowercased()), theo camera. Không biết tuổi; có thể bỏ sót người bị che.")
                            }
                            if let t = inc.cabinTemp { Text("Cabin \(Int(t))°C lúc phát hiện.") }
                            ForEach(inc.events ?? [], id: \.self) { e in
                                HStack(alignment: .top, spacing: 10) {
                                    Text(clock(e.at)).font(.system(size: 13, weight: .bold).monospacedDigit()).foregroundStyle(Theme.ink2)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(e.title).font(.system(size: 14, weight: .bold))
                                        Text(e.detail).font(.system(size: 13)).foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                        }
                        .font(.system(size: 14)).foregroundStyle(Theme.ink).padding(.top, 8)
                    } label: {
                        Text("Vì sao có cảnh báo này?").font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.ink)
                    }
                    .padding(16).background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                    
                    if let error { ErrorBanner(message: error) }
                }
                .padding(16).padding(.bottom, 8)
            } else if let error {
                ErrorBanner(message: error) { Task { await load() } }.padding(16)
            } else {
                ProgressView().padding(.top, 100)
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
        .screenBackground()
        .navigationTitle("Chi tiết cảnh báo").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showCall) { CallSheet() }
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(3))
            }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
    }

    @ViewBuilder
    private var bottomBar: some View {
        if let inc, inc.status == "open" {
            VStack(spacing: 4) {
                HStack(spacing: 8) {
                    Button { showCall = true } label: { Label("Gọi khẩn cấp", systemImage: "phone.fill") }
                        .buttonStyle(PrimaryButtonStyle(color: inc.level == "critical" ? Theme.red : Theme.orange))
                    if canAct {
                        NavigationLink(value: Route.confirm(inc.id)) { Text("Tôi đã kiểm tra xe") }.buttonStyle(PrimaryButtonStyle())
                    }
                }
                Button(inc.viewedAt == nil ? "Đã xem, kiểm tra sau" : "Về trang chủ · sự cố vẫn mở") {
                    Task {
                        if inc.viewedAt == nil { _ = try? await model.api.view(inc.id) }
                        path = NavigationPath()
                    }
                }
                .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.ink).frame(minHeight: 40)
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 4)
            .background(Theme.card)
        }
    }

    private func step<A: View>(_ i: Int, _ title: String, _ body: String, @ViewBuilder actions: () -> A) -> some View {
        let on = done.contains(i)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(i + 1)").font(.system(size: 17, weight: .bold))
                    .foregroundStyle(on ? .white : Theme.ink)
                    .frame(width: 40, height: 40).background(on ? Theme.primary : Theme.card, in: Circle())
                    
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 18, weight: .bold))
                    Text(body).font(.system(size: 15)).foregroundStyle(Theme.ink2)
                }
            }
            HStack(spacing: 8) { actions() }.padding(.leading, 52)
            Button(on ? "Đã xong" : "Đánh dấu đã xong") {
                if on { done.remove(i) } else { done.insert(i) }
            }
            .font(.system(size: 14, weight: .bold)).foregroundStyle(on ? .white : Theme.ink)
            .padding(.horizontal, 14).frame(minHeight: 40)
            .background(on ? Theme.primary : .clear, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.clear))
            .padding(.leading, 52)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
        .padding(16)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(on ? Theme.muted : Theme.card, lineWidth: 1.5))
    }

    private func load() async {
        do {
            let i = try await model.api.incident(incidentId)
            fetched = i; loadedAt = Date(); error = nil
        } catch { self.error = (error as? APIError)?.message }
    }
}

struct EscalationBanner: View {
    let esc: Escalation
    var body: some View {
        let step = esc.steps[esc.current]
        let last = esc.current == esc.steps.count - 1 && step.state == "done"
        NavigationLink(value: Route.escalation) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(esc.current + 1)/\(esc.steps.count)").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 40, height: 40).background(last ? Theme.red : Theme.primary, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(esc.stopped ? "Đã dừng leo thang vì có người xem" : (last ? "Chưa ai xử lý sau 3 phút. Hãy gọi 112" : "Đã: \(step.title.lowercased())"))
                        .font(.system(size: 15, weight: .bold))
                    if let n = esc.nextIn, !esc.stopped, let next = esc.steps.first(where: { $0.state == "pending" }) {
                        Text("Tiếp theo sau \(mmss(n)): \(next.title.lowercased())").font(.system(size: 14)).foregroundStyle(Theme.ink2)
                    } else if last {
                        Text("Ứng dụng không tự gọi 112 và không mở khóa xe.").font(.system(size: 14)).foregroundStyle(Theme.ink2)
                    }
                    Text("Xem các bước leo thang ›").font(.system(size: 14, weight: .bold))
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.ink).multilineTextAlignment(.leading).padding(14)
            .background(last ? Theme.redBg : Theme.card, in: RoundedRectangle(cornerRadius: 18))
        }
    }
}

struct EscalationView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let esc = model.status?.incident?.escalation
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Khi thông báo không tới được bạn").font(.system(size: 26, weight: .bold))
                Text("Hệ thống thử lần lượt các kênh dưới đây cho tới khi có người mở cảnh báo, bấm “Đã xem” hoặc xác nhận đã kiểm tra xe.")
                    .font(.system(size: 15)).foregroundStyle(Theme.ink2)
                ForEach(Array(steps(esc).enumerated()), id: \.offset) { i, s in
                    HStack(alignment: .top, spacing: 12) {
                        Text(s.offset >= 60 ? "\(s.offset / 60)ph\(s.offset % 60 == 0 ? "" : "\(s.offset % 60)")" : "\(s.offset)s")
                            .font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 44, height: 44).background(color(s.state, last: i == 5), in: Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            Text(s.title).font(.system(size: 16, weight: .bold))
                            Text(s.note).font(.system(size: 14)).foregroundStyle(Theme.ink2)
                            Text(label(s)).font(.system(size: 13, weight: .bold)).foregroundStyle(color(s.state, last: false))
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(14).background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                }
                HStack { DemoBadge(); Text("Bản dùng thử chưa gửi SMS hoặc gọi thật.").font(.system(size: 13)).foregroundStyle(Theme.muted) }
            }
            .padding(16)
        }
        .screenBackground().navigationTitle("Leo thang tự động").navigationBarTitleDisplayMode(.inline)
    }

    private func steps(_ e: Escalation?) -> [EscalationStep] {
        if let e { return e.steps }
        let base: [(Int, String, String)] = [(0, "Thông báo khẩn tới mọi điện thoại trong gia đình", "Nhắc lại mỗi 60 giây"),
                                              (30, "SMS tới chủ xe", "Nếu chưa ai mở cảnh báo"), (60, "Gọi tự động tới chủ xe", "Gọi lại một lần nếu không nghe máy"),
                                              (90, "SMS người liên hệ khẩn cấp", "Áp dụng cho Cảnh báo và Nghiêm trọng"),
                                              (120, "Gọi người nhà dùng chung ứng dụng", "Người có quyền Xem và xác nhận"),
                                              (180, "Gợi ý gọi 112", "Ứng dụng không tự gọi 112 và không mở khóa xe")]
        return base.map { EscalationStep(offset: $0.0, key: "\($0.0)", title: $0.1, note: $0.2, state: "idle", at: 0) }
    }

    private func label(_ s: EscalationStep) -> String {
        switch s.state {
        case "done": return "Đã thực hiện lúc \(clock(s.at))"
        case "pending": return "Chờ tới \(clock(s.at))"
        case "stopped": return "Đã dừng · có người xem"
        default: return "Sau \(s.offset) giây kể từ khi phát hiện"
        }
    }

    private func color(_ state: String, last: Bool) -> Color {
        switch state {
        case "done": return last ? Theme.red : Theme.ink
        case "stopped": return Theme.green
        default: return Theme.muted
        }
    }
}

struct ConfirmCheckView: View {
    let incidentId: String
    @Binding var path: NavigationPath
    @Environment(AppModel.self) private var model
    @State private var checks: Set<String> = []
    @State private var fetched: Incident?
    /// Show the incident already in memory at once; the network copy replaces it when it lands.
    private var inc: Incident? { fetched ?? model.status?.incident.flatMap { $0.id == incidentId ? $0 : nil } }
    @State private var result: Incident?
    @State private var busy = false
    @State private var error: String?

    private let items: [(String, String)] = [
        ("seats", "Tôi đã nhìn tất cả ghế, kể cả ghế trẻ em"),
        ("floor", "Tôi đã nhìn sàn xe, dưới và giữa các ghế"),
        ("trunk", "Tôi đã kiểm tra cốp xe"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let r = result, r.result == "resolved" {
                    success(r)
                } else {
                    Text("Xác nhận đã kiểm tra xe").font(.system(size: 28, weight: .bold))
                    Text("Chỉ xác nhận khi bạn hoặc người thân đang đứng cạnh xe và đã nhìn tận mắt. Hệ thống sẽ kiểm tra lại dữ liệu mới nhất trước khi đóng sự cố.")
                        .font(.system(size: 15)).foregroundStyle(Theme.ink2)
                    ForEach(items, id: \.0) { k, t in
                        Button { if checks.contains(k) { checks.remove(k) } else { checks.insert(k) } } label: {
                            HStack(spacing: 12) {
                                Image(systemName: checks.contains(k) ? "checkmark.square.fill" : "square").font(.system(size: 22))
                                Text(t).font(.system(size: 16, weight: .semibold)).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(Theme.ink).padding(16)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(checks.contains(k) ? Theme.primary : Color.clear, lineWidth: 1.5))
                        }
                        .accessibilityAddTraits(checks.contains(k) ? .isSelected : [])
                    }
                    if let r = result?.reject { rejected(r) }
                    if let error { ErrorBanner(message: error) }
                }
            }
            .padding(16)
        }
        .safeAreaInset(edge: .bottom) {
            if result?.result != "resolved" {
                Button { Task { await submit() } } label: {
                    if busy { ProgressView().tint(.white) } else { Text(result?.reject == nil ? "Gửi xác nhận" : "Gửi lại xác nhận") }
                }
                .buttonStyle(PrimaryButtonStyle(enabled: checks.count == 3)).disabled(checks.count < 3 || busy)
                .padding(.horizontal, 16).padding(.bottom, 8).background(Theme.bg)
            }
        }
        .screenBackground().navigationTitle("Tôi đã kiểm tra xe").navigationBarTitleDisplayMode(.inline)
        .task { fetched = try? await model.api.incident(incidentId) }
    }

    private func rejected(_ r: Reject) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(r.title, systemImage: "xmark.octagon.fill").font(.system(size: 17, weight: .bold)).foregroundStyle(Theme.redDark)
            Text(r.message).font(.system(size: 15)).foregroundStyle(Theme.ink)
            Text("Sự cố vẫn mở.").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.ink2)
            if r.code == "stale" || r.code == "changed" {
                Button("Yêu cầu dữ liệu mới") {
                    Task {
                        if let vid = inc?.vehicleId { _ = await model.perform { try await model.api.refresh(vid) } }
                        fetched = try? await model.api.incident(incidentId)
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            if r.code == "presence" {
                Link(destination: URL(string: "tel:112")!) { Text("Thấy người trong xe? Gọi 112") }.buttonStyle(PrimaryButtonStyle(color: Theme.red))
                if model.demo, model.status?.role == "owner" {
                    Button("Mô phỏng: đã đưa người ra khỏi xe") {
                        Task { _ = await model.runScenario("presence_clear"); fetched = try? await model.api.incident(incidentId) }
                    }
                    .buttonStyle(SecondaryButtonStyle(color: Theme.ink2))
                }
            }
        }
        .padding(16).background(Theme.redBg, in: RoundedRectangle(cornerRadius: 18))
    }

    private func success(_ r: Incident) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "checkmark.shield.fill").font(.system(size: 34)).foregroundStyle(.white)
                .frame(width: 72, height: 72).background(Theme.green, in: Circle())
            Text("Đã đóng sự cố").font(.system(size: 28, weight: .bold))
            Text("\(r.resolvedBy ?? "Bạn") xác nhận đã kiểm tra xe lúc \(clock(r.resolvedAt)). Hệ thống không còn phát hiện người trong xe. Cả gia đình đã nhận thông báo.")
                .font(.system(size: 16)).foregroundStyle(Theme.ink2)
            Button("Về trang chủ") { path = NavigationPath() }.buttonStyle(PrimaryButtonStyle())
            Button("Xem lịch sử") { path = NavigationPath(); model.tab = 2 }.buttonStyle(SecondaryButtonStyle())
        }
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            // Always confirm against the latest revision the user is looking at.
            let current = try await model.api.incident(incidentId)
            let rev = result?.reject == nil ? (inc?.revision ?? current.revision) : current.revision
            let r = try await model.api.confirm(incidentId, revision: rev, checks: Array(checks))
            result = r
            fetched = r
            if r.result == "resolved" { await model.tick() }
        } catch {
            self.error = (error as? APIError)?.message
        }
    }
}
