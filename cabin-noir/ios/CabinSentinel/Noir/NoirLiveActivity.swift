import Foundation
#if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
import ActivityKit

/// Starts, updates and ends the Live Activities (lock screen and Dynamic Island).
/// Local updates only: the activity refreshes while the app is running. Remote updates need APNs, which this build does not have.
/// Rules kept from the rest of the app: stale or missing data is shown as unknown, never as safe; an age hint never lowers a level.
@MainActor final class LiveActivityCenter {
    static let shared = LiveActivityCenter()
    private var staleAfter: TimeInterval { 90 }

    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func observe(status: VehicleStatus?, trips: [Trip], demo: Bool, lastUpdated: Date?) {
        guard enabled else { return }
        if let status { exitCheck(status, demo: demo, at: lastUpdated ?? Date()) }
        for t in trips { schoolTrip(t, vehicle: status?.vehicle.name ?? "Xe", demo: demo, at: lastUpdated ?? Date()) }
    }

    func endAll() {
        for a in Activity<CabinActivityAttributes>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } }
    }

    // MARK: Exit check ("Xuống xe")

    private func exitCheck(_ s: VehicleStatus, demo: Bool, at: Date) {
        let key = s.vehicle.id
        let existing = Activity<CabinActivityAttributes>.activities.first { $0.attributes.kind == .exitCheck && $0.attributes.key == key }
        let fresh = !s.restricted && s.verdict?.current != false && s.noRealData != true && (s.camera ?? "ok") == "ok" && s.seats != nil
        let parked = s.engineOn == false
        let people = fresh ? (s.seats ?? []).filter(\.occ) : []
        let items = fresh ? (s.items?.count ?? 0) : 0

        if s.engineOn == true { end(existing, final: nil); return }
        guard parked else { return }

        let state: CabinActivityAttributes.ContentState
        if !fresh {
            guard existing != nil else { return }                       // never start from missing data
            state = .init(people: nil, childLikely: false, items: nil, level: "unknown", headline: "Chưa có dữ liệu mới",
                          detail: "Không coi là an toàn. Mở app hoặc kiểm tra xe.", stage: nil, progress: nil, simulated: demo, updatedAt: at)
        } else if people.isEmpty && items == 0 {
            end(existing, final: .init(people: 0, childLikely: false, items: 0, level: "ok", headline: "Camera không thấy người hay đồ",
                                       detail: "Đây không phải đảm bảo. Nhìn lại ghế trước khi rời xe.", stage: nil, progress: nil, simulated: demo, updatedAt: at))
            return
        } else {
            let child = people.contains { $0.age == "child" }
            var parts: [String] = []
            if !people.isEmpty { parts.append("\(people.count) người/thú") }
            if items > 0 { parts.append("\(items) đồ vật") }
            state = .init(people: people.count, childLikely: child, items: items, level: people.isEmpty ? "warning" : "critical",
                          headline: "Còn " + parts.joined(separator: " · ") + " trong xe",
                          detail: child ? "Có thể có trẻ em. Quay lại xe kiểm tra." : "Quay lại xe kiểm tra ghế và sàn.",
                          stage: nil, progress: nil, simulated: demo, updatedAt: at)
        }
        push(existing, state, key: key, kind: .exitCheck, vehicle: s.vehicle.name, subject: s.vehicle.plate)
    }

    // MARK: School trip

    private func schoolTrip(_ t: Trip, vehicle: String, demo: Bool, at: Date) {
        let key = t.child.id
        let existing = Activity<CabinActivityAttributes>.activities.first { $0.attributes.kind == .schoolTrip && $0.attributes.key == key }
        let live = ["boarded", "enroute", "leftin", "late"]
        let dest = t.destination?.name ?? t.school ?? t.dropoff
        let known = t.progressKnown
        func state(_ level: String, _ head: String, _ detail: String) -> CabinActivityAttributes.ContentState {
            .init(people: nil, childLikely: false, items: nil, level: level, headline: head, detail: detail, stage: t.stage,
                  progress: known ? t.progress : nil, simulated: demo, routeStart: t.pickup, routeEnd: dest, updatedAt: at)
        }
        switch t.stage {
        case "boarded": push(existing, state("ok", "\(t.child.name) đã lên xe", "Đang tới \(dest)"), key: key, kind: .schoolTrip, vehicle: vehicle, subject: t.child.name)
        case "enroute": push(existing, state("ok", "\(t.child.name) đang trên đường", "Tới \(dest)"), key: key, kind: .schoolTrip, vehicle: vehicle, subject: t.child.name)
        case "late": push(existing, state("warning", "\(t.child.name) chưa tới nơi", "Chuyến đang trễ so với dự kiến"), key: key, kind: .schoolTrip, vehicle: vehicle, subject: t.child.name)
        case "leftin": push(existing, state("critical", "\(t.child.name) còn trên xe", "Xe đã đỗ, camera vẫn thấy người. Quay lại xe ngay."), key: key, kind: .schoolTrip, vehicle: vehicle, subject: t.child.name)
        case "arrived": end(existing, final: state("ok", "\(t.child.name) đã tới \(dest)", "Chuyến đã kết thúc"))
        default: if !live.contains(t.stage) { end(existing, final: nil) }
        }
    }

    // MARK: Plumbing

    private func push(_ existing: Activity<CabinActivityAttributes>?, _ state: CabinActivityAttributes.ContentState,
                      key: String, kind: CabinActivityAttributes.Kind, vehicle: String, subject: String) {
        let content = ActivityContent(state: state, staleDate: state.updatedAt.addingTimeInterval(staleAfter))
        if let existing {
            guard existing.content.state != state else { return }
            Task { await existing.update(content) }
        } else {
            let attrs = CabinActivityAttributes(kind: kind, key: key, vehicleName: vehicle, subject: subject)
            do { _ = try Activity.request(attributes: attrs, content: content, pushType: nil) }
            catch {
                #if DEBUG
                print("LiveActivity request failed: \(error)")
                #endif
            }
        }
    }

    private func end(_ a: Activity<CabinActivityAttributes>?, final: CabinActivityAttributes.ContentState?) {
        guard let a else { return }
        Task {
            if let final { await a.end(ActivityContent(state: final, staleDate: nil), dismissalPolicy: .after(Date().addingTimeInterval(120))) }
            else { await a.end(nil, dismissalPolicy: .immediate) }
        }
    }

    #if DEBUG
    /// Simulator preview (`--preview-live`): both kinds with fixed, clearly labelled data.
    func debugStart() {
        guard enabled else { return }
        let now = Date()
        let only = CommandLine.arguments.first { $0.hasPrefix("--preview-live=") }
        if only != "--preview-live=trip" { debugExit(now) }
        if only != "--preview-live=exit" { debugTrip(now) }
    }

    private func debugExit(_ now: Date) {
        push(nil, .init(people: 1, childLikely: true, items: 2, level: "critical", headline: "Còn 1 người/thú · 2 đồ vật trong xe",
                        detail: "Có thể có trẻ em. Quay lại xe kiểm tra.", stage: nil, progress: nil, simulated: true, updatedAt: now),
             key: "debug-exit", kind: .exitCheck, vehicle: "VF 8", subject: "30A-123.45")
    }

    private func debugTrip(_ now: Date) {
        push(nil, .init(people: nil, childLikely: false, items: nil, level: "ok", headline: "Minh đang trên đường", detail: "Tới Trường Tiểu học Ba Đình",
                        stage: "enroute", progress: 62, simulated: true, routeStart: "06:45", routeEnd: "Trường Tiểu học Ba Đình", updatedAt: now),
             key: "debug-trip", kind: .schoolTrip, vehicle: "VF 8", subject: "Minh")
    }
    #endif
}
#endif
