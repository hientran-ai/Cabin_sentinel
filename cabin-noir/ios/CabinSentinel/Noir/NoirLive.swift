import SwiftUI

// MARK: - Live view for someone handling an incident

/// What the in-car sensor sees right now, drawn as labelled boxes and refreshed every 2 seconds while the screen is open.
/// The camera picture itself stays on the in-car device; the server only has positions, labels and confidences.
struct NoirLiveCard: View {
    let vehicleId: String
    @Environment(AppModel.self) private var model
    @State private var snap: LiveSnapshot?
    @State private var error: String?

    private var stale: Bool { snap == nil || snap?.available == false || (snap?.ageS ?? 0) > 8 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Xem trực tiếp", systemImage: "video.fill").font(.headline)
                Spacer()
                Text(statusText).font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(statusColor.opacity(0.22), in: Capsule()).foregroundStyle(statusColor)
            }
            if let message {
                Label(message, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(Theme.red)
            }
            LiveBoxes(snap: snap, dim: stale)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityElement().accessibilityLabel(a11y)
            ForEach(lines, id: \.self) { Text($0).font(.footnote).foregroundStyle(.secondary) }
            if let n = snap?.note {
                Text("\(n) Nguồn: \(basisLabel(snap?.basis ?? "unknown")).").font(.caption).foregroundStyle(.secondary)
            }
        }
        .task(id: vehicleId) {
            while !Task.isCancelled {
                do { snap = try await model.api.live(vehicleId); error = nil }
                catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    private var statusText: String {
        if error != nil { return "Mất kết nối" }
        guard let s = snap else { return "Đang tải" }
        guard s.available else { return "Không có hình" }
        return stale ? "Hình cũ" : "Trực tiếp"
    }
    private var statusColor: Color { error != nil ? Theme.red : (snap == nil ? .gray : (stale ? .orange : Theme.green)) }
    private var message: String? {
        if let error { return error }
        if let s = snap, !s.available { return s.message }
        if stale, snap != nil { return "Hình này đã cũ. Không dùng nó để kết luận xe trống." }
        return nil
    }
    private var lines: [String] {
        guard let s = snap, s.available else { return [] }
        var out = (s.detections ?? []).map { "\($0.label): \($0.kind == "pet" ? "Thú cưng" : "Người") \(Int($0.conf * 100))%\($0.age == "child" ? " (có thể là trẻ em)" : "")" }
        out += (s.items ?? []).map { "Đồ vật: \($0.name) \(Int($0.conf * 100))%" }
        return out.isEmpty ? ["Chưa thấy người, thú cưng hay đồ vật."] : out
    }
    private var a11y: String {
        guard let s = snap, s.available else { return "Không có hình trực tiếp" }
        return "Hình vẽ từ nhận diện: \(lines.joined(separator: ", "))"
    }
}

private struct LiveBoxes: View {
    let snap: LiveSnapshot?
    let dim: Bool

    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(white: 0.05)))
            for i in 1..<4 {
                var v = Path(); v.move(to: CGPoint(x: size.width * CGFloat(i) / 4, y: 0)); v.addLine(to: CGPoint(x: size.width * CGFloat(i) / 4, y: size.height))
                var h = Path(); h.move(to: CGPoint(x: 0, y: size.height * CGFloat(i) / 4)); h.addLine(to: CGPoint(x: size.width, y: size.height * CGFloat(i) / 4))
                ctx.stroke(v, with: .color(.white.opacity(0.06)), lineWidth: 1); ctx.stroke(h, with: .color(.white.opacity(0.06)), lineWidth: 1)
            }
            guard let s = snap, s.available else {
                ctx.draw(Text(s_reason).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.55)), at: CGPoint(x: size.width / 2, y: size.height / 2))
                return
            }
            var boxes: [(CGRect, Color, String)] = []
            for d in s.detections ?? [] {
                if let b = d.box, b.count == 4 {
                    boxes.append((rect(b, size), d.kind == "pet" ? .orange : Theme.red, "\(d.label) · \(d.kind == "pet" ? "Thú cưng" : "Người") \(Int(d.conf * 100))%"))
                }
            }
            for i in s.items ?? [] {
                if let b = i.box, b.count == 4 { boxes.append((rect(b, size), Noir.accent, "\(i.name) \(Int(i.conf * 100))%")) }
            }
            ctx.opacity = dim ? 0.35 : 1
            for (r, color, text) in boxes {
                ctx.stroke(Path(roundedRect: r, cornerRadius: 4), with: .color(color), lineWidth: 2.5)
                let label = ctx.resolve(Text(text).font(.system(size: 11, weight: .bold)).foregroundStyle(.black))
                let sz = label.measure(in: CGSize(width: 300, height: 30))
                let tag = CGRect(x: r.minX, y: max(0, r.minY - sz.height - 4), width: sz.width + 8, height: sz.height + 4)
                ctx.fill(Path(tag), with: .color(color))
                ctx.draw(label, at: CGPoint(x: tag.minX + 4, y: tag.minY + 2), anchor: .topLeading)
            }
            if boxes.isEmpty {
                let has = !(s.detections ?? []).isEmpty || !(s.items ?? []).isEmpty
                ctx.draw(Text(has ? "Thiết bị không gửi vị trí, xem danh sách bên dưới" : "Không phát hiện gì. Điều này không có nghĩa là xe trống")
                    .font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.55)), at: CGPoint(x: size.width / 2, y: size.height / 2))
            }
        }
    }

    private var s_reason: String { snap?.reason == "blocked" ? "Camera đang bị che" : "Không có hình mới" }
    private func rect(_ b: [Double], _ size: CGSize) -> CGRect { CGRect(x: b[0] * size.width, y: b[1] * size.height, width: b[2] * size.width, height: b[3] * size.height) }
}

