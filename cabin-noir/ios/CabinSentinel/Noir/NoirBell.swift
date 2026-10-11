import SwiftUI

/// The bell in the top bar. Tapping it opens one list of what happened: alerts, new devices, camera or connection problems and update
/// notices. The number on the bell counts what is new since the list was last opened.
struct NoirBellButton: View {
    var onPick: (NotificationItem) -> Void
    @Environment(AppModel.self) private var model
    @AppStorage("bellSeenAt") private var seenAt = 0.0
    @State private var items: [NotificationItem] = []
    @State private var show = false
    @State private var seenWhenOpened = 0.0

    private var unread: Int { items.filter { $0.at > seenAt && $0.kind != "resolved" }.count }
    private var openIncident: Bool { model.status?.incident != nil }

    var body: some View {
        Button {
            seenWhenOpened = seenAt
            seenAt = Date().timeIntervalSince1970
            show = true
        } label: {
            Image(systemName: openIncident ? "bell.badge.fill" : "bell")
                .symbolRenderingMode(openIncident ? .multicolor : .monochrome)
                .font(.system(size: 19, weight: .regular)).foregroundStyle(Noir.accent)
                .frame(width: 37, height: 40)
                .overlay(alignment: .topTrailing) {
                    if unread > 0 {
                        Text(unread > 9 ? "9+" : "\(unread)").font(.system(size: 10.5, weight: .bold).monospacedDigit()).foregroundStyle(.white)
                            .padding(.horizontal, 4).frame(minWidth: 16, minHeight: 16).background(Theme.red, in: Capsule())
                            .overlay(Capsule().strokeBorder(Noir.canvas, lineWidth: 1.5)).offset(x: 2, y: 2)
                    }
                }
        }
        .accessibilityLabel(unread > 0 ? "Thông báo, \(unread) mới" : (openIncident ? "Thông báo, có sự cố đang mở" : "Thông báo"))
        .sheet(isPresented: $show) {
            NoirNotifications(items: items, since: seenWhenOpened) { n in show = false; onPick(n) }
                .presentationDetents([.medium, .large])
        }
        .task {
            while !Task.isCancelled {
                if let f = try? await model.api.notifications(app: Self.appVersion) { items = f.items }
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    static var appVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }
}

struct NoirNotifications: View {
    let items: [NotificationItem]
    let since: Double
    var onPick: (NotificationItem) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if items.isEmpty {
                    ContentUnavailableView("Chưa có thông báo", systemImage: "bell.slash", description: Text("Cảnh báo, thiết bị mới kết nối và bản cập nhật sẽ hiện ở đây."))
                        .listRowBackground(Color.clear)
                }
                ForEach(items) { n in
                    Button { onPick(n) } label: { row(n) }.buttonStyle(.plain)
                }
            }
            .noirList()
            .navigationTitle("Thông báo").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() } } }
        }
    }

    private func row(_ n: NotificationItem) -> some View {
        let style = look(n)
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: style.icon).symbolRenderingMode(.hierarchical).foregroundStyle(style.color).font(.title3).frame(width: 30)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if n.at > since && n.kind != "resolved" { Circle().fill(Noir.accent).frame(width: 8, height: 8).accessibilityLabel("Mới") }
                    Text(n.title).font(.headline)
                }
                if !n.detail.isEmpty { Text(n.detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                Text("\(n.vehicleName.map { "\($0) · " } ?? "")\(Self.relative(n.at))").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private func look(_ n: NotificationItem) -> (icon: String, color: Color) {
        switch n.kind {
        case "alert": return ("exclamationmark.triangle.fill", n.level == "critical" ? Theme.red : .orange)
        case "resolved": return ("checkmark.shield.fill", Theme.green)
        case "device": return ("cpu.fill", Noir.accent)
        case "camera": return ("eye.slash.fill", .orange)
        case "offline": return ("wifi.slash", .orange)
        case "update": return ("arrow.down.circle.fill", Noir.accent)
        default: return ("bell.fill", .gray)
        }
    }

    private static func relative(_ t: Double) -> String {
        let f = RelativeDateTimeFormatter(); f.locale = Locale(identifier: "vi_VN"); f.unitsStyle = .full
        return f.localizedString(for: Date(timeIntervalSince1970: t), relativeTo: Date())
    }
}
