import SwiftUI

struct HistoryView: View {
    @Environment(AppModel.self) private var model
    @State private var days = 7
    @State private var level = "all"
    @State private var data: History?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Thời gian", selection: $days) {
                        Text("Hôm nay").tag(1); Text("7 ngày").tag(7); Text("30 ngày").tag(30)
                    }
                    .pickerStyle(.segmented)
                    Picker("Mức", selection: $level) {
                        Text("Tất cả").tag("all"); Text("Cảnh báo").tag("warning"); Text("Nghiêm trọng").tag("critical")
                    }
                    .pickerStyle(.segmented)
                }
                .listRowBackground(Color.clear)
                if let error { Section { ErrorBanner(message: error) { Task { await load() } } }.listRowBackground(Color.clear) }
                Section("Sự cố") {
                    if let d = data, d.incidents.isEmpty { Text("Không có sự cố trong khoảng này.").foregroundStyle(Theme.muted) }
                    ForEach(data?.incidents ?? []) { inc in
                        NavigationLink { IncidentDetailView(incidentId: inc.id) } label: { IncidentRow(inc: inc) }
                    }
                }
                Section("Hoạt động") {
                    ForEach(Array((data?.events ?? []).enumerated()), id: \.offset) { _, e in
                        HStack(alignment: .top, spacing: 10) {
                            Text(shortDate(e.at)).font(.system(size: 12, weight: .semibold).monospacedDigit()).foregroundStyle(Theme.ink2).frame(width: 92, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.system(size: 15, weight: .semibold))
                                Text(e.detail).font(.system(size: 13)).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden).screenBackground()
            .navigationTitle(model.selected.map { "Lịch sử · \($0.vehicle.name)" } ?? "Lịch sử")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await load() }
            .task(id: "\(days)-\(level)-\(model.selected?.id ?? "")") { await load() }
        }
    }

    private func load() async {
        guard let id = model.selected?.id else { return }
        do { data = try await model.api.history(id, days: days, level: level); error = nil }
        catch { self.error = (error as? APIError)?.message }
    }
}

struct IncidentRow: View {
    let inc: Incident
    var body: some View {
        let st = LevelStyle.of(inc.level)
        HStack(spacing: 12) {
            Image(systemName: st.icon).foregroundStyle(.white).frame(width: 36, height: 36).background(st.color, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(inc.level == "critical" ? "Nghiêm trọng" : "Cảnh báo").font(.system(size: 15, weight: .bold))
                Text(inc.reason).font(.system(size: 13)).foregroundStyle(Theme.ink2).lineLimit(2)
                Text("\(shortDate(inc.createdAt)) · \(inc.status == "open" ? "Đang mở" : "Đã đóng bởi \(inc.resolvedBy ?? "—")")")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(inc.status == "open" ? Theme.redDark : Theme.green)
            }
        }
    }
}

struct IncidentDetailView: View {
    let incidentId: String
    @Environment(AppModel.self) private var model
    @State private var inc: Incident?

    var body: some View {
        List {
            if let inc {
                Section { IncidentRow(inc: inc) }
                Section("Diễn biến") {
                    ForEach(inc.events ?? [], id: \.self) { e in
                        HStack(alignment: .top, spacing: 10) {
                            Text(clock(e.at)).font(.system(size: 13, weight: .bold).monospacedDigit()).foregroundStyle(Theme.ink2)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.system(size: 15, weight: .semibold))
                                Text(e.detail).font(.system(size: 13)).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                if let esc = inc.escalation {
                    Section("Leo thang") {
                        ForEach(esc.steps) { s in
                            HStack {
                                Text(s.title).font(.system(size: 14))
                                Spacer()
                                Text(s.state == "done" ? "Đã làm" : s.state == "stopped" ? "Đã dừng" : "Chưa tới").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink2)
                            }
                        }
                    }
                }
            } else { ProgressView() }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle("Chi tiết sự cố").navigationBarTitleDisplayMode(.inline)
        .task { inc = try? await model.api.incident(incidentId) }
    }
}
