import SwiftUI

// MARK: - Climate

struct ClimateView: View {
    @Environment(AppModel.self) private var model
    @State private var target = 22
    @State private var mode = "cool"
    @State private var fan = "auto"
    @State private var duration = 20
    @State private var busy = false
    @State private var error: String?
    @State private var synced = false

    var body: some View {
        let s = model.status
        let c = s?.climate
        ScrollView {
            VStack(spacing: 14) {
                if let inc = s?.incident {
                    Card(tint: Theme.redBg, stroke: Theme.red.opacity(0.4)) {
                        Text(inc.level == "critical" ? "Sự cố Nghiêm trọng đang mở" : "Sự cố Cảnh báo đang mở").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.redDark)
                        Text("Làm mát giúp giảm nhiệt nhưng không thay thế việc kiểm tra xe.").font(.system(size: 14))
                    }
                }
                gauge(temp: s?.cabinTemp, target: target, on: c?.status == "on")
                statusPill(c)
                Card {
                    HStack {
                        Text("Nhiệt độ mục tiêu").font(.system(size: 16, weight: .bold))
                        Spacer()
                        Button { target = max(16, target - 1); push() } label: { Image(systemName: "minus") }.buttonStyle(RoundIcon()).disabled(target <= 16)
                        Text("\(target)°").font(.system(size: 22, weight: .bold).monospacedDigit()).frame(width: 54)
                        Button { target = min(28, target + 1); push() } label: { Image(systemName: "plus") }.buttonStyle(RoundIcon()).disabled(target >= 28)
                    }
                    segmented("Chế độ", $mode, [("cool", "Làm mát"), ("heat", "Sưởi"), ("fan", "Chỉ quạt")])
                    segmented("Quạt", $fan, [("auto", "Tự động"), ("low", "Nhẹ"), ("high", "Mạnh")])
                    segmented("Thời gian", Binding(get: { String(duration) }, set: { duration = Int($0) ?? 20 }), [("10", "10 phút"), ("20", "20 phút"), ("30", "30 phút")])
                }
                HStack {
                    Label("Pin xe đủ cho \(duration) phút", systemImage: "battery.75percent")
                    Spacer()
                    Text("Ngoài trời \(Int(s?.outsideTemp ?? 0))°C")
                }
                .font(.system(size: 14)).foregroundStyle(Theme.ink2)
                if let error { ErrorBanner(message: error) }
                HStack { DemoBadge(); Text("Bản dùng thử không điều khiển xe thật.").font(.system(size: 13)).foregroundStyle(Theme.muted); Spacer() }
            }
            .padding(16)
        }
        .safeAreaInset(edge: .bottom) {
            Group {
                if c?.status == "on" || c?.status == "sending" {
                    Button("Tắt điều hòa") { send("stop") }.buttonStyle(SecondaryButtonStyle(color: Theme.redDark))
                } else {
                    Button(c?.status == "fail" ? "Thử lại" : "Bật điều hòa") { send("start") }.buttonStyle(PrimaryButtonStyle(color: Theme.blue))
                }
            }
            .disabled(busy).padding(.horizontal, 16).padding(.bottom, 8).background(Theme.bg)
        }
        .screenBackground().navigationTitle("Điều hòa từ xa").navigationBarTitleDisplayMode(.inline)
        .onAppear { sync(c) }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1.5))
                try? await model.refreshSelected()
            }
        }
    }

    private func sync(_ c: Climate?) {
        guard let c, !synced else { return }
        target = c.status == "off" && model.status?.incident != nil ? 20 : c.target
        mode = c.mode; fan = c.fan; duration = c.durationMin; synced = true
    }

    private func push() { if model.status?.climate?.status == "on" { send("update") } }

    private func send(_ action: String) {
        guard let id = model.selected?.id else { return }
        Task {
            busy = true
            error = await model.perform {
                try await model.api.climate(id, .init(action: action, target: target, mode: mode, fan: fan, durationMin: duration))
            }
            busy = false
        }
    }

    private func gauge(temp: Double?, target: Int, on: Bool) -> some View {
        let t = temp ?? 0
        let frac = min(1, max(0, (t - 16) / 28))
        let color: Color = t >= 35 ? Theme.red : t >= 30 ? Theme.orange : Theme.blue
        return ZStack {
            Circle().stroke(Theme.line, lineWidth: 16)
            Circle().trim(from: 0, to: frac).stroke(color, style: StrokeStyle(lineWidth: 16, lineCap: .round)).rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("Trong cabin").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted)
                Text(temp == nil ? "—" : String(format: "%.0f°", t)).font(.system(size: 60, weight: .bold).monospacedDigit()).foregroundStyle(color)
                Text("Mục tiêu \(target)°C").font(.system(size: 14)).foregroundStyle(Theme.ink2)
            }
        }
        .frame(width: 220, height: 220).padding(.top, 8)
        .animation(.easeInOut, value: t)
        .accessibilityElement(children: .combine)
    }

    private func statusPill(_ c: Climate?) -> some View {
        let (text, fg, bg): (String, Color, Color) = {
            switch c?.status {
            case "sending": return ("Đang gửi lệnh tới xe…", Theme.ink, Theme.greyBg)
            case "on": return ("Đang chạy · còn \(mmss(c?.secondsLeft ?? 0))\(c?.auto == true ? " · tự bật" : "")", Theme.green, Theme.greenBg)
            case "fail": return ("Xe chưa phản hồi. Kiểm tra sóng di động rồi thử lại.", Theme.redDark, Theme.redBg)
            default: return ("Điều hòa đang tắt", Theme.ink, Theme.greyBg)
            }
        }()
        return HStack(spacing: 8) {
            if c?.status == "sending" { ProgressView() }
            Text(text).font(.system(size: 15, weight: .bold)).multilineTextAlignment(.center)
        }
        .foregroundStyle(fg).padding(.horizontal, 16).frame(maxWidth: .infinity, minHeight: 48)
        .background(bg, in: Capsule())
    }

    private func segmented(_ title: String, _ sel: Binding<String>, _ opts: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2)
            Picker(title, selection: sel) { ForEach(opts, id: \.0) { Text($0.1).tag($0.0) } }
                .pickerStyle(.segmented)
                .onChange(of: sel.wrappedValue) { push() }
        }
    }
}

