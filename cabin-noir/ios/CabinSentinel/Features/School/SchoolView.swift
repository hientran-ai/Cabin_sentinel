import SwiftUI
import MapKit

struct SchoolView: View {
    @Environment(AppModel.self) private var model
    @State private var toast: String?
    @State private var busy = false
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if model.trips.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "figure.and.child.holdinghands").font(.system(size: 48)).foregroundStyle(Theme.muted)
                            Text("Chưa có bé nào").font(.system(size: 22, weight: .bold))
                            Text("Thêm bé, ghế bé ngồi và giờ đưa đón để nhận thông báo khi bé lên và xuống xe.")
                                .multilineTextAlignment(.center).foregroundStyle(Theme.ink2)
                            NavigationLink("Thêm bé", value: "children").buttonStyle(PrimaryButtonStyle())
                        }
                        .padding(.top, 60)
                    }
                    ForEach(model.trips) { TripCard(trip: $0) }
                    if !model.trips.isEmpty {
                        NavigationLink(value: "children") { RowLink(icon: "person.2", title: "Các bé", subtitle: "Tên, lớp, ghế ngồi và giờ đưa đón") }
                        if model.demo, model.status?.role == "owner" { if model.simPaused { SimPausedNotice() } else { demo } }
                    }
                    Text("Thông báo dựa trên camera, cảm biến ghế và vị trí xe, có thể chậm hoặc sai. Ứng dụng không nhận diện khuôn mặt và không lưu ảnh của bé. Khi cần chắc chắn, hãy gọi người đưa đón hoặc nhà trường.")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
                .padding(16)
            }
            .refreshable { await model.tick() }
            .screenBackground()
            .navigationTitle("Đưa đón con")
            .navigationDestination(for: String.self) { $0 == "map" ? AnyView(VehicleMapView()) : AnyView(ChildrenView()) }
            .toast($toast)
        }
    }

    private var demo: some View {
        VStack(alignment: .leading, spacing: 10) {
            DemoBadge(text: "Chế độ dùng thử")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach([("trip_reset", "Bắt đầu lại"), ("trip_boarded", "Bé lên xe"), ("trip_enroute", "Xe chạy"), ("trip_arrived", "Bé xuống xe"),
                         ("trip_late", "Trễ đón"), ("trip_leftin", "Bé còn trong xe")], id: \.0) { s in
                    Button(s.1) {
                        Task {
                            busy = true
                            toast = await model.runScenario(s.0) ?? "Mô phỏng: \(s.1)"
                            busy = false
                        }
                    }
                    .font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.primary).frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .disabled(busy)
                }
            }
        }
        .padding(14)
    }
}

struct TripCard: View {
    let trip: Trip
    @Environment(AppModel.self) private var model

