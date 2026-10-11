import SwiftUI
import Combine
import AVFoundation
import Vision
import CoreLocation
import MapKit

struct PreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession
    var rotation: CGFloat? = nil          // set by the in-car screen so the preview turns with the phone
    func makeUIView(context: Context) -> UIView {
        let v = PreviewUIView(); v.layer.videoGravity = .resizeAspectFill
        // Attaching the session commits the capture configuration, and on a Mac that waits on the run loop. Doing it here,
        // inside SwiftUI's own update, lets SwiftUI re-enter itself and abort ("AttributeGraph precondition failure").
        // So attach one turn later, outside the update. A session can drive only one preview layer: never add a second.
        DispatchQueue.main.async { v.layer.session = session; configure(v) }
        return v
    }
    func updateUIView(_ v: UIView, context: Context) { configure(v) }

    private func configure(_ v: UIView) {
        // Detection boxes assume an unmirrored image; a Mac webcam preview is mirrored by default.
        guard let c = (v as? PreviewUIView)?.layer.connection else { return }
        #if !targetEnvironment(macCatalyst)
        if let r = rotation, c.isVideoRotationAngleSupported(r), c.videoRotationAngle != r { c.videoRotationAngle = r }
        #endif
        guard c.isVideoMirroringSupported else { return }
        c.automaticallyAdjustsVideoMirroring = false
        c.isVideoMirrored = false
    }
    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        override var layer: AVCaptureVideoPreviewLayer { super.layer as! AVCaptureVideoPreviewLayer }
    }
}

struct PhoneSensorView: View {
    @Environment(AppModel.self) private var model
    private var sensor: PhoneSensor { model.phone }
        @State private var coverFaces = true
    @State private var toast: String?

    private let seatLabel = ["rear_left": "Ghế sau trái", "rear_mid": "Ghế sau giữa", "rear_right": "Ghế sau phải"]
    private let seatShort = ["rear_left": "Sau trái", "rear_mid": "Sau giữa", "rear_right": "Sau phải"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack { DemoBadge(text: "Điện thoại thay thiết bị Pi5"); Spacer() }
                Text("Điện thoại này đóng vai thiết bị trong xe: nhận diện người, thú cưng và đồ vật chia theo 3 ghế sau, GPS làm vị trí xe. Hình ảnh chỉ xử lý trên máy, không lưu và không gửi đi.")
                    .font(.system(size: 15)).foregroundStyle(Theme.ink2)

                CameraStage(sensor: sensor, coverFaces: coverFaces, placeholder: placeholder)

                DetectionSummary(sensor: sensor, seatLabel: seatLabel)

                TestSessionCard()

                Card {
                    Toggle("Làm mờ mặt trên màn hình", isOn: $coverFaces)
                    Text("Chỉ làm mờ vùng mặt khi hiển thị. Hình không bao giờ được lưu hay gửi đi.").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    Toggle("Điện thoại hướng về ghế sau từ phía trước", isOn: Binding(get: { sensor.mirrored }, set: { sensor.mirrored = $0 }))
                    Text("Bật: bên trái ảnh là ghế sau bên phải của xe. Tắt nếu bạn đặt điện thoại ngược lại.").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    Toggle("Xe đã khóa", isOn: Binding(get: { model.phoneLocked }, set: { model.phoneLocked = $0 }))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Nhiệt độ cabin: \(Int(model.phoneTemp))°C (đặt tay, điện thoại không đo được)").font(.system(size: 14, weight: .semibold))
                        Slider(value: Binding(get: { model.phoneTemp }, set: { model.phoneTemp = $0 }), in: 20...50, step: 1)
                    }
                }

                locationCard

                geofenceCard