struct RoundIcon: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 18, weight: .bold)).foregroundStyle(Theme.ink)
            .frame(width: 44, height: 44).background(Theme.card, in: Circle())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

// MARK: - Camera (simulated feed)

struct CameraView: View {
    @Environment(AppModel.self) private var model
    @State private var info: CameraInfo?
    @State private var error: String?
    @State private var started = Date()
    @State private var now = Date()

    private var left: Int { max(0, 300 - Int(now.timeIntervalSince(started))) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                CabinFeed(detections: info?.detections ?? [], items: info?.items ?? [], live: info?.available == true && left > 0)
                HStack(spacing: 6) {
                    if info?.available == true && left > 0 {
                        Text("● Trực tiếp").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 8).frame(height: 24).background(Theme.red, in: Capsule())
                    }
                    Text(model.status?.source == "phone" ? "Điện thoại" : "Mô phỏng").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 8).frame(height: 24).background(.black.opacity(0.6), in: Capsule())
                }
                .padding(10)
                if let info, !info.available {
                    VStack(spacing: 10) {
                        Image(systemName: info.reason == "blocked" ? "eye.slash" : "wifi.slash").font(.system(size: 34))
                        Text(info.message ?? "Không xem được camera").font(.system(size: 16, weight: .bold)).multilineTextAlignment(.center)
                    }
                    .foregroundStyle(.white).padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black.opacity(0.7))
                }
                if left == 0 {
                    VStack(spacing: 10) {
                        Text("Đã dừng xem sau 5 phút").font(.system(size: 16, weight: .bold))
                        Button("Xem tiếp") { started = Date() }.buttonStyle(SecondaryButtonStyle()).frame(width: 160)
                    }
                    .foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black.opacity(0.7))
                }
            }
            .frame(height: 300).clipped()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Phát hiện").font(.system(size: 20, weight: .bold))
                        Spacer()
                        Text("Tự dừng sau \(mmss(left))").font(.system(size: 14, weight: .semibold).monospacedDigit()).foregroundStyle(Theme.ink2)
                    }
                    if (info?.detections ?? []).isEmpty && (info?.items ?? []).isEmpty {
                        Text("Không thấy người, thú cưng hay đồ vật. Camera có thể bỏ sót người nằm thấp hoặc bị che.").foregroundStyle(Theme.ink2)
                    }
                    ForEach(info?.detections ?? [], id: \.self) { d in
                        detRow(d.kind == "pet" ? "Thú cưng" : "Người", "\(d.label) · \(Int(d.conf * 100))%" + (d.age == "child" ? " · có thể là trẻ em" : ""), Theme.red)
                    }
                    ForEach(info?.items ?? [], id: \.self) { i in detRow(i.name, "\(Int(i.conf * 100))%", Theme.blue) }
                    if let d = model.status?.detector { Label("Nhận diện bằng \(d) trên điện thoại", systemImage: "iphone.gen3").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink2) }
                    if model.status?.role == "owner" {
                        NavigationLink { PhoneSensorView() } label: { RowLink(icon: "iphone.gen3.radiowaves.left.and.right", title: "Dùng điện thoại này làm camera trong xe", subtitle: "Nhận diện người, thú cưng, đồ vật và gửi vào đây") }.buttonStyle(.plain)
                    }
                    Text("Đèn xanh dương trên thiết bị nhấp nháy khi có người xem. Hình ảnh không được lưu.").font(.system(size: 13)).foregroundStyle(Theme.muted)
                    if let error { ErrorBanner(message: error) }
                }
                .padding(16)
            }
        }
        .screenBackground().navigationTitle("Camera trong xe").navigationBarTitleDisplayMode(.inline)
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .task {
            guard let id = model.selected?.id else { return }
            while !Task.isCancelled {
                do { info = try await model.api.camera(id); error = nil } catch { self.error = (error as? APIError)?.message }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    private func detRow(_ t: String, _ s: String, _ c: Color) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3).strokeBorder(c, lineWidth: 2.5).frame(width: 14, height: 14)
            Text(t).font(.system(size: 16, weight: .bold))
            Spacer()
            Text(s).font(.system(size: 14)).foregroundStyle(Theme.ink2)
        }
        .padding(14).background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Infra-red style rendering of the rear bench with detection boxes. Simulated imagery only.
