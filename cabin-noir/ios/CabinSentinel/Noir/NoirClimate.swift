import SwiftUI

/// Remote climate with native controls. Same API and limits as ClimateView (16–28 °C); it only cools, heats or runs the fan.
struct NoirClimate: View {
    @Environment(AppModel.self) private var model
    @State private var target = 22
    @State private var mode = "cool"
    @State private var fan = "auto"
    @State private var duration = 20
    @State private var busy = false
    @State private var error: String?
    @State private var synced = false
    @ScaledMetric(relativeTo: .largeTitle) private var bigNumber: CGFloat = 76

    private var on: Bool { ["on", "sending"].contains(model.status?.climate?.status ?? "") }

    var body: some View {
        let s = model.status
        let temp = s?.cabinTemp
        ScrollView {
            VStack(spacing: 24) {
                if let inc = s?.incident {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(inc.level == "critical" ? "Sự cố nghiêm trọng đang mở" : "Sự cố cảnh báo đang mở").font(.headline)
                            Text("Làm mát giúp giảm nhiệt nhưng không thay thế việc kiểm tra xe.").font(.subheadline).foregroundStyle(.secondary)
                        }
                    } icon: { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.red) }
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading).noirGroup()
                }
                header(s, temp: temp)
                VStack(spacing: 0) {
                    pickerRow("Chế độ", selection: $mode, options: [("cool", "Làm mát"), ("heat", "Sưởi"), ("fan", "Chỉ quạt")]) { push() }
                    Divider()
                    targetRow
                    Divider()
                    pickerRow("Quạt", selection: $fan, options: [("low", "Nhẹ"), ("auto", "Tự động"), ("high", "Mạnh")]) { push() }
                    Divider()
                    pickerRow("Thời gian", selection: Binding(get: { String(duration) }, set: { duration = Int($0) ?? 20 }),
                              options: [("10", "10 phút"), ("20", "20 phút"), ("30", "30 phút")]) {}
                }
                .noirGroup()
                if let error { Label(error, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(Theme.red) }
                HStack { DemoBadge(); Text("Bản dùng thử không điều khiển xe thật.").font(.footnote).foregroundStyle(.secondary); Spacer() }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .safeAreaInset(edge: .bottom) {
            Button { send(on ? "stop" : "start") } label: {
                Text(on ? "Tắt điều hòa" : (model.status?.climate?.status == "fail" ? "Thử lại" : "Bật điều hòa")).frame(maxWidth: .infinity)
            }
            .buttonStyle(NoirProminent(tint: on ? Theme.red : Noir.accent)).controlSize(.large)
            .disabled(busy).padding(.horizontal, 16).padding(.bottom, 8)
            .sensoryFeedback(.impact(weight: .medium), trigger: on)
        }
        .noirCanvas(glow: on ? Theme.blue : Noir.accent)
        .navigationTitle("Điều hòa").navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .onAppear { sync(model.status?.climate) }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1.5))
                try? await model.refreshSelected()
            }
        }
    }

    private func header(_ s: VehicleStatus?, temp: Double?) -> some View {
        let c = s?.climate
        return VStack(spacing: 6) {
            Text("Trong cabin").font(.subheadline).foregroundStyle(.secondary)
            Text(temp == nil ? "—" : "\(Int(temp!.rounded()))°").font(.system(size: bigNumber, weight: .light, design: .rounded))
                .contentTransition(.numericText()).animation(.smooth, value: temp)
            Label(on ? "Đang chạy" + (c.map { " · còn \(max(1, $0.secondsLeft / 60)) phút" } ?? "") : (c?.status == "fail" ? "Điều hòa lỗi" : "Điều hòa tắt"),
                  systemImage: on ? "fan" : "power")
                .font(.callout).foregroundStyle(on ? Theme.blue : (c?.status == "fail" ? Theme.red : .secondary))
                .symbolEffect(.rotate, isActive: on)
            Text("Ngoài trời \(Int(s?.outsideTemp ?? 0))°C").font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).accessibilityElement(children: .combine)
    }

    private var targetRow: some View {
        HStack {
            Text("Mục tiêu").font(.body)
            Spacer()
            Button { target = max(16, target - 1); push() } label: { Image(systemName: "minus") }
                .buttonStyle(.bordered).buttonBorderShape(.circle).disabled(target <= 16).accessibilityLabel("Giảm nhiệt độ mục tiêu")
            Text("\(target)°").font(.title2.monospacedDigit()).frame(minWidth: 52).contentTransition(.numericText())
            Button { target = min(28, target + 1); push() } label: { Image(systemName: "plus") }
                .buttonStyle(.bordered).buttonBorderShape(.circle).disabled(target >= 28).accessibilityLabel("Tăng nhiệt độ mục tiêu")
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .animation(.smooth(duration: 0.2), value: target)
        .sensoryFeedback(.selection, trigger: target)
    }

    private func pickerRow(_ title: String, selection: Binding<String>, options: [(String, String)], onChange: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).foregroundStyle(.secondary)
            Picker(title, selection: selection) { ForEach(options, id: \.0) { Text($0.1).tag($0.0) } }
                .pickerStyle(.segmented)
                .onChange(of: selection.wrappedValue) { onChange() }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func sync(_ c: Climate?) {
        guard let c, !synced else { return }
        target = c.status == "off" && model.status?.incident != nil ? 20 : c.target
        mode = c.mode; fan = c.fan; duration = c.durationMin; synced = true
    }

    private func push() { if model.status?.climate?.status == "on" { send("update") } }

    private func send(_ action: String) {
        guard let id = model.selected?.id else { return }
        Task {
            busy = true
            error = await model.perform {
                try await model.api.climate(id, .init(action: action, target: target, mode: mode, fan: fan, durationMin: duration))
            }
            busy = false
        }
    }
}
