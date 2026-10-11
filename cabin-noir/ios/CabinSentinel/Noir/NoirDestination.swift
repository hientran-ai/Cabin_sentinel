import SwiftUI
import MapKit

/// Place search for the destination (school, home…). Apple MapKit: no key, no billing, works offline of any account.
/// Wrapped so another provider (Goong, Google) can replace it without touching the screens.
@MainActor
@Observable
final class PlaceSearch: NSObject, MKLocalSearchCompleterDelegate {
    var query = "" { didSet { query.trimmingCharacters(in: .whitespaces).isEmpty ? (suggestions = []) : (completer.queryFragment = query) } }
    private(set) var suggestions: [MKLocalSearchCompletion] = []
    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.address, .pointOfInterest]
        // Vietnam, so a school name is looked up here first.
        completer.region = MKCoordinateRegion(center: .init(latitude: 16.0, longitude: 107.0), span: .init(latitudeDelta: 14, longitudeDelta: 8))
    }

    func bias(to c: CLLocationCoordinate2D) {
        completer.region = MKCoordinateRegion(center: c, latitudinalMeters: 60_000, longitudinalMeters: 60_000)
    }

    nonisolated func completerDidUpdateResults(_ c: MKLocalSearchCompleter) {
        let r = c.results
        Task { @MainActor in self.suggestions = r }
    }

    func resolve(_ s: MKLocalSearchCompletion) async -> MKMapItem? {
        try? await MKLocalSearch(request: .init(completion: s)).start().mapItems.first
    }
}

/// Pick where the car is heading. Saved as the vehicle's destination zone: arrival, the trip stages and the
/// "still in the car after arriving" check all use it.
struct NoirDestinationPicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var search = PlaceSearch()
    @State private var gps = LocationManager()
    @State private var chosen: (name: String, coord: CLLocationCoordinate2D)?
    @State private var name = ""
    @State private var radius = 150
    @State private var busy = false
    @State private var error: String?

    private var current: Geofence? { model.status?.geofence }
    private let radii = [100, 150, 250, 400]

    var body: some View {
        NavigationStack {
            List {
                if let chosen {
                    Section {
                        Map(initialPosition: .region(MKCoordinateRegion(center: chosen.coord, latitudinalMeters: Double(radius) * 6, longitudinalMeters: Double(radius) * 6)), interactionModes: []) {
                            Marker(name.isEmpty ? chosen.name : name, systemImage: "graduationcap.fill", coordinate: chosen.coord).tint(Noir.accent)
                            MapCircle(center: chosen.coord, radius: CLLocationDistance(radius)).foregroundStyle(Noir.accent.opacity(0.18)).stroke(Noir.accent, lineWidth: 2)
                        }
                        .id("\(chosen.coord.latitude),\(chosen.coord.longitude),\(radius)")
                        .frame(height: 200).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .listRowInsets(.init()).listRowBackground(Color.clear)
                    }
                    Section("Tên điểm đến") { TextField("Ví dụ: Trường Tiểu học A", text: $name) }
                    Section {
                        Picker("Bán kính", selection: $radius) { ForEach(radii, id: \.self) { Text("\($0) m").tag($0) } }.pickerStyle(.segmented)
                    } header: { Text("Vùng tính là đã tới") } footer: {
                        Text("Xe đỗ trong vùng này thì chuyến được ghi nhận là đã tới điểm đến. Vùng nhỏ chính xác hơn nhưng GPS có thể sai vài chục mét.")
                    }
                    if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Theme.red) } }
                    Section {
                        Button { Task { await save() } } label: { Group { if busy { ProgressView() } else { Text("Đặt làm điểm đến") } }.frame(maxWidth: .infinity) }
                            .buttonStyle(NoirProminent()).controlSize(.large).disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                            .listRowBackground(Color.clear)
                    }
                } else {
                    if let g = current {
                        Section("Điểm đến hiện tại") {
                            Label("\(g.name) · \(g.radiusM) m", systemImage: "mappin.and.ellipse")
                            Button("Xóa điểm đến", role: .destructive) { Task { await clear() } }
                        }
                    }
                    Section {
                        if let c = gps.coordinate {
                            Button { pick("Vị trí hiện tại", c) } label: { Label("Dùng vị trí điện thoại này", systemImage: "location.fill") }
                        }
                        ForEach(search.suggestions.indices, id: \.self) { i in
                            let s = search.suggestions[i]
                            Button { Task { await choose(s) } } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.title).foregroundStyle(.primary)
                                    if !s.subtitle.isEmpty { Text(s.subtitle).font(.footnote).foregroundStyle(.secondary) }
                                }
                            }
                        }
                    } header: { Text("Tìm địa điểm") } footer: {
                        if search.query.isEmpty { Text("Gõ tên trường hoặc địa chỉ. Dữ liệu địa điểm từ Apple Maps.") }
                        else if search.suggestions.isEmpty { Text("Chưa có kết quả. Thử gõ thêm tên đường hoặc quận.") }
                    }
                }
            }
            .noirList().navigationTitle("Điểm đến").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search.query, prompt: "Tên trường hoặc địa chỉ")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(chosen == nil ? "Đóng" : "Tìm lại") { if chosen == nil { dismiss() } else { chosen = nil } } }
            }
            .onAppear { gps.start() }
            .onChange(of: gps.coordinate?.latitude) { if let c = gps.coordinate { search.bias(to: c) } }
        }
        .presentationDetents([.large])
    }

    private func choose(_ s: MKLocalSearchCompletion) async {
        guard let item = await search.resolve(s) else { error = "Không lấy được vị trí này. Thử địa điểm khác."; return }
        pick(item.name ?? s.title, item.placemark.coordinate)
    }

    private func pick(_ n: String, _ c: CLLocationCoordinate2D) {
        chosen = (n, c); name = String(n.prefix(40)); error = nil
    }

    private func save() async {
        guard let chosen, let id = model.selected?.id else { return }
        busy = true; defer { busy = false }
        let body = APIClient.GeofenceBody(name: String(name.trimmingCharacters(in: .whitespaces).prefix(40)), lat: chosen.coord.latitude, lon: chosen.coord.longitude, radiusM: radius)
        if let e = await model.perform({ try await model.api.setGeofence(id, body) }) { error = e } else { dismiss() }
    }

    private func clear() async {
        guard let id = model.selected?.id else { return }
        _ = await model.perform { try await model.api.clearGeofence(id) }
    }
}