struct CabinFeed: View {
    let detections: [Detection]
    let items: [CabinItem]
    let live: Bool
    @State private var phase = 0.0

    private let seatX: [String: CGFloat] = ["rear_left": 0.2, "rear_mid": 0.5, "rear_right": 0.8, "driver": 0.3, "passenger": 0.7]

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                LinearGradient(colors: [Color(white: 0.12), Color(white: 0.22), Color(white: 0.1)], startPoint: .top, endPoint: .bottom)
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 18).fill(Color(white: 0.3))
                        .frame(width: w * 0.27, height: h * 0.55)
                        .position(x: w * (0.2 + 0.3 * CGFloat(i)), y: h * 0.55)
                }
                ForEach(detections, id: \.self) { d in
                    let x = (seatX[d.seat] ?? 0.5) * w
                    ZStack(alignment: .topLeading) {
                        Ellipse().fill(Color(white: 0.75)).frame(width: w * 0.12, height: h * 0.16).offset(x: w * 0.065, y: h * 0.04)
                        RoundedRectangle(cornerRadius: 10).fill(Color(white: 0.62)).frame(width: w * 0.2, height: h * 0.32).offset(x: w * 0.025, y: h * 0.2)
                    }
                    .frame(width: w * 0.25, height: h * 0.55, alignment: .topLeading)
                    .position(x: x, y: h * 0.55)
                    RoundedRectangle(cornerRadius: 6).strokeBorder(Theme.red, lineWidth: 2.5)
                        .frame(width: w * 0.24, height: h * 0.56).position(x: x, y: h * 0.52)
                    Text("\(d.kind == "pet" ? "Thú cưng" : "Người") \(Int(d.conf * 100))%")
                        .font(.system(size: 12, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).frame(height: 22)
                        .background(Theme.red, in: RoundedRectangle(cornerRadius: 5)).position(x: x, y: h * 0.2)
                }
                ForEach(items, id: \.self) { i in
                    let x = (seatX[i.seat] ?? 0.5) * w
                    RoundedRectangle(cornerRadius: 5).strokeBorder(Theme.blue, lineWidth: 2).frame(width: w * 0.14, height: h * 0.18).position(x: x, y: h * 0.66)
                    Text(i.name).font(.system(size: 11, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 5).frame(height: 20)
                        .background(Theme.blue, in: RoundedRectangle(cornerRadius: 5)).position(x: x, y: h * 0.53)
                }
                Rectangle().fill(.white.opacity(0.05)).frame(height: 2).position(x: w / 2, y: h * phase)
            }
        }
        .onAppear { withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) { phase = 1 } }
        .accessibilityLabel("Hình mô phỏng camera hàng ghế sau")
    }
}

