import Foundation
import Observation

/// One realtime channel with automatic reconnect (1, 2, 4, 8, then 15 s) and a dead-link watchdog:
/// the server sends a frame at least every 15 s, so silence for 30 s means the link is stale.
@MainActor
@Observable
final class WebSocketService {
    enum State { case idle, connecting, connected, reconnecting }

    private(set) var state: State = .idle
    private var task: URLSessionWebSocketTask?
    private var runner: Task<Void, Never>?
    private let session = URLSession(configuration: .default)

    func connect(_ makeRequest: @escaping () -> URLRequest?, onFrame: @escaping (Data) -> Void) {
        disconnect()
        runner = Task { [weak self] in
            var delay = 1.0
            while !Task.isCancelled {
                guard let self, let req = makeRequest() else { return }
                self.state = delay == 1.0 ? .connecting : .reconnecting
                let t = self.session.webSocketTask(with: req)
                self.task = t
                t.resume()
                do {
                    while !Task.isCancelled {
                        let msg = try await Self.receive(t, timeout: 30)
                        if self.state != .connected { self.state = .connected }
                        delay = 1.0
                        if case .string(let s) = msg { onFrame(Data(s.utf8)) } else if case .data(let d) = msg { onFrame(d) }
                    }
                } catch {
                    t.cancel(with: .goingAway, reason: nil)
                }
                if Task.isCancelled { return }
                self.state = .reconnecting
                try? await Task.sleep(for: .seconds(delay))
                delay = min(delay * 2, 15)
            }
        }
    }

    func disconnect() {
        runner?.cancel(); runner = nil
        task?.cancel(with: .goingAway, reason: nil); task = nil
        state = .idle
    }

    private static func receive(_ t: URLSessionWebSocketTask, timeout: Double) async throws -> URLSessionWebSocketTask.Message {
        try await withThrowingTaskGroup(of: URLSessionWebSocketTask.Message.self) { g in
            g.addTask { try await t.receive() }
            g.addTask { try await Task.sleep(for: .seconds(timeout)); throw URLError(.timedOut) }
            defer { g.cancelAll() }
            return try await g.next()!
        }
    }
}
