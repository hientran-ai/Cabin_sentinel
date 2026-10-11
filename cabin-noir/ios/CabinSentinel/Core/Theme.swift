import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

/// Semantic tokens. Surfaces follow the system (light, dark, increased contrast);
/// status colors use the darker Apple "accessible" variants so text stays readable on tints.
enum Theme {
    private static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(Color(hex: dark)) : UIColor(Color(hex: light)) })
    }
    static let bg = Color(.systemGroupedBackground)
    static let card = Color(.secondarySystemGroupedBackground)
    static let raised = Color(.tertiarySystemGroupedBackground)
    static let cardLine = Color(.separator)
    static let line = Color(.separator)
    static let ink = Color(.label)
    static let ink2 = Color(.secondaryLabel)
    static let muted = Color(.secondaryLabel)
    static let primary = Color.accentColor
    static let green = dyn(0x248A3D, 0x30D158)
    static let blue = dyn(0x0040DD, 0x409CFF)
    static let orange = dyn(0xC93400, 0xFF9F0A)
    static let red = dyn(0xD70015, 0xFF453A)
    static let redDark = red
    static let greenBg = green.opacity(0.14)
    static let blueBg = blue.opacity(0.12)
    static let orangeBg = orange.opacity(0.14)
    static let redBg = red.opacity(0.13)
    static let greyBg = Color(.tertiarySystemFill)
    static let onTint = Color(.systemBackground)
}

enum Metric {
    static let gutter: CGFloat = 16
    static let radius: CGFloat = 16
    static let control: CGFloat = 50
}

/// Visual treatment for a backend risk level. The app never derives the level itself.
struct LevelStyle {
    let label: String
    let color: Color
    let tint: Color
    let icon: String

    static func of(_ level: String?) -> LevelStyle {
        switch level {
        case "safe": return .init(label: "Bình thường", color: Theme.green, tint: Theme.greenBg, icon: "checkmark.shield")
        case "notice": return .init(label: "Cần xem xét", color: Theme.blue, tint: Theme.blueBg, icon: "info.circle")
        case "warning": return .init(label: "Cảnh báo", color: Theme.orange, tint: Theme.orangeBg, icon: "exclamationmark.triangle")
        case "critical": return .init(label: "Nghiêm trọng", color: Theme.red, tint: Theme.redBg, icon: "exclamationmark.triangle.fill")
        case "paused": return .init(label: "Tạm dừng", color: Theme.ink2, tint: Theme.card, icon: "car")
        default: return .init(label: "Chưa xác định", color: Theme.ink2, tint: Theme.greyBg, icon: "questionmark.circle")
        }
    }
}

func toneColor(_ tone: String) -> Color {
    switch tone {
    case "red": return Theme.redDark
    case "orange": return Theme.orange
    case "grey": return Theme.muted
    default: return Theme.ink
    }
}

// MARK: - Reusable pieces

struct Card<Content: View>: View {
    var tint: Color = Theme.card
    var stroke: Color = .clear
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint, in: RoundedRectangle(cornerRadius: Metric.radius, style: .continuous))
    }
}

/// Spring press feedback shared by every custom button.
struct PressScale: ViewModifier {
    let pressed: Bool
    func body(content: Content) -> some View {
        content.scaleEffect(pressed ? 0.97 : 1).opacity(pressed ? 0.85 : 1)
            .animation(.snappy(duration: 0.15), value: pressed)
    }
}

private struct OnAccentKey: EnvironmentKey { static let defaultValue = Color.white }
extension EnvironmentValues {
    /// Label colour on a button filled with the app's accent (Cabin Noir uses a yellow accent that needs dark text).
    var onAccent: Color { get { self[OnAccentKey.self] } set { self[OnAccentKey.self] = newValue } }
}

