import SwiftUI

/// Thiết bị và bảo vệ.
struct NoirDevice: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false

    var body: some View {
        let p = model.status?.protection
        List {
            if let p {
                let (color, icon): (Color, String) = p.level == "ok" ? (Theme.green, "checkmark.shield.fill")
                    : p.level == "partial" ? (Theme.orange, "exclamationmark.triangle.fill") : (.secondary, "nosign")
                Section {
                    NoirStatusBlock(symbol: icon, color: color, kicker: p.title, title: headline(p), detail: explain(p))
                        .padding(.vertical, 6)
                    Button {
                        Task {
                            busy = true
                            if let id = model.selected?.id { _ = await model.perform { try await model.api.refresh(id) } }
                            busy = false
                        }
                    } label: { if busy { ProgressView() } else { Label("Kiểm tra lại", systemImage: "arrow.clockwise") } }
                    .disabled(busy)
                }
                Section("Thành phần") {
                    ForEach(p.rows) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.label).font(.body)
                                    Text(r.detail).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                chip(r.status)
                            }
                            if let fix = r.fix { Text(fix).font(.footnote).foregroundStyle(Theme.orange) }
                        }
                    }
                }
                Section {} footer: {
                    Text("Không thấy cảnh báo không có nghĩa là xe an toàn khi trạng thái ở đây không phải “Đang bảo vệ”.")
                }
            } else {
                ContentUnavailableView("Chưa có dữ liệu thiết bị", systemImage: "cpu", description: Text("Chọn một xe đã liên kết để xem tình trạng thiết bị."))
                    .listRowBackground(Color.clear)
            }
        }
        .noirList()
        .navigationTitle("Thiết bị và bảo vệ").navigationBarTitleDisplayMode(.inline)
    }

    private func headline(_ p: Protection) -> String {
        switch p.level {
        case "ok": return "Mọi thiết bị đang hoạt động"
        case "partial": return p.rows.first { $0.status == "bad" }.map { "\($0.label): \($0.detail.lowercased())" } ?? "Pin thiết bị sắp hết"
        default: return "Mất kết nối với thiết bị trong xe"
        }
    }

    private func explain(_ p: Protection) -> String {
        switch p.level {
        case "ok": return "Cảnh báo sẽ tới điện thoại này khi có sự cố. Hệ thống chỉ hỗ trợ, không đảm bảo an toàn tuyệt đối."
        case "partial": return "Một phần hệ thống chưa hoạt động nên có thể không phát hiện được người trong xe."
        default: return "Ứng dụng không biết cabin đang thế nào và sẽ không gửi cảnh báo cho tới khi kết nối lại."
        }
    }

    private func chip(_ s: String) -> some View {
        let (t, c, icon): (String, Color, String) = {
            switch s {
            case "good": return ("Tốt", Theme.green, "checkmark.circle.fill")
            case "warn": return ("Cần chú ý", Theme.orange, "exclamationmark.circle.fill")
            case "bad": return ("Lỗi", Theme.red, "xmark.octagon.fill")
            default: return ("Không rõ", .secondary, "questionmark.circle")
            }
        }()
        return Label(t, systemImage: icon).font(.footnote.weight(.semibold)).foregroundStyle(c)
    }
}

