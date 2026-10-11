import SwiftUI

/// Phone camera acting as the in-car device, almost full screen. Detection boxes and the face blur are drawn over the
/// feed; every control is a small Liquid Glass element so most of the picture stays visible.
struct NoirCamera: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var coverFaces = true
    @State private var showDetails = false
    private var sensor: PhoneSensor { model.phone }

    private let seatShort = ["rear_left": "Sau trái", "rear_mid": "Sau giữa", "rear_right": "Sau phải"]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            feed
        }
        .overlay(alignment: .top) { topBar }
        .overlay(alignment: .bottom) { bottom }
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .statusBarHidden(false)
        .task { await sensor.start(); await model.refreshNotifAuth() }
        .onDisappear { if !model.phoneStreaming { sensor.stop() } }
        .sheet(isPresented: $showDetails) {
            NavigationStack {
                PhoneSensorView()
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { showDetails = false } } }
            }
            .presentationDetents([.large])
        }
    }

    // MARK: feed and its states

    @ViewBuilder private var feed: some View {
        switch sensor.cameraState {
        case "running":
            ZStack {
                PreviewLayer(session: sensor.session)
                if coverFaces {
                    FaceBlur(faces: sensor.faces).allowsHitTesting(false)
                }
                DetectionOverlay(sensor: sensor, coverFaces: coverFaces, seatShort: seatShort)
            }
            .aspectRatio(sensor.aspect, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case "denied":
            ContentUnavailableView {
                Label("Chưa cấp quyền camera", systemImage: "camera.fill")
            } description: {
                Text("CabinSentinel chỉ dùng camera để nhận diện người, thú cưng ở ghế sau. Hình ảnh xử lý trên máy, không lưu.")
            } actions: {
                Button("Mở Cài đặt") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                    .buttonStyle(NoirProminent())
            }
            .environment(\.colorScheme, .dark)
        case "unavailable":
            ContentUnavailableView("Không có camera", systemImage: "camera.metering.unknown",
                                   description: Text("Máy này không có camera (Simulator). Chạy trên iPhone hoặc Mac có camera để thử nhận diện."))
        default:
            ProgressView("Đang mở camera…").tint(.white).foregroundStyle(.white)
        }
    }

    // MARK: top

    private var topBar: some View {
        HStack(alignment: .center) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.backward").font(.headline).frame(width: 44, height: 44).noirGlass(in: Circle(), interactive: true)
            }
            .accessibilityLabel("Quay lại")
            Spacer()
            statusPill
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .foregroundStyle(.white).padding(.horizontal, 16).padding(.top, 4)
    }

    private var statusPill: some View {
        let live = model.phoneStreaming
        return HStack(spacing: 8) {
            Image(systemName: live ? "dot.radiowaves.left.and.right" : "pause.circle")
                .symbolEffect(.variableColor.iterative, isActive: live)
                .foregroundStyle(live ? Theme.green : .secondary)
            Text(live ? "Đang gửi · \(sensor.fps) fps" : "Chưa gửi dữ liệu").font(.footnote.weight(.semibold).monospacedDigit())
        }
        .padding(.horizontal, 14).frame(height: 44).noirGlass(in: Capsule())
        .animation(.smooth, value: live)
        .accessibilityElement(children: .combine)
    }

    // MARK: bottom

    private var bottom: some View {
        VStack(spacing: 14) {
            if let line = seenLine {
                Label(line.0, systemImage: line.1).font(.callout.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10).noirGlass(in: Capsule())
                    .transition(.scale(scale: 0.95).combined(with: .opacity))
            }
            NoirGlassGroup(spacing: 16) {
                HStack(spacing: 16) {
                    toggle("eye.slash", on: coverFaces, label: "Làm mờ mặt") { coverFaces.toggle() }
                    send
                    toggle("arrow.left.and.right", on: sensor.mirrored, label: "Đảo trái phải") { sensor.mirrored.toggle() }
                    Button { showDetails = true } label: {
                        Image(systemName: "slider.horizontal.3").font(.title3).frame(width: 52, height: 52).noirGlass(in: Circle(), interactive: true)
                    }
                    .accessibilityLabel("Chi tiết và thử nghiệm")
                }
            }
            .foregroundStyle(.white)
        }
        .padding(.bottom, 16)
        .animation(.smooth, value: seenLine?.0)
    }

    private var send: some View {
        Button {
            Task { if model.phoneStreaming { await model.stopPhone() } else { await model.startPhone() } }
        } label: {
            Image(systemName: model.phoneStreaming ? "stop.fill" : "play.fill").font(.title2)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 68, height: 68)
                .noirGlass(in: Circle(), interactive: true)
                .overlay(Circle().strokeBorder(model.phoneStreaming ? Theme.red : Noir.accent, lineWidth: 2))
        }
        .accessibilityLabel(model.phoneStreaming ? "Dừng gửi" : "Bắt đầu gửi dữ liệu")
        .sensoryFeedback(.impact(weight: .medium), trigger: model.phoneStreaming)
    }

    private func toggle(_ icon: String, on: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.title3).foregroundStyle(on ? Noir.accent : .white)
                .frame(width: 52, height: 52).noirGlass(in: Circle(), interactive: true)
        }
        .accessibilityLabel(label).accessibilityValue(on ? "Bật" : "Tắt")
        .sensoryFeedback(.selection, trigger: on)
    }

    /// Strongest current detection, or nothing, so the picture stays clear.
    private var seenLine: (String, String)? {
        guard sensor.cameraState == "running" else { return nil }
        if sensor.covered { return ("Camera đang bị che", "eye.slash") }
        guard let o = sensor.seen.values.filter({ $0.conf >= 0.5 }).max(by: { $0.conf < $1.conf }) else { return ("Chưa thấy người hay thú cưng", "checkmark.circle") }
        let seat = ["rear_left": "ghế sau trái", "rear_mid": "ghế sau giữa", "rear_right": "ghế sau phải"][o.seat] ?? o.seat
        return ("\(o.name) · \(seat) · \(Int(o.conf * 100))%", o.kind == "person" ? "person.fill" : "pawprint.fill")
    }
}
