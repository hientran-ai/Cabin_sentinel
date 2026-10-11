import MapKit

struct RouteSummary: Equatable {
    let polyline: MKPolyline
    let distance: CLLocationDistance
    let eta: TimeInterval

    static func == (a: RouteSummary, b: RouteSummary) -> Bool { a.distance == b.distance && a.eta == b.eta }

    var text: String {
        let km = distance >= 1000 ? String(format: "%.1f km", distance / 1000) : "\(Int(distance)) m"
        return "\(max(1, Int((eta / 60).rounded()))) phút · \(km)"
    }
}

enum NavigationService {
    /// Driving route and ETA from MapKit. Throws when there is no network or no route.
    static func route(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) async throws -> RouteSummary {
        let req = MKDirections.Request()
        req.source = MKMapItem(placemark: MKPlacemark(coordinate: a))
        req.destination = MKMapItem(placemark: MKPlacemark(coordinate: b))
        req.transportType = .automobile
        let r = try await MKDirections(request: req).calculate()
        guard let route = r.routes.first else { throw URLError(.resourceUnavailable) }
        return RouteSummary(polyline: route.polyline, distance: route.distance, eta: route.expectedTravelTime)
    }

    /// Hands turn-by-turn guidance to Apple Maps; the app does not build its own.
    static func openMaps(to c: CLLocationCoordinate2D, name: String) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: c))
        item.name = name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}
