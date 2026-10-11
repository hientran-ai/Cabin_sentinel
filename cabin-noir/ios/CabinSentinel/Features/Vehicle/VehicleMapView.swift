import SwiftUI
import MapKit

struct VehicleMapView: View {
    @Environment(AppModel.self) private var model
    @State private var live = VehicleLocationService()
    @State private var gps = LocationManager()
    @State private var route: RouteSummary?
    @State private var routeFrom: CLLocationCoordinate2D?
    @State private var routeError = false
    @State private var camera: MapCameraPosition = .automatic
    @State private var followed = false
    @State private var shareGPS = false
    @State private var busy = false
    @State private var toast: String?
    @State private var showDestination = false

    private var vehicle: CLLocationCoordinate2D? { live.location?.coords.map { .init(latitude: $0.lat, longitude: $0.lon) } }
    private var destination: Destination? { live.location?.destination ?? model.status?.route?.dest }
    private var dest2D: CLLocationCoordinate2D? { destination.map { .init(latitude: $0.lat, longitude: $0.lon) } }

    var body: some View {
        Map(position: $camera) {
                UserAnnotation()
                if let v = vehicle {
                    Annotation(model.selected?.vehicle.name ?? "Xe", coordinate: v) {
                        Image(systemName: "car.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 36, height: 36).background(live.location?.stale == true ? Color.gray : Theme.primary, in: Circle())
                            .rotationEffect(.degrees((live.location?.coords?.heading ?? 0) - 0))
                            .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                    }
                }
                if let d = dest2D, let name = destination?.name { Marker(name, systemImage: "graduationcap.fill", coordinate: d).tint(Theme.green) }
                if let g = model.status?.geofence {
                    MapCircle(center: .init(latitude: g.lat, longitude: g.lon), radius: CLLocationDistance(g.radiusM))
                        .foregroundStyle(Theme.green.opacity(0.15)).stroke(Theme.green, lineWidth: 2)
                }
                ForEach(Array(live.others.keys), id: \.self) { id in
                    if let c = live.others[id]?.coords, let name = model.vehicles.first(where: { $0.id == id })?.vehicle.name {
                        Marker(name, systemImage: "car", coordinate: .init(latitude: c.lat, longitude: c.lon)).tint(.gray)
                    }
                }
                if let route { MapPolyline(route.polyline).stroke(Theme.primary, lineWidth: 5) }
            }
        .mapControls { MapUserLocationButton(); MapCompass() }
        .safeAreaInset(edge: .bottom) { panel }
        .navigationTitle("Bản đồ").navigationBarTitleDisplayMode(.inline)
        .toast($toast)
        #if PRODUCTION
        .sheet(isPresented: $showDestination) { NoirDestinationPicker() }
        #endif
        .onAppear {
            gps.start()
            if let id = model.selected?.id { live.start(vehicleId: id, model: model) }
        }
        .onDisappear { gps.stop(); live.stop() }
        .task(id: "\(vehicle?.latitude ?? 0)-\(vehicle?.longitude ?? 0)") { await refreshRoute() }
        .task(id: shareGPS) { await shareLoop() }
        .onChange(of: vehicle?.latitude) { _, _ in
            if !followed, vehicle != nil { followed = true; camera = .automatic }
        }
    }

    // MARK: panel

    private var panel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(model.selected?.vehicle.name ?? "Chưa có xe").font(.system(size: 17, weight: .semibold))
                Spacer()
                statusPill
            }
            if let l = live.location {
                if l.coords == nil {
                    Text("Chưa có vị trí xe. \(model.mode == .demo ? "Bấm “Chạy xe mô phỏng”." : "Bật “Dùng điện thoại này làm vị trí xe”.")")
                        .font(.system(size: 15)).foregroundStyle(Theme.ink2)
                } else {
                    Text(l.stale ? "Vị trí đã cũ. Không dùng để kết luận xe ở đâu." : l.locationName).font(.system(size: 15)).foregroundStyle(l.stale ? Theme.orange : Theme.ink2)
                    if let route { Label(route.text + (destination.map { " tới \($0.name)" } ?? ""), systemImage: "clock").font(.system(size: 15, weight: .medium)) }
                    else if routeError { Label("Chưa tính được lộ trình. Cần mạng để dùng Bản đồ.", systemImage: "wifi.exclamationmark").font(.system(size: 14)).foregroundStyle(Theme.ink2) }
                }
            } else {
                HStack { ProgressView(); Text("Đang lấy vị trí xe…").font(.system(size: 15)).foregroundStyle(Theme.ink2) }
            }
            if gps.access == .denied { Text("Chưa được cấp quyền vị trí. Bật trong Cài đặt › CabinSentinel.").font(.system(size: 13)).foregroundStyle(Theme.orange) }
            #if PRODUCTION
            if model.status?.role == "owner" {
                Button { showDestination = true } label: { Label(model.status?.geofence == nil ? "Đặt điểm đến" : "Đổi điểm đến", systemImage: "mappin.and.ellipse") }
                    .buttonStyle(.bordered).controlSize(.large)
            }
            #endif
            Button { openMaps() } label: { Label("Dẫn đường", systemImage: "location.north.line.fill") }
                .buttonStyle(PrimaryButtonStyle(enabled: vehicle != nil || dest2D != nil)).disabled(vehicle == nil && dest2D == nil)
            controls
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    @ViewBuilder private var controls: some View {
        if model.status?.role == "owner" {
            if model.simPaused {
                SimPausedNotice()
            } else if model.mode == .demo {
                HStack { DemoBadge(text: "Mô phỏng"); Spacer() }
                HStack(spacing: 8) {
                    Button(live.location?.moving == true ? "Dừng xe mô phỏng" : "Chạy xe mô phỏng") {
                        Task { busy = true; toast = await model.runScenario(live.location?.moving == true ? "route_stop" : "route_start"); busy = false }
                    }.buttonStyle(SecondaryButtonStyle()).disabled(busy)
                }
            } else {
                Toggle("Dùng điện thoại này làm vị trí xe", isOn: $shareGPS).font(.system(size: 15))
            }
        }
    }