    var body: some View {
        let st = tripStageStyle(trip)
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text(String(trip.child.name.prefix(1))).font(.system(size: 18, weight: .bold)).foregroundStyle(Theme.primary)
                    .frame(width: 44, height: 44).background(Theme.bg, in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(trip.child.name) · \(trip.child.cls.isEmpty ? "Chưa nhập lớp" : trip.child.cls)").font(.system(size: 16, weight: .bold))
                    Text("\(trip.seatLabel) · đón \(trip.pickup), về \(trip.dropoff)").font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(stageKicker).font(.system(size: 12, weight: .bold)).foregroundStyle(st.1)
                Text(st.0).font(.system(size: 21, weight: .bold))
                Text(stageSub).font(.system(size: 15)).foregroundStyle(Theme.ink2)
            }
            TripMapView(trip: trip, route: route, color: st.1)
            if trip.stage == "leftin", model.status?.incident != nil {
                Button("Xem việc cần làm ngay") { model.tab = 0 }.buttonStyle(PrimaryButtonStyle(color: Theme.red))
            }
            if canCheckIn, let next = nextCheckIn {
                Button {
                    Task {
                        let id = trip.vehicleId
                        let r = await model.perform { _ = try await next.action(); return try await model.api.status(id) }
                        // The camera still sees someone in the rear seats: never record "got out" silently.
                        if let r, r.contains("Camera vẫn thấy") { stillDetected = true } else { toast = r }
                    }
                } label: { Text(next.label) }
                .confirmationDialog("Camera vẫn thấy người ở ghế sau", isPresented: $stillDetected, titleVisibility: .visible) {
                    Button("Tôi đã kiểm tra cabin, ghi nhận xuống xe") {
                        Task { toast = await model.perform { _ = try await model.api.dropoff(child: trip.child.id, vehicle: trip.vehicleId, cabinChecked: true); return try await model.api.status(trip.vehicleId) } }
                    }
                    Button("Hủy", role: .cancel) {}
                } message: { Text("Ghi nhận này không đóng cảnh báo đang mở. Chỉ xác nhận sau khi bạn đã nhìn trực tiếp trong xe.") }
                    .buttonStyle(SecondaryButtonStyle())
            }
            if trip.stage == "late" || trip.stage == "leftin" {
                Link(destination: URL(string: "tel:112")!) { Text(trip.stage == "leftin" ? "Gọi 112" : "Gọi người đưa đón") }
                    .buttonStyle(SecondaryButtonStyle(color: Theme.redDark))
            }
            if !trip.log.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(trip.log, id: \.self) { e in
                        HStack(alignment: .top, spacing: 10) {
                            Text(e.time).font(.system(size: 14, weight: .bold).monospacedDigit()).foregroundStyle(Theme.ink2).frame(width: 46, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.system(size: 15, weight: .bold))
                                Text(e.detail).font(.system(size: 14)).foregroundStyle(Theme.muted)
                                Text(e.source).font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.ink2)
                                    .padding(.horizontal, 8).padding(.vertical, 2).background(Theme.bg, in: Capsule())
                            }
                        }
                        .padding(.vertical, 10)
                        Divider()
                    }
                }
            }
        }
        .padding(16)
        .background(st.2, in: RoundedRectangle(cornerRadius: 18))
        .task(id: "\(trip.stage)-\(Int((trip.vehicleCoords?.lat ?? 0) * 2000))-\(Int((trip.vehicleCoords?.lon ?? 0) * 2000))") { await refreshETA() }
            }

    @State private var toast: String?
    @State private var stillDetected = false
    @State private var route: RouteSummary?
    @State private var routedFrom: CLLocationCoordinate2D?

    /// ETA from MapKit, recalculated only after the car moved ~150 m.
    private func refreshETA() async {
        guard trip.stage == "enroute", let v = trip.vehicleCoords, let d = trip.destination else { route = nil; return }
        let from = CLLocationCoordinate2D(latitude: v.lat, longitude: v.lon)
        if let f = routedFrom, route != nil, CLLocation(latitude: f.latitude, longitude: f.longitude).distance(from: CLLocation(latitude: from.latitude, longitude: from.longitude)) < 150 { return }
        if let r = try? await NavigationService.route(from: from, to: CLLocationCoordinate2D(latitude: d.lat, longitude: d.lon)) { route = r; routedFrom = from }
    }

    private var canCheckIn: Bool { model.status?.role != "view" }
    /// Manual check-in for when sensors miss the child; logged as "Ghi nhận thủ công".
    private var nextCheckIn: (label: String, action: () async throws -> Trip)? {
        switch trip.stage {
        case "waiting", "late": return ("Ghi nhận \(trip.child.name) đã lên xe", { try await model.api.pickup(child: trip.child.id, vehicle: trip.vehicleId) })
        case "boarded", "enroute": return ("Ghi nhận \(trip.child.name) đã xuống xe", { try await model.api.dropoff(child: trip.child.id, vehicle: trip.vehicleId) })
        default: return nil
        }
    }

    private var stageKicker: String {
        ["waiting": "Chưa đón", "boarded": "Đã lên xe", "enroute": "Đang trên đường", "arrived": "Đã tới nơi", "late": "Trễ đón", "leftin": "Nghiêm trọng"][trip.stage] ?? ""
    }

    private var stageSub: String {
        switch trip.stage {
        case "waiting": return "Dự kiến đón lúc \(trip.pickup). Bạn sẽ được báo ngay khi bé lên xe."
        case "boarded": return trip.seatLabel + "."
        case "enroute":
            if let r = route { return "Còn khoảng \(max(1, Int((r.eta / 60).rounded()))) phút · \(r.text.split(separator: "·").last.map { $0.trimmingCharacters(in: .whitespaces) } ?? "") tới \(trip.school ?? "trường")." }
            return "Đang trên đường tới \(trip.school ?? "trường"). Chưa có vị trí xe để tính thời gian."
        case "arrived": return "Đã tới \(trip.school ?? "trường")."
        case "late": return "Đã quá giờ đón. Có thể bé đã lên xe khác hoặc camera chưa nhận ra."
        default: return "Xe đã khóa nhưng chưa thấy bé xuống. Kiểm tra xe ngay."
        }
    }
}