                Button(model.phoneStreaming ? "Dừng gửi" : "Bắt đầu gửi dữ liệu") { Task { if model.phoneStreaming { await model.stopPhone() } else { await model.startPhone() } } }
                    .buttonStyle(PrimaryButtonStyle(color: model.phoneStreaming ? Theme.redDark : Theme.primary))
                if let e = model.phoneError { ErrorBanner(message: e) }
                Text("Khi đang gửi, mô phỏng tạm dừng và trang Chủ chỉ hiện đánh giá từ điện thoại này. Việc gửi tiếp tục khi bạn chuyển tab; bấm Dừng gửi để quay lại mô phỏng. Ngừng gửi hơn 2 phút thì ứng dụng báo \"Chưa thể đánh giá\", không bao giờ hiện là an toàn.")
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .screenBackground()
        .navigationTitle("Điện thoại làm camera xe")
        .toast($toast)
        .task { await sensor.start(); await model.refreshNotifAuth() }
        .onDisappear { if !model.phoneStreaming { sensor.stop() } }
    }

    private var placeholder: String {
        switch sensor.cameraState {
        case "denied": return "Chưa được cấp quyền camera. Bật trong Cài đặt › CabinSentinel."
        case "unavailable": return "Máy này không có camera (Simulator). Chạy trên iPhone thật để thử nhận diện."
        default: return "Đang mở camera…"
        }
    }

    @ViewBuilder private var locationCard: some View {
        if let c = sensor.coord {
            VStack(alignment: .leading, spacing: 8) {
                Map(initialPosition: .region(MKCoordinateRegion(center: c, latitudinalMeters: 400, longitudinalMeters: 400))) {
                    Marker("Xe (điện thoại)", systemImage: "car.fill", coordinate: c).tint(Theme.primary)
                }
                .frame(height: 160).clipShape(RoundedRectangle(cornerRadius: 18))
                .accessibilityLabel("Bản đồ vị trí xe")
                Text(String(format: "%.5f, %.5f · sai số khoảng %d m", c.latitude, c.longitude, Int(sensor.accuracy ?? 0)))
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
        } else {
            Text(sensor.locationDenied ? "Chưa được cấp quyền vị trí." : "Đang lấy vị trí…").font(.system(size: 14)).foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder private var geofenceCard: some View {
        let g = model.status?.geofence
        Card {
            Text("Vùng trường học").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2)
            if let g {
                Text("\(g.name) · bán kính \(g.radiusM) m").font(.system(size: 16, weight: .bold))
                Text(model.status?.inGeofence == true ? "Xe đang trong vùng. Hệ thống đã nhắc kiểm tra ghế sau khi tới." : "Khi xe vào vùng, bạn được nhắc kiểm tra ghế sau.")
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
                Button("Xóa vùng") { Task { if let id = model.selected?.id { toast = await model.perform { try await model.api.clearGeofence(id) } } } }
                    .buttonStyle(SecondaryButtonStyle())
            } else {
                Text("Đứng tại cổng trường rồi bấm nút dưới để đánh dấu vị trí này.").font(.system(size: 13)).foregroundStyle(Theme.muted)
                Button("Đặt trường tại vị trí hiện tại") {
                    guard let c = sensor.coord, let id = model.selected?.id else { toast = "Chưa có vị trí điện thoại."; return }
                    let body = APIClient.GeofenceBody(name: "Trường học", lat: c.latitude, lon: c.longitude, radiusM: 150)
                    Task { toast = await model.perform { try await model.api.setGeofence(id, body) } }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }
}

struct CarMapCard: View {
    let coords: Coords
    var body: some View {
        let c = CLLocationCoordinate2D(latitude: coords.lat, longitude: coords.lon)
        VStack(alignment: .leading, spacing: 6) {
            Map(initialPosition: .region(MKCoordinateRegion(center: c, latitudinalMeters: 500, longitudinalMeters: 500)), interactionModes: []) {
                Marker("Xe", systemImage: "car.fill", coordinate: c).tint(Theme.primary)
            }
            .id("\(coords.lat),\(coords.lon)")
            .frame(height: 140).clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(Color.clear.contentShape(Rectangle()))
            HStack { DemoBadge(text: "Mô phỏng · vị trí điện thoại"); Spacer() }
        }
    }
}

/// Separate views so only they re-render when detections change (about 15 times per second),
/// not the whole screen.
struct CameraStage: View {
    let sensor: PhoneSensor
    let coverFaces: Bool
    let placeholder: String
    private let seatShort = ["rear_left": "Sau trái", "rear_mid": "Sau giữa", "rear_right": "Sau phải"]

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18).fill(.black)
            if sensor.cameraState == "running" {
                PreviewLayer(session: sensor.session).clipShape(RoundedRectangle(cornerRadius: 18))
                if coverFaces {
                    // A blur material over each face box: faces are hidden, nothing else is.
                    FaceBlur(faces: sensor.faces).clipShape(RoundedRectangle(cornerRadius: 18)).allowsHitTesting(false)
                }
                DetectionOverlay(sensor: sensor, coverFaces: coverFaces, seatShort: seatShort)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "camera.metering.unknown").font(.system(size: 34))
                    Text(placeholder).multilineTextAlignment(.center).font(.system(size: 15, weight: .semibold))
                }.foregroundStyle(.white).padding(20)
            }
        }
        .aspectRatio(sensor.cameraState == "running" ? sensor.aspect : 3.0 / 4, contentMode: .fit)
        .frame(maxWidth: .infinity)
    }
}

