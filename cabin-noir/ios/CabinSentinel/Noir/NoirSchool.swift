import SwiftUI
import MapKit

/// Đưa đón: one native List section per child. Logic is the same as SchoolView/TripCard.
struct NoirSchool: View {
    @Environment(AppModel.self) private var model
    @State private var toast: String?
    @State private var busy = false
    @State private var path = NavigationPath()
    @State private var showDestination = false

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if model.trips.isEmpty {
                    ContentUnavailableView {
                        Label("Chưa có bé nào", systemImage: "figure.and.child.holdinghands")
                    } description: {
                        Text("Thêm bé, ghế bé ngồi và giờ đưa đón để nhận thông báo khi bé lên và xuống xe.")
                    } actions: {
                        Button("Thêm bé") { path.append("children") }.buttonStyle(NoirProminent())
                    }
                    .listRowBackground(Color.clear)
                }
                ForEach(model.trips) { NoirTripSection(trip: $0, toast: $toast) }
                if !model.trips.isEmpty {
                    Section {
                        NavigationLink(value: "children") { Label("Các bé", systemImage: "person.2") }
                        if model.status?.role == "owner" {
                            Button { showDestination = true } label: {
                                HStack {
                                    Label("Điểm đến", systemImage: "mappin.and.ellipse").foregroundStyle(.primary)
                                    Spacer()
                                    Text(model.status?.geofence?.name ?? "Chưa đặt").foregroundStyle(.secondary)
                                }
                            }
                        }
                        NavigationLink(value: "map") { Label("Theo dõi xe trên bản đồ", systemImage: "map") }
                    } footer: {
                        Text("Điểm đến dùng để tính xe đã tới trường chưa. Chuyến tự chuyển giai đoạn theo camera và vị trí của thiết bị trong xe.")
                    }
                    if model.demo, model.status?.role == "owner" {
                        Section {
                            if model.simPaused { SimPausedNotice() } else { demo }
                        } header: { Text("Chế độ dùng thử") }
                    }
                }
                Section {} footer: {
                    Text("Thông báo dựa trên camera, cảm biến ghế và vị trí xe, có thể chậm hoặc sai. Ứng dụng không nhận diện khuôn mặt và không lưu ảnh của bé. Khi cần chắc chắn, hãy gọi người đưa đón hoặc nhà trường.")
                }
            }
            .noirList()
            .refreshable { await model.tick() }
            .navigationTitle("Đưa đón")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { path.append("children") } label: { Image(systemName: "person.2") }.accessibilityLabel("Các bé")
                }
            }
            .navigationDestination(for: String.self) { $0 == "map" ? AnyView(VehicleMapView()) : AnyView(ChildrenView()) }
            .toast($toast)
            .sheet(isPresented: $showDestination) { NoirDestinationPicker() }
        }
    }

    private var demo: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach([("trip_reset", "Bắt đầu lại"), ("trip_boarded", "Bé lên xe"), ("trip_enroute", "Xe chạy"), ("trip_arrived", "Bé xuống xe"),
                     ("trip_late", "Trễ đón"), ("trip_leftin", "Bé còn trong xe")], id: \.0) { s in
                Button(s.1) {
                    Task { busy = true; toast = await model.runScenario(s.0) ?? "Mô phỏng: \(s.1)"; busy = false }
                }
                .buttonStyle(.bordered).frame(maxWidth: .infinity).disabled(busy)
            }
        }
    }
}

struct NoirTripSection: View {
    let trip: Trip
    @Binding var toast: String?
    @Environment(AppModel.self) private var model
    @State private var stillDetected = false
    @State private var route: RouteSummary?
    @State private var routedFrom: CLLocationCoordinate2D?

    private var style: (String, Color, Color) { tripStageStyle(trip) }

