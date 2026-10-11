import Foundation
#if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
import ActivityKit

/// Shared by the app and the widget extension. One type for both activities so the extension stays small.
/// `people == nil` means "no fresh data" and is never drawn as "none".
struct CabinActivityAttributes: ActivityAttributes {
    enum Kind: String, Codable, Hashable { case exitCheck, schoolTrip }

    struct ContentState: Codable, Hashable {
        var people: Int?
        var childLikely: Bool
        var items: Int?
        var level: String          // ok | warning | critical | unknown
        var headline: String
        var detail: String
        var stage: String?         // school trip: boarded | enroute | arrived | leftin | late
        var progress: Int?
        var simulated: Bool
        var routeStart: String? = nil  // school trip: pickup time, shown under the progress line
        var routeEnd: String? = nil    // school trip: destination, shown under the progress line
        var updatedAt: Date
    }

    var kind: Kind
    var key: String                // vehicle id (exit check) or child id (school trip)
    var vehicleName: String
    var subject: String            // plate or child name
}
#endif