struct DetectionOverlay: View {
    let sensor: PhoneSensor
    let coverFaces: Bool
    let seatShort: [String: String]
    var showBoxes = true

    var body: some View {
        GeometryReader { g in
            ForEach(showBoxes ? sensor.dets : []) { d in
                let known = d.label == "person" || Cabin.pets.contains(d.label)
                RoundedRectangle(cornerRadius: 6).strokeBorder(known ? Theme.red : Theme.blue, lineWidth: 3)
                    .frame(width: d.box.width * g.size.width, height: d.box.height * g.size.height)
                    .overlay(alignment: .topLeading) {
                        Text("\(Cabin.itemNames[d.label] ?? (d.label == "person" ? "Người" : d.label)) \(Int(d.conf * 100))%")
                            .font(.system(size: 11, weight: .bold)).foregroundStyle(.white).padding(2).background(.black.opacity(0.6)).offset(y: -16)
                    }
                    .position(x: d.box.midX * g.size.width, y: d.box.midY * g.size.height)
            }
            HStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { i in
                    let seat = Cabin.seat(forX: (CGFloat(i) + 0.5) / 3, mirrored: sensor.mirrored)
                    Text(seatShort[seat] ?? "").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom).padding(.bottom, 4)
                        .overlay(alignment: .trailing) { if i < 2 { Rectangle().fill(.white.opacity(0.25)).frame(width: 1) } }
                }
            }
        }
    }
}

struct DetectionSummary: View {
    let sensor: PhoneSensor
    let seatLabel: [String: String]

    var body: some View {
        Card {
            HStack {
                Label(sensor.detector.name, systemImage: "cpu").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink2)
                Text("Mặt: \(sensor.faces.count)").font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(Theme.ink2)
                Spacer()
                Text(sensor.cameraState == "running" ? "\(sensor.fps) fps · \(sensor.latencyMs) ms" : "—")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(sensor.fps >= 30 || sensor.cameraState != "running" ? Theme.green : Theme.orange)
            }
            if sensor.seen.isEmpty {
                Text(sensor.cameraState == "running" ? "Chưa thấy người, thú cưng hay đồ vật." : "Chưa có hình.").font(.system(size: 15)).foregroundStyle(Theme.ink2)
            }
            ForEach(sensor.seen.values.sorted { $0.conf > $1.conf }, id: \.self) { o in
                HStack {
                    Text(o.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(o.kind == "item" ? Theme.blue : Theme.red)
                    Text(seatLabel[o.seat] ?? o.seat).font(.system(size: 14)).foregroundStyle(Theme.ink2)
                    if o.kind == "person", o.age != "unknown" {
                        Text(o.age == "child" ? "có thể là trẻ em" : "có thể là người lớn").font(.system(size: 12, weight: .semibold))
                            .padding(.horizontal, 6).padding(.vertical, 2).background(Theme.greyBg, in: Capsule()).foregroundStyle(Theme.ink2)
                    }
                    Spacer()
                    Text("\(Int(o.conf * 100))%").font(.system(size: 15, weight: .bold).monospacedDigit())
                    if o.conf < 0.5 { Text("chưa đủ").font(.system(size: 12)).foregroundStyle(Theme.muted) }
                }
            }
            if sensor.covered { Label("Camera đang bị che", systemImage: "eye.slash").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.redDark) }
            Text("Dưới 50% thì chỉ hiển thị, không gửi lên hệ thống. Trẻ em/người lớn chỉ là gợi ý, không làm giảm mức cảnh báo.").font(.system(size: 12)).foregroundStyle(Theme.muted)
        }
    }
}