// MARK: - Seat map

struct CabinView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let seats = model.status?.seats ?? []
        ScrollView {
            VStack(spacing: 16) {
                SeatMap(seats: seats, stale: model.status?.verdict?.current == false)
                    .frame(width: 220, height: 380)
                ForEach(seats) { s in
                    HStack {
                        Circle().fill(s.occ ? Theme.red : Theme.cardLine).frame(width: 12, height: 12)
                        Text(s.label).font(.system(size: 16, weight: .bold))
                        Spacer()
                        Text(model.status?.verdict?.current == false ? "Không rõ" : (s.occ ? "\(s.kind == "pet" ? "Thú cưng" : "Người") \(Int(s.conf * 100))%" : "Trống"))
                            .font(.system(size: 15)).foregroundStyle(s.occ ? Theme.redDark : Theme.ink2)
                    }
                    .padding(14).background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                }
                Text("Theo cảm biến ghế và camera. Không biết tuổi; có thể bỏ sót người bị che.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .screenBackground().navigationTitle("Sơ đồ ghế").navigationBarTitleDisplayMode(.inline)
    }
}

struct SeatMap: View {
    let seats: [Seat]
    var stale = false

    private let layout: [String: CGPoint] = [
        "driver": CGPoint(x: 0.32, y: 0.36), "passenger": CGPoint(x: 0.68, y: 0.36),
        "rear_left": CGPoint(x: 0.25, y: 0.64), "rear_mid": CGPoint(x: 0.5, y: 0.64), "rear_right": CGPoint(x: 0.75, y: 0.64),
    ]

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                RoundedRectangle(cornerRadius: w * 0.4).fill(Theme.card).overlay(RoundedRectangle(cornerRadius: w * 0.4).strokeBorder(Theme.ink2, lineWidth: 2))
                RoundedRectangle(cornerRadius: 18).fill(Theme.card).frame(width: w * 0.7, height: h * 0.14).position(x: w / 2, y: h * 0.18)
                RoundedRectangle(cornerRadius: 18).fill(Theme.card).frame(width: w * 0.66, height: h * 0.1).position(x: w / 2, y: h * 0.86)
                ForEach(seats) { s in
                    let p = layout[s.key] ?? .zero
                    let rear = s.key.hasPrefix("rear")
                    RoundedRectangle(cornerRadius: 10)
                        .fill(stale ? Theme.greyBg : (s.occ ? Theme.redBg : Theme.bg))
                        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(s.occ && !stale ? Theme.red : Theme.cardLine, lineWidth: 2))
                        .overlay { if s.occ && !stale { Image(systemName: "person.fill").foregroundStyle(Theme.red) } }
                        .frame(width: w * (rear ? 0.22 : 0.28), height: h * 0.17)
                        .position(x: w * p.x, y: h * p.y)
                }
            }
        }
        .accessibilityLabel("Sơ đồ ghế xe")
    }
}

// MARK: - Device health

