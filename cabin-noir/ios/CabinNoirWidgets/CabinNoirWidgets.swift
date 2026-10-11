import SwiftUI
import WidgetKit
import ActivityKit

@main struct CabinNoirWidgets: WidgetBundle {
    var body: some Widget { CabinLiveActivity() }
}

// MARK: Design tokens
// Black surfaces, one accent per state, system type styles (never below 11 pt) and SF Symbols so Dynamic Type keeps working.
// State is never colour alone: every colour is paired with a symbol and words. Touch targets are at least 44 pt.

private enum Tone {
    static let gold = Color(red: 0.96, green: 0.77, blue: 0.09)
    static let chip = Color.white.opacity(0.12)
    static func color(_ level: String) -> Color {
        switch level { case "critical": .red; case "warning": .orange; case "ok": .green; default: .gray }
    }
}

private func count(_ n: Int?) -> String { n.map(String.init) ?? "–" }

private func icon(_ s: CabinActivityAttributes.ContentState, _ kind: CabinActivityAttributes.Kind) -> String {
    if kind == .exitCheck { return "figure.child" }
    switch s.stage {
    case "enroute": return "car.fill"
    case "arrived": return "checkmark.circle.fill"
    case "leftin": return "exclamationmark.triangle.fill"
    case "late": return "clock.badge.exclamationmark"
    default: return "figure.child"
    }
}

// MARK: Pieces

/// The app's own icon, small, with the app name. Used on every surface so it is clear who is speaking.
private struct Brand: View {
    var size: CGFloat = 20
    var showName = true
    var body: some View {
        HStack(spacing: 6) {
            Image("NoirLogo").resizable().frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.225, style: .continuous))
                .accessibilityHidden(true)
            if showName { Text("Cabin Noir").font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.85)) }
        }
    }
}

private struct GlyphCircle: View {
    let symbol: String
    var tint: Color = .white
    var fill: Color = Tone.chip
    var size: CGFloat = 40
    var body: some View {
        Image(systemName: symbol).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(tint)
            .frame(width: size, height: size).background(fill, in: Circle())
    }
}

private struct SimChip: View {
    var body: some View {
        Text("MÔ PHỎNG").font(.caption2.weight(.heavy)).foregroundStyle(.white)
            .padding(.horizontal, 6).padding(.vertical, 2).background(Tone.chip, in: Capsule())
    }
}

/// The 112 call button: red circle, 44 pt, symbol plus an accessibility label.
private struct CallButton: View {
    var body: some View {
        Link(destination: URL(string: "tel:112")!) {
            Image(systemName: "phone.fill").font(.system(size: 18, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 44, height: 44).background(.red, in: Circle())
        }
        .accessibilityLabel("Gọi 112")
    }
}

/// Route line: filled part and the car where the trip is. Without known progress no car is drawn.
private struct RouteLine: View {
    let progress: Int?
    let tone: Color
    var body: some View {
        GeometryReader { g in
            let p = CGFloat(min(max(progress ?? 0, 0), 100)) / 100
            let x = max(12, min(g.size.width - 12, g.size.width * p))
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.22)).frame(height: 4)
                Capsule().fill(tone).frame(width: x, height: 4)
                if progress != nil {
                    Image(systemName: "car.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 26, height: 26).background(tone, in: Circle())
                        .overlay(Circle().stroke(.black, lineWidth: 2)).position(x: x, y: g.size.height / 2)
                }
            }
        }
        .frame(height: 26)
        .accessibilityElement().accessibilityLabel(progress.map { "Đã đi được \($0) phần trăm" } ?? "Chưa có tiến trình")
    }
}

// MARK: Widget