    var body: some View {
        Section {
            HStack(spacing: 12) {
                Text(String(trip.child.name.prefix(1))).font(.headline).foregroundStyle(Noir.accent)
                    .frame(width: 44, height: 44).background(.quaternary, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(trip.child.name) · \(trip.child.cls.isEmpty ? "Chưa nhập lớp" : trip.child.cls)").font(.headline)
                    Text("\(trip.seatLabel) · đón \(trip.pickup), về \(trip.dropoff)").font(.footnote).foregroundStyle(.secondary)
                }
            }
            NoirStatusBlock(symbol: symbol, color: style.1, kicker: kicker, title: style.0, detail: sub)
                .padding(.vertical, 6)
            TripMapView(trip: trip, route: route, color: style.1)
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
            if trip.stage == "leftin", model.status?.incident != nil {
                Button { model.tab = 0 } label: { Label("Xem việc cần làm ngay", systemImage: "exclamationmark.bubble.fill").frame(maxWidth: .infinity) }
                    .buttonStyle(NoirProminent(tint: Theme.red)).controlSize(.large)
            }
            if canCheckIn, let next = nextCheckIn {
                Button {
                    Task {
                        let id = trip.vehicleId
                        let r = await model.perform { _ = try await next.action(); return try await model.api.status(id) }
                        // The camera still sees someone in the rear seats: never record "got out" silently.
                        if let r, r.contains("Camera vẫn thấy") { stillDetected = true } else { toast = r }
                    }
                } label: { Label(next.label, systemImage: "checkmark.circle") }
                .confirmationDialog("Camera vẫn thấy người ở ghế sau", isPresented: $stillDetected, titleVisibility: .visible) {
                    Button("Tôi đã kiểm tra cabin, ghi nhận xuống xe") {
                        Task { toast = await model.perform { _ = try await model.api.dropoff(child: trip.child.id, vehicle: trip.vehicleId, cabinChecked: true); return try await model.api.status(trip.vehicleId) } }
                    }
                    Button("Hủy", role: .cancel) {}
                } message: { Text("Ghi nhận này không đóng cảnh báo đang mở. Chỉ xác nhận sau khi bạn đã nhìn trực tiếp trong xe.") }
            }
            if trip.stage == "late" || trip.stage == "leftin" {
                Link(destination: URL(string: "tel:112")!) { Label(trip.stage == "leftin" ? "Gọi 112" : "Gọi người đưa đón", systemImage: "phone.fill") }
                    .foregroundStyle(Theme.red)
            }
        } footer: {}
        .task(id: "\(trip.stage)-\(Int((trip.vehicleCoords?.lat ?? 0) * 2000))-\(Int((trip.vehicleCoords?.lon ?? 0) * 2000))") { await refreshETA() }

        if !trip.log.isEmpty {
            Section("Diễn biến · \(trip.child.name)") {
                ForEach(trip.log, id: \.self) { e in
                    HStack(alignment: .top, spacing: 12) {
                        Text(e.time).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 48, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.title).font(.body)
                            Text(e.detail).font(.footnote).foregroundStyle(.secondary)
                            Text(e.source).font(.caption2.bold()).foregroundStyle(.secondary)
                                .padding(.horizontal, 8).padding(.vertical, 2).background(.quaternary, in: Capsule())
                        }
                    }
                }
            }
        }
    }

    private var symbol: String {
        ["waiting": "hourglass", "boarded": "person.fill.checkmark", "enroute": "car.side.fill", "arrived": "checkmark.circle.fill",
         "late": "clock.badge.exclamationmark", "leftin": "exclamationmark.triangle.fill"][trip.stage] ?? "questionmark.circle"
    }

    private var kicker: String {
        ["waiting": "Chưa đón", "boarded": "Đã lên xe", "enroute": "Đang trên đường", "arrived": "Đã tới nơi", "late": "Trễ đón", "leftin": "Nghiêm trọng"][trip.stage] ?? ""
    }

    private var sub: String {
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

    /// ETA from MapKit, recalculated only after the car moved ~150 m.
    private func refreshETA() async {
        guard trip.stage == "enroute", let v = trip.vehicleCoords, let d = trip.destination else { route = nil; return }
        let from = CLLocationCoordinate2D(latitude: v.lat, longitude: v.lon)
        if let f = routedFrom, route != nil, CLLocation(latitude: f.latitude, longitude: f.longitude).distance(from: CLLocation(latitude: from.latitude, longitude: from.longitude)) < 150 { return }
        if let r = try? await NavigationService.route(from: from, to: CLLocationCoordinate2D(latitude: d.lat, longitude: d.lon)) { route = r; routedFrom = from }
    }

    private var canCheckIn: Bool { model.status?.role != "view" }
    private var nextCheckIn: (label: String, action: () async throws -> Trip)? {
        switch trip.stage {
        case "waiting", "late": return ("Ghi nhận \(trip.child.name) đã lên xe", { try await model.api.pickup(child: trip.child.id, vehicle: trip.vehicleId) })
        case "boarded", "enroute": return ("Ghi nhận \(trip.child.name) đã xuống xe", { try await model.api.dropoff(child: trip.child.id, vehicle: trip.vehicleId) })
        default: return nil
        }
    }
}