/// Sơ đồ ghế.
struct NoirCabin: View {
    @Environment(AppModel.self) private var model

    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 6) { Circle().fill(c).frame(width: 8, height: 8); Text(t) }
    }

    var body: some View {
        let seats = model.status?.seats ?? []
        let stale = model.status?.verdict?.current == false
        List {
            Section {
                VStack(spacing: 14) {
                    NoirSeatMap(seats: seats, stale: stale).frame(width: 230, height: 430).padding(.top, 14)
                    HStack(spacing: 16) {
                        legend(Theme.red, "Có người"); legend(.white.opacity(0.4), "Trống"); legend(.secondary, "Chưa rõ")
                    }
                    .font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity).padding(.bottom, 8)
                .listRowBackground(Color.clear)
            }
            Section("Từng ghế") {
                ForEach(seats) { s in
                    HStack {
                        Image(systemName: s.occ && !stale ? (s.kind == "pet" ? "pawprint.fill" : "person.fill") : "carseat.right")
                            .symbolRenderingMode(.hierarchical).foregroundStyle(s.occ && !stale ? Theme.red : .secondary).frame(width: 28)
                        Text(s.label)
                        Spacer()
                        Text(stale ? "Không rõ" : (s.occ ? "\(s.kind == "pet" ? "Thú cưng" : "Người") \(Int(s.conf * 100))%" : "Trống"))
                            .foregroundStyle(s.occ && !stale ? Theme.red : .secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Section {} footer: { Text("Theo cảm biến ghế và camera. Không biết tuổi; có thể bỏ sót người bị che.") }
        }
        .noirList()
        .navigationTitle("Sơ đồ ghế").navigationBarTitleDisplayMode(.inline)
    }
}

/// Nhắc khi rời xe.
struct NoirExit: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var done = false
    @State private var snoozed = false

    var body: some View {
        let ec = model.status?.exitCheck
        List {
            Section {
                NoirStatusBlock(symbol: done ? "checkmark.circle.fill" : "person.fill.questionmark", color: done ? Theme.green : Theme.orange,
                                kicker: "Trước khi khóa xe", title: title(ec),
                                detail: "Bạn vừa tắt máy ở \(ec?.location ?? "—"). Hãy nhìn ghế sau rồi xác nhận.")
                    .padding(.vertical, 6)
            }
            Section("Ghế") {
                ForEach(model.status?.seats ?? []) { s in
                    HStack {
                        Text(s.label)
                        Spacer()
                        Text(s.occ ? "Có thể có người · \(Int(s.conf * 100))%" : "Trống").foregroundStyle(s.occ ? Theme.orange : .secondary)
                    }
                }
            }
            if done { Section { Label("Đã ghi nhận. Cabin sẽ được giám sát khi xe khóa.", systemImage: "checkmark.seal.fill").foregroundStyle(Theme.green) } }
            if snoozed { Section { Label("Sẽ nhắc lại sau 1 phút.", systemImage: "bell") } }
            Section {} footer: { Text("Dựa trên cảm biến ghế và camera nên có thể sai hoặc chậm.") }
        }
        .noirList()
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) {
                if done {
                    Button { dismiss() } label: { Text("Về trang chủ").frame(maxWidth: .infinity) }.buttonStyle(NoirProminent()).controlSize(.large)
                } else {
                    Button {
                        Task {
                            if let id = model.selected?.id { _ = await model.perform { try await model.api.exitConfirm(id) } }
                            withAnimation(.smooth) { done = true }
                        }
                    } label: { Text("Đã đưa người xuống, tôi đã kiểm tra").frame(maxWidth: .infinity) }
                    .buttonStyle(NoirProminent()).controlSize(.large)
                    HStack {
                        Button("Nhắc lại sau 1 phút") { withAnimation(.smooth) { snoozed = true } }.buttonStyle(.bordered)
                        #if !PRODUCTION
                        if model.status?.canAct == true { NavigationLink(value: Route.camera) { Label("Xem camera", systemImage: "camera") }.buttonStyle(.bordered) }
                        #endif
                    }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 8)
        }
        .sensoryFeedback(.success, trigger: done)
        .navigationTitle("Nhắc khi rời xe").navigationBarTitleDisplayMode(.inline)
    }

    private func title(_ ec: ExitCheck?) -> String {
        guard let ec, ec.pending, let s = ec.seats.first else { return "Ghế sau trống" }
        if let kid = model.children.first(where: { "rear_\($0.seat)" == s.key }) { return "\(kid.name) còn ở \(s.label.lowercased())?" }
        return "Còn người ở \(s.label.lowercased())?"
    }
}

// MARK: - Seat map illustration

/// Top-down car drawn as an x-ray: body, glass, wheels, lights and five seats whose state reads at a glance:
/// empty (quiet outline), occupied (lit, with person or paw and the confidence), unknown (dashed, "?").
/// Unknown is never drawn as empty.
struct NoirSeatMap: View {
    let seats: [Seat]
    var stale = false

    private let layout: [String: CGPoint] = [
        "driver": CGPoint(x: 0.31, y: 0.40), "passenger": CGPoint(x: 0.69, y: 0.40),
        "rear_left": CGPoint(x: 0.25, y: 0.64), "rear_mid": CGPoint(x: 0.5, y: 0.64), "rear_right": CGPoint(x: 0.75, y: 0.64),
    ]

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                wheels(w, h)
                CarBodyShape().fill(LinearGradient(colors: [.white.opacity(0.14), .white.opacity(0.05)], startPoint: .top, endPoint: .bottom))
                CarBodyShape().stroke(.white.opacity(0.22), lineWidth: 1.5)
                // windshield and rear window
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(hex: 0x6C86A8).opacity(0.30))
                    .frame(width: w * 0.64, height: h * 0.075).position(x: w / 2, y: h * 0.205)
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(hex: 0x6C86A8).opacity(0.22))
                    .frame(width: w * 0.58, height: h * 0.05).position(x: w / 2, y: h * 0.86)
                // cabin
                RoundedRectangle(cornerRadius: w * 0.14, style: .continuous).fill(.black.opacity(0.28))
                    .frame(width: w * 0.70, height: h * 0.56).position(x: w / 2, y: h * 0.53)
                lights(w, h)
                ForEach(seats) { s in
                    let p = layout[s.key] ?? .zero
                    let rear = s.key.hasPrefix("rear")
                    SeatShape(state: state(s), kind: s.kind, conf: s.conf)
                        .frame(width: w * (rear ? 0.19 : 0.21), height: h * (rear ? 0.14 : 0.15))
                        .position(x: w * p.x, y: h * p.y)
                }
                Label("Phía trước", systemImage: "arrow.up").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    .labelStyle(.titleAndIcon).position(x: w / 2, y: -h * 0.03)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sơ đồ ghế xe nhìn từ trên xuống")
        .accessibilityValue(seats.map { "\($0.label): \(label(state($0)))" }.joined(separator: ", "))
    }

    private func state(_ s: Seat) -> SeatState { stale ? .unknown : (s.occ ? .occupied : .empty) }
    private func label(_ s: SeatState) -> String { s == .occupied ? "có người" : (s == .empty ? "trống" : "chưa rõ") }

    private func wheels(_ w: CGFloat, _ h: CGFloat) -> some View {
        ZStack {
            ForEach(Array([(0.045, 0.20), (0.955, 0.20), (0.045, 0.74), (0.955, 0.74)].enumerated()), id: \.offset) { _, p in
                RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color(white: 0.09))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(.white.opacity(0.18), lineWidth: 1))
                    .frame(width: w * 0.085, height: h * 0.15).position(x: w * p.0, y: h * (p.1 + 0.075))
            }
        }
    }

    private func lights(_ w: CGFloat, _ h: CGFloat) -> some View {
        ZStack {
            ForEach([0.26, 0.74], id: \.self) { x in
                Capsule().fill(.white.opacity(0.85)).frame(width: w * 0.12, height: 4).position(x: w * x, y: h * 0.045)
                Capsule().fill(Theme.red.opacity(0.85)).frame(width: w * 0.12, height: 4).position(x: w * x, y: h * 0.965)
            }
        }
    }
}