struct PrimaryButtonStyle: ButtonStyle {
    var color: Color = Theme.primary
    var enabled = true
    @Environment(\.onAccent) private var onAccent
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(enabled ? (color == Theme.primary ? onAccent : Color.white) : Theme.muted)
            .frame(maxWidth: .infinity, minHeight: Metric.control)
            .background(enabled ? color : Theme.greyBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .modifier(PressScale(pressed: configuration.isPressed))
    }
}

/// Tinted button: soft fill, no border.
struct SecondaryButtonStyle: ButtonStyle {
    var color: Color = Theme.primary
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(color.opacity(0.13), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .modifier(PressScale(pressed: configuration.isPressed))
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 22, weight: .bold)).foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct DemoBadge: View {
    var text = "Mô phỏng"
    var body: some View {
        Label(text, systemImage: "wand.and.stars")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.ink2)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Theme.greyBg, in: Capsule())
    }
}

/// Settings-style row; chevron on the right, no border.
struct RowLink: View {
    let icon: String
    let title: String
    let subtitle: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 17, weight: .medium)).foregroundStyle(Theme.primary).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 17, weight: .regular))
                Text(subtitle).font(.system(size: 14)).foregroundStyle(Theme.ink2).lineLimit(2)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(.tertiaryLabel))
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: 44)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Metric.radius, style: .continuous))
    }
}

struct Toast: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.onTint)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Theme.ink.opacity(0.92), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 24)
            .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

extension View {
    func toast(_ text: Binding<String?>) -> some View {
        overlay(alignment: .bottom) {
            if let t = text.wrappedValue {
                Toast(text: t).padding(.bottom, 24)
                    .task(id: t) {
                        try? await Task.sleep(for: .seconds(2.6))
                        withAnimation { text.wrappedValue = nil }
                    }
            }
        }
        .animation(.snappy(duration: 0.22), value: text.wrappedValue)
        .sensoryFeedback(.success, trigger: text.wrappedValue) { $0 == nil && $1 != nil }
    }

    func screenBackground() -> some View {
        background(Theme.bg.ignoresSafeArea())
    }
}

struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)?
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "wifi.exclamationmark").foregroundStyle(Theme.redDark)
            VStack(alignment: .leading, spacing: 6) {
                Text(message).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink)
                if let retry { Button("Thử lại", action: retry).font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.ink) }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.redBg, in: RoundedRectangle(cornerRadius: Metric.radius, style: .continuous))
    }
}

func clock(_ t: Double?) -> String {
    guard let t else { return "—" }
    let f = DateFormatter()
    f.dateFormat = "HH:mm:ss"
    return f.string(from: Date(timeIntervalSince1970: t))
}

func shortDate(_ t: Double) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "vi_VN")
    f.dateFormat = "HH:mm · dd/MM"
    return f.string(from: Date(timeIntervalSince1970: t))
}

func mmss(_ s: Int) -> String { String(format: "%02d:%02d", max(0, s) / 60, max(0, s) % 60) }

/// The photo for this vehicle, or nil when we have no photo of the model (VF 9, VF 3, other brands): never show another model's photo.
func carImage(_ v: Vehicle?) -> String? {
    guard let v else { return nil }
    let m = v.model.uppercased().replacingOccurrences(of: " ", with: "")
    if m.contains("VF6") { return "car-vf6" }
    guard m.contains("VF8") else { return nil }
    switch v.color {
    case "red": return "car-vf8-red"
    case "black": return "car-vf8-black"
    default: return "car-vf8"
    }
}

/// Vehicle photo, or a neutral drawing of a car when there is no photo of that model.
struct CarPicture: View {
    let vehicle: Vehicle?
    var body: some View {
        if let name = carImage(vehicle) {
            Image(name).resizable().scaledToFit()
        } else {
            Image(systemName: "car.side.fill").resizable().scaledToFit()
                .foregroundStyle(.secondary).padding(8)
                .accessibilityLabel(vehicle.map { "\($0.model)" } ?? "Xe")
        }
    }
}