    private var statusPill: some View {
        let (text, color): (String, Color) = switch live.socket.state {
        case .connected: ("Trực tiếp", Theme.green)
        case .reconnecting, .connecting: ("Đang kết nối lại", Theme.orange)
        case .idle: ("Cập nhật mỗi 3 giây", Theme.ink2)
        }
        return Label(live.live ? text : (live.socket.state == .idle ? text : "Cập nhật mỗi 3 giây"), systemImage: live.live ? "dot.radiowaves.left.and.right" : "arrow.triangle.2.circlepath")
            .font(.system(size: 12, weight: .semibold)).foregroundStyle(live.live ? color : Theme.ink2)
    }

    // MARK: actions

    private func openMaps() {
        if let d = dest2D, let name = destination?.name { NavigationService.openMaps(to: d, name: name) }
        else if let v = vehicle { NavigationService.openMaps(to: v, name: model.selected?.vehicle.name ?? "Xe") }
    }

    /// Recalculate only after the vehicle moved ~150 m, so MKDirections is not hit every second.
    private func refreshRoute() async {
        guard let v = vehicle, let d = dest2D else { route = nil; return }
        if let f = routeFrom, route != nil, CLLocation(latitude: f.latitude, longitude: f.longitude).distance(from: CLLocation(latitude: v.latitude, longitude: v.longitude)) < 150 { return }
        do { route = try await NavigationService.route(from: v, to: d); routeFrom = v; routeError = false }
        catch { if route == nil { routeError = true } }
    }

    private func shareLoop() async {
        guard shareGPS, let id = model.selected?.id else { return }
        while !Task.isCancelled {
            if let c = gps.coordinate {
                _ = try? await model.api.postLocation(.init(vehicleId: id, lat: c.latitude, lon: c.longitude, accuracyM: gps.accuracy, heading: gps.heading))
            }
            try? await Task.sleep(for: .seconds(5))
        }
    }
}