/// Hides faces on screen with a blur material over each face box. One preview layer only: a second one for the
/// same session is not supported on a Mac. The frame sent to the detector is never touched.
struct FaceBlur: View {
    let faces: [CGRect]
    var body: some View {
        GeometryReader { g in
            ForEach(Array(faces.enumerated()), id: \.offset) { _, f in
                Ellipse().fill(.ultraThickMaterial)
                    .frame(width: f.width * g.size.width * 1.2, height: f.height * g.size.height * 1.2)
                    .position(x: f.midX * g.size.width, y: f.midY * g.size.height)
            }
        }
    }
}

struct FaceMask: View {
    let faces: [CGRect]
    var body: some View {
        GeometryReader { g in
            ForEach(Array(faces.enumerated()), id: \.offset) { _, f in
                Ellipse()
                    .frame(width: f.width * g.size.width * 1.5, height: f.height * g.size.height * 1.5)
                    .position(x: f.midX * g.size.width, y: f.midY * g.size.height)
            }
        }
    }
}

/// Shown instead of simulator buttons while the phone is the source.
struct SimPausedNotice: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        Card {
            Label("Mô phỏng tạm dừng", systemImage: "pause.circle.fill").font(.system(size: 15, weight: .semibold))
            Text("Đang dùng camera điện thoại làm thiết bị trong xe, nên cảnh báo chỉ phản ánh những gì camera thấy.")
                .font(.system(size: 14)).foregroundStyle(Theme.ink2)
            Button("Dừng camera điện thoại") { Task { await model.stopPhone() } }.buttonStyle(SecondaryButtonStyle())
        }
    }
}

/// Timed test: turn the car off and lock it, keep the camera on for a fixed window, then show proof.
struct TestSessionCard: View {
    @Environment(AppModel.self) private var model
    @State private var minutes = 2
    @State private var now = Date()
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var running: Bool { model.testRun.map { !$0.finished } ?? false }