enum SeatState { case empty, occupied, unknown }

private struct SeatShape: View {
    let state: SeatState
    let kind: String?
    let conf: Double
    @State private var pulse = false

    var body: some View {
        let lit: Color = state == .occupied ? (kind == "pet" ? Theme.orange : Theme.red) : .white
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                if state == .occupied {
                    RoundedRectangle(cornerRadius: w * 0.3, style: .continuous).fill(lit.opacity(0.35)).blur(radius: 10)
                        .scaleEffect(pulse ? 1.18 : 1.0).opacity(pulse ? 0.4 : 0.9)
                }
                // backrest (rear edge) and cushion
                RoundedRectangle(cornerRadius: w * 0.2, style: .continuous).fill(fill(lit)).frame(width: w, height: h * 0.34).position(x: w / 2, y: h * 0.83)
                RoundedRectangle(cornerRadius: w * 0.22, style: .continuous).fill(fill(lit)).frame(width: w * 0.9, height: h * 0.62).position(x: w / 2, y: h * 0.36)
                if state == .unknown {
                    RoundedRectangle(cornerRadius: w * 0.22, style: .continuous)
                        .strokeBorder(.secondary, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])).frame(width: w * 0.9, height: h * 0.62).position(x: w / 2, y: h * 0.36)
                    Image(systemName: "questionmark").font(.caption.bold()).foregroundStyle(.secondary).position(x: w / 2, y: h * 0.36)
                } else if state == .occupied {
                    VStack(spacing: 1) {
                        Image(systemName: kind == "pet" ? "pawprint.fill" : "person.fill").font(.callout).symbolEffect(.pulse, isActive: true)
                        Text("\(Int((conf * 100).rounded()))%").font(.caption2.weight(.bold).monospacedDigit())
                    }
                    .foregroundStyle(.white).position(x: w / 2, y: h * 0.40)
                }
            }
        }
        .onAppear { if state == .occupied { withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true } } }
        .animation(.smooth(duration: 0.4), value: state)
    }

    private func fill(_ lit: Color) -> some ShapeStyle {
        switch state {
        case .occupied: return AnyShapeStyle(lit.gradient)
        case .empty: return AnyShapeStyle(Color.white.opacity(0.13))
        case .unknown: return AnyShapeStyle(Color.white.opacity(0.06))
        }
    }
}

