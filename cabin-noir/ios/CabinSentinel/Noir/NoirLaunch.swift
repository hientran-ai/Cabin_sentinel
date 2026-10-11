import SwiftUI

/// Shown while the app starts: one line draws a "Z" and the tail catches up behind it, again and again until the app is ready.
/// No logo, no fixed delay. With "Reduce Motion" the Z just stays still.
struct NoirLaunchView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    private let cycle = 2.0

    var body: some View {
        ZStack {
            Noir.canvas.ignoresSafeArea()
            VStack(spacing: 34) {
                TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { t in
                    let (from, to) = reduceMotion ? (0, 1) : trim(at: t.date.timeIntervalSinceReferenceDate)
                    ZStack {
                        ZShape().trim(from: from, to: to).stroke(Noir.accent, style: stroke).blur(radius: 14).opacity(0.7)
                        ZShape().trim(from: from, to: to).stroke(.white, style: stroke)
                    }
                    .frame(width: 74, height: 96)
                }
                Text("CABIN NOIR").font(.system(size: 13, weight: .semibold)).tracking(6).foregroundStyle(.white.opacity(0.75))
                    .opacity(shown ? 1 : 0).animation(reduceMotion ? nil : .easeOut(duration: 0.8).delay(0.5), value: shown)
            }
        }
        .onAppear { shown = true }
        .accessibilityElement(children: .ignore).accessibilityLabel("Cabin Noir đang khởi động")
    }

    private var stroke: StrokeStyle { StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round) }

    /// The head runs 0 → 1 in the first half of a cycle, then the tail runs 0 → 1 in the second half.
    private func trim(at time: Double) -> (CGFloat, CGFloat) {
        let p = time.truncatingRemainder(dividingBy: cycle) / cycle
        func ease(_ x: Double) -> CGFloat { let c = min(max(x, 0), 1); return CGFloat(c * c * (3 - 2 * c)) }
        return (ease((p - 0.5) / 0.5), ease(p / 0.5))
    }
}

/// A single stroke: across the top, down the diagonal, across the bottom.
private struct ZShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        return p
    }
}

#Preview { NoirLaunchView() }