// MARK: - Self-check with the phone camera

/// The person standing at the car points the phone into the cabin and sees what the detector finds. Everything runs on the phone:
/// nothing is sent. Keeping a photo in the vehicle log is a separate, explicit step with its own preview.
struct NoirSelfCheck: View {
    var onKeepPhoto: () -> Void
    @Environment(AppModel.self) private var model
    private var sensor: PhoneSensor { model.phone }
    private let seatShort = ["rear_left": "Sau trái", "rear_mid": "Sau giữa", "rear_right": "Sau phải"]

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                feed
            }
            .frame(maxHeight: .infinity)
            panel
        }
        .navigationTitle("Tự kiểm tra cabin").navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .task { sensor.mirrored = false; await sensor.start() }
        .onDisappear { if !model.phoneStreaming { sensor.stop() } }
    }

    @ViewBuilder private var feed: some View {
        switch sensor.cameraState {
        case "running":
            ZStack {
                PreviewLayer(session: sensor.session)
                DetectionOverlay(sensor: sensor, coverFaces: false, seatShort: seatShort)
            }
            .aspectRatio(sensor.aspect, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case "denied":
            ContentUnavailableView {
                Label("Chưa cấp quyền camera", systemImage: "camera.fill")
            } description: {
                Text("Camera chỉ dùng để nhận diện ngay trên máy. Hình ảnh không được gửi đi.")
            } actions: {
                Button("Mở Cài đặt") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }.buttonStyle(NoirProminent())
            }
            .environment(\.colorScheme, .dark)
        case "unavailable":
            ContentUnavailableView("Không có camera", systemImage: "camera.metering.unknown",
                                   description: Text("Máy này không có camera (Simulator). Chạy trên iPhone để thử."))
        default:
            ProgressView("Đang mở camera…").tint(.white).foregroundStyle(.white)
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(summary, systemImage: icon).font(.headline).foregroundStyle(tone)
            Text("Nhận diện chạy trên máy này, không gửi ảnh đi. Không thấy gì không có nghĩa là xe trống: luôn tự nhìn lại ghế, sàn xe và cốp.")
                .font(.footnote).foregroundStyle(.secondary)
            Button { sensor.stop(); onKeepPhoto() } label: { Label("Giữ ảnh vào nhật ký xe", systemImage: "square.and.arrow.down").frame(maxWidth: .infinity) }
                .buttonStyle(.bordered).controlSize(.large)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(.bar)
    }

    private var found: (people: Int, pets: Int, items: [String]) {
        let v = sensor.seen.values.filter { $0.conf >= 0.5 }
        return (v.filter { $0.kind == "person" }.count, v.filter { $0.kind == "pet" }.count, v.filter { $0.kind == "item" }.map(\.name))
    }
    private var summary: String {
        if sensor.cameraState != "running" { return "Chưa có hình" }
        if sensor.covered { return "Camera bị che hoặc quá tối. Chưa thể kiểm tra" }
        let f = found
        if f.people + f.pets + f.items.count == 0 { return "Không thấy gì trong khung này" }
        return [f.people > 0 ? "\(f.people) người" : nil, f.pets > 0 ? "\(f.pets) thú cưng" : nil, f.items.isEmpty ? nil : "đồ vật: \(f.items.joined(separator: ", "))"]
            .compactMap { $0 }.joined(separator: " · ")
    }
    private var icon: String { sensor.covered ? "eye.slash" : (found.people + found.pets > 0 ? "exclamationmark.triangle.fill" : "magnifyingglass") }
    private var tone: Color { found.people + found.pets > 0 ? Theme.red : (sensor.covered ? .orange : .primary) }
}
