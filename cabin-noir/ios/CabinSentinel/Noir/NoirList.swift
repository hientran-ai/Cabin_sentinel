import SwiftUI

extension View {
    /// Native inset-grouped List on the Noir canvas: system row surfaces, no custom cards.
    func noirList(glow: Color = Noir.accent.opacity(0)) -> some View {
        scrollContentBackground(.hidden).background(Noir.canvas.ignoresSafeArea())
    }
}

extension View {
    @ViewBuilder func noirSubtitle(_ text: String) -> some View {
        if #available(iOS 26.0, *) { self.navigationSubtitle(text) } else { self }
    }
}

/// Small helper: a symbol-led status block used at the top of detail screens.
struct NoirStatusBlock: View {
    let symbol: String
    let color: Color
    let kicker: String
    let title: String
    var detail: String? = nil
    @ScaledMetric(relativeTo: .largeTitle) private var size: CGFloat = 44

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol).font(.system(size: size)).symbolRenderingMode(.hierarchical).foregroundStyle(color)
                .contentTransition(.symbolEffect(.replace))
            Text(kicker.uppercased()).font(.caption.bold()).tracking(1.1).foregroundStyle(color)
            Text(title).font(.title.bold()).fixedSize(horizontal: false, vertical: true)
            if let detail { Text(detail).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.smooth(duration: 0.4), value: symbol)
        .accessibilityElement(children: .combine)
    }
}