struct CabinLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CabinActivityAttributes.self) { context in
            LockCard(context: context)
                .activityBackgroundTint(.black)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let s = context.state
            let kind = context.attributes.kind
            let stale = context.isStale
            let tone = stale ? Color.gray : Tone.color(s.level)
            return DynamicIsland {
                // Expanded: identity on the leading side, the one number that matters on the trailing side, everything else in one bottom block.
                DynamicIslandExpandedRegion(.leading) { Brand(size: 22) }
                DynamicIslandExpandedRegion(.trailing) {
                    if kind == .exitCheck {
                        HStack(spacing: 12) {
                            Label(count(stale ? nil : s.people), systemImage: "figure.child").foregroundStyle(tone)
                            Label(count(stale ? nil : s.items), systemImage: "bag").foregroundStyle(Tone.gold)
                        }
                        .font(.headline.monospacedDigit()).labelStyle(.titleAndIcon)
                    } else if let p = s.progress, !stale {
                        Text("\(p)%").font(.headline.monospacedDigit()).foregroundStyle(tone)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .center, spacing: 10) {
                            Image(systemName: stale ? "wifi.slash" : icon(s, kind)).font(.title3).foregroundStyle(tone).frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(stale ? "Chưa có dữ liệu mới" : s.headline).font(.subheadline.weight(.semibold)).lineLimit(2)
                                Text(stale ? "Không coi là an toàn. Mở app để kiểm tra." : s.detail).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer(minLength: 0)
                            if kind == .exitCheck, s.level == "critical", !stale { CallButton() }
                        }
                        if kind == .schoolTrip, !stale { RouteLine(progress: s.progress, tone: tone) }
                    }
                }
            } compactLeading: {
                if kind == .exitCheck {
                    Label(count(stale ? nil : s.people), systemImage: "figure.child")
                        .font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(tone)
                } else {
                    Image(systemName: icon(s, kind)).font(.footnote.weight(.semibold)).foregroundStyle(tone)
                }
            } compactTrailing: {
                if kind == .exitCheck {
                    Label(count(stale ? nil : s.items), systemImage: "bag")
                        .font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(Tone.gold)
                } else if let p = s.progress, !stale {
                    Text("\(p)%").font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(tone)
                }
            } minimal: {
                Image(systemName: icon(s, kind)).font(.footnote.weight(.semibold)).foregroundStyle(tone)
            }
            .keylineTint(tone)
        }
    }
}

// MARK: Lock screen (kept under about 160 pt so iOS does not clip it)

private struct LockCard: View {
    let context: ActivityViewContext<CabinActivityAttributes>
    var body: some View {
        if context.attributes.kind == .schoolTrip { trip } else { alert }
    }

    private var stale: Bool { context.isStale }
    private var tone: Color { stale ? .gray : Tone.color(context.state.level) }

    private var topRow: some View {
        HStack(spacing: 8) {
            Brand(size: 20)
            if context.state.simulated { SimChip() }
            Spacer(minLength: 0)
            Text(context.attributes.kind == .exitCheck ? "\(context.attributes.vehicleName) · " : "").font(.caption).foregroundStyle(.white.opacity(0.5))
                + Text(context.state.updatedAt, style: .time).font(.caption).foregroundStyle(.white.opacity(0.5))
        }
    }

    private var trip: some View {
        let s = context.state
        return VStack(alignment: .leading, spacing: 8) {
            topRow
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(stale ? "Chưa có dữ liệu mới" : s.headline).font(.title3.weight(.bold)).foregroundStyle(.white).lineLimit(1)
                    Text(stale ? "Không coi là an toàn. Mở app để kiểm tra." : s.detail).font(.footnote).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                }
                Spacer(minLength: 8)
                if let p = s.progress, !stale { Text("\(p)%").font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit()).foregroundStyle(tone) }
            }
            if !stale {
                VStack(spacing: 2) {
                    RouteLine(progress: s.progress, tone: tone)
                    HStack {
                        Text(s.routeStart.map { "Đón \($0)" } ?? "").font(.caption.monospacedDigit())
                        Spacer()
                        Text(s.routeEnd ?? "").font(.caption).lineLimit(1)
                    }
                    .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .padding(14)
    }

    private var alert: some View {
        let s = context.state
        return VStack(alignment: .leading, spacing: 8) {
            topRow
            HStack(spacing: 10) {
                GlyphCircle(symbol: stale ? "wifi.slash" : "figure.child", tint: tone, fill: tone.opacity(0.18), size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(stale ? "Chưa có dữ liệu mới" : s.headline).font(.subheadline.weight(.semibold)).foregroundStyle(tone).lineLimit(1)
                    Text(stale ? "Không coi là an toàn. Mở app để kiểm tra." : s.detail).font(.caption).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if !stale, s.people != nil {
                HStack(spacing: 10) {
                    bigStat(count(s.people), "Người / thú", "figure.child", tone)
                    bigStat(count(s.items), "Đồ vật", "bag", Tone.gold)
                    if s.level == "critical" { CallButton() }
                }
            }
        }
        .padding(14)
    }

    private func bigStat(_ n: String, _ label: String, _ symbol: String, _ c: Color) -> some View {
        HStack(spacing: 8) {
            Text(n).font(.system(.title, design: .rounded).weight(.semibold).monospacedDigit()).foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 1) {
                Image(systemName: symbol).font(.caption).foregroundStyle(c)
                Text(label).font(.caption2).foregroundStyle(.white.opacity(0.6))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 4).frame(maxWidth: .infinity)
        .background(Tone.chip, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