/// Soft top-down silhouette: pointed nose, widest at the doors, tapered tail.
struct CarBodyShape: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        var p = Path()
        p.move(to: CGPoint(x: w * 0.5, y: 0))
        p.addCurve(to: CGPoint(x: w * 0.88, y: h * 0.10), control1: CGPoint(x: w * 0.68, y: 0), control2: CGPoint(x: w * 0.82, y: h * 0.03))
        p.addCurve(to: CGPoint(x: w * 0.93, y: h * 0.30), control1: CGPoint(x: w * 0.92, y: h * 0.15), control2: CGPoint(x: w * 0.93, y: h * 0.22))
        p.addLine(to: CGPoint(x: w * 0.93, y: h * 0.78))
        p.addCurve(to: CGPoint(x: w * 0.86, y: h * 0.94), control1: CGPoint(x: w * 0.93, y: h * 0.86), control2: CGPoint(x: w * 0.91, y: h * 0.91))
        p.addCurve(to: CGPoint(x: w * 0.5, y: h), control1: CGPoint(x: w * 0.80, y: h * 0.985), control2: CGPoint(x: w * 0.66, y: h))
        p.addCurve(to: CGPoint(x: w * 0.14, y: h * 0.94), control1: CGPoint(x: w * 0.34, y: h), control2: CGPoint(x: w * 0.20, y: h * 0.985))
        p.addCurve(to: CGPoint(x: w * 0.07, y: h * 0.78), control1: CGPoint(x: w * 0.09, y: h * 0.91), control2: CGPoint(x: w * 0.07, y: h * 0.86))
        p.addLine(to: CGPoint(x: w * 0.07, y: h * 0.30))
        p.addCurve(to: CGPoint(x: w * 0.12, y: h * 0.10), control1: CGPoint(x: w * 0.07, y: h * 0.22), control2: CGPoint(x: w * 0.08, y: h * 0.15))
        p.addCurve(to: CGPoint(x: w * 0.5, y: 0), control1: CGPoint(x: w * 0.18, y: h * 0.03), control2: CGPoint(x: w * 0.32, y: 0))
        p.closeSubpath()
        return p
    }
}