struct DeviceHealthView: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false

    var body: some View {
        let p = model.status?.protection
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let p {
                    let (c, bg, icon): (Color, Color, String) = p.level == "ok" ? (Theme.green, Theme.greenBg, "checkmark.shield.fill")
                        : p.level == "partial" ? (Theme.orange, Theme.orangeBg, "exclamationmark.triangle.fill") : (Theme.ink2, Theme.card, "nosign")
                    Card(tint: bg, stroke: c.opacity(0.35)) {
                        HStack(spacing: 12) {
                            Image(systemName: icon).font(.system(size: 22)).foregroundStyle(.white).frame(width: 48, height: 48).background(c, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(c)
                                Text(headline(p)).font(.system(size: 20, weight: .bold))
                            }
                        }
                        Text(explain(p)).font(.system(size: 15)).foregroundStyle(Theme.ink2)
                        Button {
                            Task {
                                busy = true
                                if let id = model.selected?.id { _ = await model.perform { try await model.api.refresh(id) } }
                                busy = false
                            }
                        } label: { if busy { ProgressView() } else { Text("Kiểm tra lại") } }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    VStack(spacing: 0) {
                        ForEach(p.rows) { r in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.label).font(.system(size: 16, weight: .bold))
                                        Text(r.detail).font(.system(size: 14)).foregroundStyle(Theme.ink2)
                                    }
                                    Spacer()
                                    chip(r.status)
                                }
                                if let fix = r.fix { Text(fix).font(.system(size: 14)).foregroundStyle(Color(hex: 0x5A2A04)) }
                            }
                            .padding(.vertical, 12)
                            if r.id != p.rows.last?.id { Divider() }
                        }
                    }
                    .padding(.horizontal, 16).background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                    Text("Không thấy cảnh báo không có nghĩa là xe an toàn khi trạng thái ở đây không phải “Đang bảo vệ”.")
                        .font(.system(size: 14)).foregroundStyle(Theme.ink2)
                } else {
                    ProgressView()
                }
            }
            .padding(16)
        }
        .screenBackground().navigationTitle("Thiết bị và bảo vệ").navigationBarTitleDisplayMode(.inline)
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
        let (t, fg, bg): (String, Color, Color) = {
            switch s {
            case "good": return ("Tốt", Theme.green, Theme.greenBg)
            case "warn": return ("Cần chú ý", Theme.orange, Theme.orangeBg)
            case "bad": return ("Lỗi", Theme.redDark, Theme.redBg)
            default: return ("Không rõ", Theme.ink2, Theme.greyBg)
            }
        }()
        return Text(t).font(.system(size: 13, weight: .bold)).foregroundStyle(fg).padding(.horizontal, 10).padding(.vertical, 4).background(bg, in: Capsule())
    }
}

// MARK: - Exit reminder

struct ExitReminderView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var done = false
    @State private var snoozed = false

    var body: some View {
        let ec = model.status?.exitCheck
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Trước khi khóa xe").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.orange)
                Text(title(ec)).font(.system(size: 26, weight: .bold))
                Text("Bạn vừa tắt máy ở \(ec?.location ?? "—"). Hãy nhìn ghế sau rồi xác nhận.").font(.system(size: 16)).foregroundStyle(Theme.ink2)
                VStack(spacing: 0) {
                    ForEach(model.status?.seats ?? []) { s in
                        HStack {
                            Circle().fill(s.occ ? Theme.orange : Theme.muted).frame(width: 10, height: 10)
                            Text(s.label).font(.system(size: 16, weight: .bold))
                            Spacer()
                            Text(s.occ ? "Có thể có người · \(Int(s.conf * 100))%" : "Trống").foregroundStyle(s.occ ? Theme.orange : Theme.ink2)
                        }
                        .padding(.vertical, 12)
                        Divider()
                    }
                }
                .padding(.horizontal, 16).background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                if done {
                    Card(tint: Theme.greenBg, stroke: Theme.green.opacity(0.3)) {
                        Text("Đã ghi nhận.").font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.green)
                        Text("Cabin sẽ được giám sát khi xe khóa. Nếu khóa xe mà vẫn thấy người, bạn nhận cảnh báo ngay.").font(.system(size: 14))
                    }
                }
                if snoozed {
                    Card(tint: Theme.orangeBg, stroke: .clear) { Text("Sẽ nhắc lại sau 1 phút.").font(.system(size: 15, weight: .bold)) }
                }
                Text("Dựa trên cảm biến ghế và camera nên có thể sai hoặc chậm.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if done {
                    Button("Về trang chủ") { dismiss() }.buttonStyle(PrimaryButtonStyle())
                } else {
                    Button("Đã đưa người xuống xe, tôi đã kiểm tra") {
                        Task {
                            if let id = model.selected?.id { _ = await model.perform { try await model.api.exitConfirm(id) } }
                            done = true
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    HStack(spacing: 8) {
                        Button("Nhắc lại sau 1 phút") { snoozed = true }.buttonStyle(SecondaryButtonStyle())
                        if model.status?.canAct == true { NavigationLink(value: Route.camera) { Text("Xem camera") }.buttonStyle(SecondaryButtonStyle()) }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 8).background(Theme.bg)
        }
        .screenBackground().navigationTitle("Nhắc khi rời xe").navigationBarTitleDisplayMode(.inline)
    }

    private func title(_ ec: ExitCheck?) -> String {
        guard let ec, ec.pending, let s = ec.seats.first else { return "Ghế sau trống" }
        if let kid = model.children.first(where: { "rear_\($0.seat)" == s.key }) { return "\(kid.name) còn ở \(s.label.lowercased())?" }
        return "Còn người ở \(s.label.lowercased())?"
    }
}
