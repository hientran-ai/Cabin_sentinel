import CoreLocation
import Observation

/// Phone GPS. Permission is requested only when a feature calls `start()`, never at launch.
@MainActor
@Observable
final class LocationManager: NSObject, @preconcurrency CLLocationManagerDelegate {
    enum Access { case unknown, denied, granted }

    private let manager = CLLocationManager()
    private(set) var access: Access = .unknown
    private(set) var coordinate: CLLocationCoordinate2D?
    private(set) var accuracy: Double?
    private(set) var heading: Double?     // course of travel when moving, else compass heading
    private(set) var updatedAt: Date?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
        apply(manager.authorizationStatus)
    }

    func start() {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
    }

    private func apply(_ s: CLAuthorizationStatus) {
        switch s {
        case .authorizedWhenInUse, .authorizedAlways: access = .granted
        case .denied, .restricted: access = .denied
        default: access = .unknown
        }
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) { apply(m.authorizationStatus) }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let l = locs.last, l.horizontalAccuracy >= 0 else { return }
        coordinate = l.coordinate; accuracy = l.horizontalAccuracy; updatedAt = Date()
        if l.course >= 0, l.speed > 1 { heading = l.course }
    }

    func locationManager(_ m: CLLocationManager, didUpdateHeading h: CLHeading) {
        if h.headingAccuracy >= 0, (accuracy ?? 0) >= 0, heading == nil || (coordinate != nil && h.trueHeading >= 0) { heading = h.trueHeading >= 0 ? h.trueHeading : heading }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        // Transient failures (e.g. no fix yet in the Simulator) keep the last known position.
        if (error as? CLError)?.code == .denied { access = .denied }
    }
}
