import SwiftUI
import UIKit

/// Cabin Noir tokens. Dark only. System semantic colours and Dynamic Type everywhere; one warm accent.
/// Liquid Glass is reserved for the functional layer (toolbar, tab bar, camera controls, action groups).
/// Content (status, facts, lists) sits on plain grouped surfaces, never on glass.
enum Noir {
    static let accent = Color(hex: 0xF4C20D)
    static let canvas = Color(hex: 0x050506)
    static let surface = Color(.secondarySystemGroupedBackground)
    static let radius: CGFloat = 22
}

extension View {
    /// Content group: one flat grouped surface. No border, no shadow, no glass.
    func noirGroup(radius: CGFloat = Noir.radius) -> some View {
        background(Noir.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    /// Functional glass layer. iOS 26 Liquid Glass; earlier systems fall back to a thin material.
    @ViewBuilder
    func noirGlass<S: Shape>(in shape: S, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }

    /// Glass button style for actions that float over content.
    @ViewBuilder
    func noirGlassButton() -> some View {
        if #available(iOS 26.0, *) { self.buttonStyle(.glass) } else { self.buttonStyle(.bordered) }
    }

    /// Near-black canvas with a faint wash of the current risk colour at the top.
    func noirCanvas(glow: Color) -> some View {
        background {
            ZStack(alignment: .top) {
                Noir.canvas
                LinearGradient(colors: [glow.opacity(0.22), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.45))
            }
            .ignoresSafeArea()
            .animation(.smooth(duration: 0.6), value: glow)
        }
    }
}

/// Wraps several glass elements so they blend and morph as one on iOS 26.
struct NoirGlassGroup<Content: View>: View {
    var spacing: CGFloat = 12
    @ViewBuilder var content: Content
    var body: some View {
        if #available(iOS 26.0, *) { GlassEffectContainer(spacing: spacing) { content } } else { content }
    }
}

/// Spring press feedback shared by Noir tiles.
struct NoirPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Filled call-to-action. Dark label on the yellow accent (white on yellow fails contrast); white on red and orange.
struct NoirProminent: ButtonStyle {
    var tint: Color = Noir.accent
    @Environment(\.controlSize) private var size
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size == .large ? .headline : .subheadline.weight(.semibold))
            .foregroundStyle(tint == Noir.accent ? Color.black : Color.white)
            .padding(.horizontal, 20).frame(minHeight: size == .large ? 50 : 36)
            .background(tint.opacity(enabled ? 1 : 0.35), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
