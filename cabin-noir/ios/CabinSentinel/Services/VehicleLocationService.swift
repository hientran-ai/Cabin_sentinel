import Foundation
import Observation

/// Live position of the selected vehicle. Prefers the WebSocket; when it is down for more than
/// a few seconds (or the host has no WebSocket support) it falls back to polling GET /location.
@MainActor
@Observable
final class VehicleLocationService {
    private(set) var location: VehicleLocation?
    private(set) var others: [String: VehicleLocation] = [:]
    let socket = WebSocketService()
    private var fallback: Task<Void, Never>?
    private weak var model: AppModel?

    var live: Bool { socket.state == .connected }

    func start(vehicleId: String, model: AppModel) {
        stop()
        self.model = model
        socket.connect({ [weak model] in model?.api.webSocketRequest("/ws/vehicles/\(vehicleId)") }) { [weak self] data in
            guard let f = try? self?.model?.api.decoder.decode(WSFrame.self, from: data), f.type == "vehicle" else { return }
            Task { @MainActor in
                if let l = f.location, l != self?.location { self?.location = l }
                if let s = f.status { self?.model?.apply(status: s) }
            }
        }
        fallback = Task { [weak self] in
            var tick = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard let self, let model = self.model else { return }
                tick += 1
                if !self.live, let l = try? await model.api.location(vehicleId), l != self.location { self.location = l }
                if tick % 2 == 0 { await self.refreshOthers(except: vehicleId, model: model) }
            }
        }
    }

    /// Other vehicles on the account (admin / multi-vehicle), refreshed every few seconds.
    private func refreshOthers(except id: String, model: AppModel) async {
        var next: [String: VehicleLocation] = [:]
        for v in model.vehicles where v.id != id && v.role != "school" {
            if let l = try? await model.api.location(v.id), l.coords != nil { next[v.id] = l }
        }
        if next != others { others = next }
    }

    func stop() {
        socket.disconnect(); fallback?.cancel(); fallback = nil
    }
}