    var body: some View {
        Card {
            Text("Thử nghiệm có thời hạn").font(.system(size: 17, weight: .semibold))
            if let t = model.testRun {
                if t.finished { report(t) } else { live(t) }
            } else {
                setup
            }
        }
        .onReceive(tick) { now = $0 }
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(model.phoneEngineOn ? "Xe đang chạy" : "Xe đã tắt máy", systemImage: model.phoneEngineOn ? "car.fill" : "car")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Button(model.phoneEngineOn ? "Tắt xe và khóa" : "Nổ máy xe") {
                    if model.phoneEngineOn { model.phoneEngineOn = false; model.phoneLocked = true } else { model.phoneEngineOn = true }
                }.font(.system(size: 15, weight: .semibold)).buttonStyle(.bordered)
            }
            Text("Xe đang chạy thì hệ thống tạm dừng giám sát cabin. Tắt xe và khóa thì camera bắt đầu canh ghế sau.")
                .font(.system(size: 12)).foregroundStyle(Theme.muted)
            Picker("Thời gian bật camera", selection: $minutes) {
                ForEach([1, 2, 5, 10], id: \.self) { Text("\($0) phút").tag($0) }
            }.pickerStyle(.segmented)
            ForEach(model.preflight, id: \.0) { row in
                Label(row.0, systemImage: row.1 ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 14)).foregroundStyle(row.1 ? Theme.green : Theme.red)
            }
            if !model.notifOK {
                HStack {
                    Button(model.notifAuth == .denied ? "Mở cài đặt để bật thông báo" : "Cho phép thông báo") {
                        if model.notifAuth == .denied { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                        else { Task { await model.requestNotifAuth() } }
                    }.buttonStyle(.bordered)
                }
            }
            Button("Gửi thông báo thử") { model.sendTestNotification() }.buttonStyle(.bordered).disabled(!model.notifOK)
            if model.status?.incident != nil {
                Text("Đang có sự cố cũ chưa đóng. Backend sẽ không tạo sự cố mới nên sẽ không có thông báo mới. Mở sự cố và xác nhận đã kiểm tra xe để đóng.")
                    .font(.system(size: 12)).foregroundStyle(Theme.orange)
            }
            let ready = model.preflight.allSatisfy(\.1)
            Button("Bắt đầu thử \(minutes) phút") { Task { await model.startTest(minutes: minutes) } }
                .buttonStyle(PrimaryButtonStyle(enabled: ready)).disabled(!ready)
        }
    }

    private func live(_ t: AppModel.TestRun) -> some View {
        let left = max(0, Int(t.end.timeIntervalSince(now)))
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Đang thử", systemImage: "record.circle").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.red)
                Spacer()
                Text(mmss(left)).font(.system(size: 22, weight: .bold).monospacedDigit())
            }
            ProgressView(value: min(1, now.timeIntervalSince(t.start) / t.duration))
            row("Đã thấy người", t.personFirstAt == nil ? "chưa" : "\(t.personFrames) lần")
            row("Cảnh báo", t.alertAt == nil ? "chưa có" : (t.alertLevel == "critical" ? "Nghiêm trọng" : "Cảnh báo"))
            Text("Hết giờ camera tự tắt. Hãy đứng vào khung hình ở ghế sau.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            Button("Kết thúc sớm") { Task { await model.finishTest() } }.buttonStyle(.bordered)
        }
    }

    private func report(_ t: AppModel.TestRun) -> some View {
        let sawPerson = t.personFirstAt != nil, alerted = t.alertAt != nil
        let pass = sawPerson && alerted && t.notified == true
        return VStack(alignment: .leading, spacing: 8) {
            Label(!sawPerson ? "Chưa thử được: camera không thấy người" : (pass ? "Đạt: có người → có cảnh báo → có thông báo" : "Không đạt"),
                  systemImage: pass ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(pass ? Theme.green : Theme.orange)
            row("Thời gian bật camera", mmss(Int(min(t.duration, Date().timeIntervalSince(t.start)))))
            row("Khung có người", sawPerson ? "\(t.personFrames)/\(t.frames)" : "0")
            row("Cảnh báo trên app", alerted ? (t.alertLevel == "critical" ? "Nghiêm trọng" : "Cảnh báo") : "KHÔNG có")
            row("Độ trễ từ lúc thấy người", t.alertDelay.map { String(format: "%.1f giây", $0) } ?? "—")
            row("Thông báo hệ thống đã hiện", t.notified == nil ? "—" : (t.notified == true ? "Có" : "KHÔNG"))
            if sawPerson && !alerted { Text("Camera thấy người nhưng không có cảnh báo. Kiểm tra: xe đã tắt máy và khóa chưa, độ tin cậy đạt 50% chưa.").font(.system(size: 12)).foregroundStyle(Theme.orange) }
            if alerted && t.notified != true { Text("Có cảnh báo nhưng không thấy thông báo hệ thống. Kiểm tra quyền thông báo và chế độ Không làm phiền.").font(.system(size: 12)).foregroundStyle(Theme.orange) }
            Text("Sự cố vẫn mở cho đến khi bạn xác nhận đã kiểm tra xe.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            Button("Thử lại") { model.dismissTest() }.buttonStyle(.bordered)
        }
    }

    private func row(_ a: String, _ b: String) -> some View {
        HStack { Text(a).font(.system(size: 14)).foregroundStyle(Theme.ink2); Spacer(); Text(b).font(.system(size: 14, weight: .semibold).monospacedDigit()) }
    }
}