struct RouteView: View {
    let progress: Double
    let color: Color
    var showMarker = true
    var from = "Nhà"
    var to = "Trường"

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let path = Path { p in
                p.move(to: CGPoint(x: 24, y: h - 22))
                p.addCurve(to: CGPoint(x: w - 30, y: 22), control1: CGPoint(x: w * 0.4, y: h - 10), control2: CGPoint(x: w * 0.5, y: 10))
            }
            ZStack {
                RoundedRectangle(cornerRadius: 16).fill(Theme.bg)
                path.stroke(Theme.cardLine, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [2, 9]))
                path.trim(from: 0, to: progress).stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                if showMarker {
                    let pt = path.trimmedPath(from: 0, to: max(0.001, progress)).currentPoint ?? CGPoint(x: 24, y: h - 22)
                    Circle().fill(color).overlay(Circle().strokeBorder(.white, lineWidth: 3)).frame(width: 22, height: 22).position(pt)
                }
                Text(from).font(.system(size: 12, weight: .semibold)).position(x: 30, y: h - 8)
                Text(to).font(.system(size: 12, weight: .semibold)).lineLimit(1).frame(width: w * 0.55, alignment: .trailing).position(x: w - 12 - w * 0.275, y: h - 8)
            }
        }
        .animation(.easeInOut, value: progress)
        .accessibilityLabel(showMarker ? "Tiến độ chuyến đi \(Int(progress * 100)) phần trăm" : "Chưa có tiến độ chuyến đi")
    }
}

/// Apple Maps view of the trip: home, school, the vehicle and the remaining route. Tap to open the full map.
struct TripMapView: View {
    let trip: Trip
    let route: RouteSummary?
    let color: Color
    @State private var cam: MapCameraPosition = .automatic

    private func c(_ d: Destination) -> CLLocationCoordinate2D { .init(latitude: d.lat, longitude: d.lon) }
    private var vehicle: CLLocationCoordinate2D? { trip.vehicleCoords.map { .init(latitude: $0.lat, longitude: $0.lon) } }
    private var hasContent: Bool { vehicle != nil || trip.destination != nil || trip.origin != nil }

    var body: some View {
        if hasContent {
            NavigationLink(value: "map") {
                Map(position: $cam, interactionModes: []) {
                    if let o = trip.origin { Marker(o.name, systemImage: "house.fill", coordinate: c(o)).tint(.gray) }
                    if let d = trip.destination { Marker(d.name, systemImage: "graduationcap.fill", coordinate: c(d)).tint(Theme.green) }
                    if let route { MapPolyline(route.polyline).stroke(color, lineWidth: 5) }
                    if let v = vehicle {
                        Annotation("Xe", coordinate: v) {
                            Image(systemName: "car.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                                .frame(width: 32, height: 32).background(color, in: Circle()).overlay(Circle().strokeBorder(.white, lineWidth: 2))
                        }
                    }
                }
                .frame(height: 170).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    Label("Mở bản đồ", systemImage: "arrow.up.right.square").font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 5).background(.regularMaterial, in: Capsule()).padding(8)
                }
                .overlay(Color.clear.contentShape(Rectangle()))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Bản đồ chuyến đi. Mở bản đồ lớn")
            .task(id: "\(trip.stage)-\(Int((trip.vehicleCoords?.lat ?? 0) * 1000))-\(Int((trip.vehicleCoords?.lon ?? 0) * 1000))") { cam = .automatic }
        } else {
            HStack(spacing: 8) {
                Image(systemName: "map")
                Text("Chưa có vị trí xe hoặc điểm đến để hiện bản đồ.").font(.footnote)
            }
            .foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, minHeight: 56).padding(.horizontal, 12)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16).padding(.vertical, 8)
        }
    }
}
