import SwiftUI
import AVKit

struct NoirHistory: View {
    @Environment(AppModel.self) private var model
    @AppStorage("histSeg") private var seg = "alerts"          // "alerts" or "activity"; also set by the bell
    @State private var days = 7
    @State private var level = "all"
    @State private var logKind = "all"
    @State private var data: History?
    @State private var log: CabinLog?
    @State private var summary: LogSummary?
    @State private var detailItem: CabinLogItem?
    @State private var pickedDay: Double?                      // a tapped day of the strip filters both halves
    @State private var error: String?
    @State private var loading = true

    private var openCount: Int { (data?.incidents ?? []).filter { $0.status == "open" }.count }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Section {
                        ContentUnavailableView {
                            Label("Không tải được lịch sử", systemImage: "wifi.exclamationmark")
                        } description: { Text(error) } actions: {
                            Button("Thử lại") { Task { await load() } }.buttonStyle(NoirProminent())
                        }
                        .listRowBackground(Color.clear)
                    }
                } else if loading && data == nil {
                    Section { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
                } else {
                    Section { hero }.listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    if seg == "alerts" { alertsContent } else { activityContent }
                }
            }
            .noirList()
            .listSectionSpacing(.compact)
            .navigationTitle("Lịch sử").navigationBarTitleDisplayMode(.inline)
            .noirSubtitle(model.selected?.vehicle.name ?? "")
            .toolbar { vehicleMenu }
            .sheet(item: $detailItem) { NoirActivityDetail(item: $0) }
            .safeAreaInset(edge: .top, spacing: 0) { segmented }
            .safeAreaInset(edge: .bottom, spacing: 0) { actionBar }
            .refreshable { await load() }
            .task(id: "\(days)-\(level)-\(logKind)-\(seg)-\(model.selected?.id ?? "")") { await load() }
        }
    }

    // MARK: pieces

    @ToolbarContentBuilder private var vehicleMenu: some ToolbarContent {
        if model.vehicles.count > 1 {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ForEach(model.vehicles) { v in
                        Button { model.selectedId = v.id } label: {
                            Label("\(v.vehicle.name) · \(v.vehicle.plate)", systemImage: v.id == model.selected?.id ? "checkmark" : "car")
                        }
                    }
                } label: { Image(systemName: "car") }
                .accessibilityLabel("Chọn xe")
            }
        }
    }

    /// Pinned under the title on a translucent material, so it stays reachable while the list scrolls.
    private var segmented: some View {
        Picker("Loại lịch sử", selection: $seg) {
            Text(openCount > 0 ? "Cảnh báo ●" : "Cảnh báo").tag("alerts")
            Text("Hoạt động thiết bị").tag("activity")
        }
        .pickerStyle(.segmented)
        .accessibilityValue(openCount > 0 ? "\(openCount) sự cố đang mở" : "")
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.bar)
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            NavigationLink { NoirSelfCheckEntry() } label: {
                Label("Tự kiểm tra cabin", systemImage: "camera.viewfinder").frame(maxWidth: .infinity)
            }
            .buttonStyle(NoirProminent()).controlSize(.large)
            if let id = model.selected?.id, model.selected?.role == "owner" || model.selected?.role == "confirm" {
                ShareLink(item: CabinCSV(api: model.api, vehicleId: id, days: days), preview: SharePreview("Nhật ký cabin (CSV)")) {
                    Image(systemName: "square.and.arrow.up").font(.title3).frame(width: 52, height: 52).noirGlass(in: Circle(), interactive: true)
                }
                .accessibilityLabel("Tải nhật ký (CSV)")
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.bar)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("\(days) ngày qua").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Picker("Khoảng thời gian", selection: $days) { Text("7 ngày").tag(7); Text("30 ngày").tag(30); Text("90 ngày").tag(90) }
                    .pickerStyle(.menu).labelsHidden()
            }
            heroHeadline
            if let s = summary { DayStrip(days: s.days, picked: $pickedDay) }
            if seg == "alerts", let c = summary?.coverage {
                HStack(spacing: 8) {
                    // A low share of watched time must not wear a green tick.
                    Image(systemName: c.pct >= 95 ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                        .foregroundStyle(c.pct >= 95 ? Theme.green : c.pct >= 80 ? Color.orange : Theme.red)
                    Text("Giám sát \(pctText(c.pct)) thời gian").font(.subheadline)
                    Spacer(minLength: 0)
                    BasisChip(basis: c.basis)
                }
            } else if seg == "alerts", summary != nil {
                Text("Chưa có thiết bị trong xe nên chưa tính được thời gian giám sát.").font(.footnote).foregroundStyle(.secondary)
            }
            if pickedDay != nil {
                Button("Bỏ lọc ngày") { pickedDay = nil }.font(.footnote.weight(.semibold))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .noirGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    @ViewBuilder private var heroHeadline: some View {
        let incs = data?.incidents ?? []
        if openCount > 0 {
            (Text("\(openCount) sự cố đang mở").foregroundColor(Theme.red) + Text(", \(incs.count - openCount) đã xử lý")).font(.title2.bold())
        } else {
            Text(incs.isEmpty ? "Không có sự cố" : "\(incs.count) sự cố, đã xử lý hết").font(.title2.bold())
        }
    }

    private func pctText(_ v: Double) -> String { String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",") + "%" }

    private func inDay(_ t: Double) -> Bool {
        guard let d = pickedDay else { return true }
        let span = Double(summary?.days.first { $0.start == d }?.span ?? 1)
        return t >= d && t < d + span * 86400
    }

    // MARK: alerts

    @ViewBuilder private var alertsContent: some View {
        let stats = log?.stats
        if let s = stats, s.cameraBlocked + s.offline > 0 {
            Section {
                Button { seg = "activity" } label: {
                    Label {
                        Text("Có lúc xe không được giám sát: che camera \(s.cameraBlocked) lần, mất kết nối \(s.offline) lần. Xem ở Hoạt động thiết bị.")
                            .font(.footnote).multilineTextAlignment(.leading)
                    } icon: { Image(systemName: "eye.slash.fill").foregroundStyle(.orange) }
                }
                .buttonStyle(.plain)
            }
        }
        Section {
            Picker("Mức", selection: $level) { Text("Tất cả").tag("all"); Text("Cảnh báo").tag("warning"); Text("Nghiêm trọng").tag("critical") }
                .pickerStyle(.menu)
        }
        let list = (data?.incidents ?? []).filter { inDay($0.createdAt) }
        let rows = Dictionary(uniqueKeysWithValues: (log?.items ?? []).compactMap { r in r.incidentId.map { ($0, r) } })
        Section {
            if list.isEmpty {
                Label(pickedDay != nil ? "Không có sự cố trong ngày này" : "Không có sự cố trong \(days) ngày qua", systemImage: "checkmark.shield").foregroundStyle(.secondary)
            }
            ForEach(list) { inc in
                NavigationLink { NoirIncidentReport(incidentId: inc.id) } label: { NoirIncidentCard(inc: inc, row: rows[inc.id]) }
            }
        } footer: {
            if let s = stats {
                Text("Có người xem sau \(durationText(s.medianAckS)) · gửi tin sau \(durationText(s.medianNotifyS)) (trung vị).\(s.manualClose > 0 ? " \(s.manualClose) lần đóng thủ công." : "")")
            }
        }
    }

    // MARK: activity

    @ViewBuilder private var activityContent: some View {
        if let c = summary?.coverage {
            Section {
                CoverageCard(coverage: c)
            }
            .listRowBackground(Color.clear).listRowInsets(EdgeInsets())
        }
        Section {
            Picker("Loại", selection: $logKind) {
                Text("Tất cả").tag("all"); Text("Camera bị che").tag("camera_blocked"); Text("Mất kết nối").tag("device_offline"); Text("Video thử").tag("replay")
            }.pickerStyle(.menu)
        }
        let items = (log?.items ?? []).filter { inDay($0.startedAt) }
        if items.isEmpty {
            Section { Label("Không có hoạt động nào trong khoảng này", systemImage: "checkmark.shield").foregroundStyle(.secondary) }
        }
        ForEach(groupedByDay(items), id: \.key) { group in
            Section(group.title) {
                ForEach(group.items) { it in
                    Button { detailItem = it } label: { NoirActivityRow(item: it) }.buttonStyle(.plain)
                }
            }
        }
        if let log {
            Section {
                Label(log.chain.ok ? "Nhật ký nguyên vẹn, \(log.chain.checked) dòng niêm phong" : "Nhật ký có dấu hiệu bị sửa",
                      systemImage: log.chain.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundStyle(log.chain.ok ? Theme.green : Theme.red)
            } footer: { Text("\(log.note) Lưu \(log.retentionDays) ngày.") }
        }
        Section {
            DisclosureGroup("Dòng thời gian") {
                if let d = data, d.events.isEmpty { Text("Chưa có hoạt động.").foregroundStyle(.secondary) }
                ForEach(Array((data?.events ?? []).prefix(40).enumerated()), id: \.offset) { _, e in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack { Text(e.title).font(.body); Spacer(); Text(shortDate(e.at)).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                        Text(e.detail).font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func groupedByDay(_ items: [CabinLogItem]) -> [(key: Double, title: String, items: [CabinLogItem])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: items) { cal.startOfDay(for: Date(timeIntervalSince1970: $0.startedAt)).timeIntervalSince1970 }
        return groups.keys.sorted(by: >).map { k in (k, Self.dayTitle(k), groups[k]!) }
    }

    static func dayTitle(_ t: Double) -> String {
        let cal = Calendar.current, d = Date(timeIntervalSince1970: t)
        if cal.isDateInToday(d) { return "Hôm nay" }
        if cal.isDateInYesterday(d) { return "Hôm qua" }
        let f = DateFormatter(); f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "EEEE, dd/MM"
        return f.string(from: d).capitalized
    }

    private func load() async {
        guard let id = model.selected?.id else { loading = false; return }
        let param = seg == "alerts" ? "left_behind" : (logKind == "all" ? "activity" : logKind)
        log = try? await model.api.cabinLog(id, days: days, kind: param)
        summary = try? await model.api.logSummary(id, days: days)
        do { data = try await model.api.history(id, days: days, level: level); error = nil }
        catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        loading = false
    }
}

// MARK: - Day strip, coverage, cards

/// The 7 / 30 days (a bar a day) or 90 days (a bar a week): the bar height and colour say how bad the worst thing that day was. Tapping a day filters the lists.
private struct DayStrip: View {
    let days: [SummaryDay]
    @Binding var picked: Double?

    var body: some View {
        HStack(alignment: .bottom, spacing: days.count > 13 ? 2 : 6) {
            ForEach(Array(days.enumerated()), id: \.element.id) { idx, d in
                let sel = picked == d.start
                Button { picked = sel ? nil : d.start } label: {
                    VStack(spacing: 6) {
                        Spacer(minLength: 0)
                        RoundedRectangle(cornerRadius: 9, style: .continuous).fill(color(d.worst))
                            .frame(maxWidth: 36).frame(height: height(d.worst))
                            .overlay { if sel { RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Noir.accent, lineWidth: 2).padding(-3) } }
                        Text(showLabel(idx) ? (d.today ? "Nay" : d.label) : " ").font(.system(size: days.count > 13 ? 9 : 11)).foregroundStyle(d.today ? .primary : .secondary)
                            .lineLimit(1).minimumScaleFactor(0.6).fixedSize(horizontal: days.count > 13, vertical: false)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\((d.span ?? 1) > 1 ? "Tuần từ " : "")\(d.label)\(d.today ? " hôm nay" : ""): \(label(d))")
                .accessibilityAddTraits(sel ? .isSelected : [])
            }
        }
        .frame(height: 92)
    }

    /// 7 bars: every label. 30 daily bars: every 5th. 90 days (13 weekly bars): every 2nd.
    private func showLabel(_ i: Int) -> Bool { days.count <= 7 || (days.count > 13 ? (days.count - 1 - i) % 5 == 0 : (days.count - 1 - i) % 2 == 0) }
    private func color(_ w: String) -> Color { w == "critical" ? Theme.red : w == "warning" ? .orange : w == "notice" ? Color.orange.opacity(0.4) : Color.white.opacity(0.12) }
    private func height(_ w: String) -> CGFloat { w == "critical" ? 66 : w == "warning" ? 46 : w == "notice" ? 28 : 10 }
    private func label(_ d: SummaryDay) -> String { d.worst == "none" ? "không có gì" : d.worst == "notice" ? "có lúc không được giám sát" : "\(d.incidents) sự cố" }
}

private struct CoverageCard: View {
    let coverage: Coverage
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Thời gian được giám sát").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                Spacer(); BasisChip(basis: coverage.basis)
            }
            Text(String(format: "%.1f", coverage.pct).replacingOccurrences(of: ".", with: ",") + "%").font(.system(size: 38, weight: .bold, design: .rounded))
            Canvas { ctx, size in
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.green))
                for s in coverage.segments {
                    let x = size.width * s.from, w = max(3, size.width * (s.to - s.from))
                    ctx.fill(Path(CGRect(x: x, y: 0, width: w, height: size.height)), with: .color(s.kind == "device_offline" ? Color(white: 0.5) : Color.orange))
                }
            }
            .frame(height: 10).clipShape(Capsule())
            .accessibilityElement().accessibilityLabel("Giám sát \(Int(coverage.pct)) phần trăm thời gian, mất giám sát \(durationText(Double(coverage.lostS)))")
            HStack(spacing: 14) {
                legend(Theme.green, "Giám sát"); legend(.orange, "Camera bị che"); legend(.gray, "Mất kết nối")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .noirGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
    private func legend(_ c: Color, _ t: String) -> some View { HStack(spacing: 5) { Circle().fill(c).frame(width: 8, height: 8); Text(t).font(.caption).foregroundStyle(.secondary) } }
}

struct NoirIncidentCard: View {
    let inc: Incident
    let row: CabinLogItem?
    var body: some View {
        let open = inc.status == "open", crit = inc.level == "critical"
        let tone: Color = open ? (crit ? Theme.red : .orange) : Theme.green
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2).fill(tone).frame(width: 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(crit ? "Có thể có người trong xe" : "Cảnh báo cabin").font(.headline)
                    Spacer(minLength: 4)
                    Text(open ? "Đang mở" : (row?.outcome == "confirmed" ? "Đã kiểm tra" : row?.outcome == "manual_close" ? "Đóng thủ công" : "Đã đóng")).font(.caption.weight(.semibold))
                        .padding(.horizontal, 8).padding(.vertical, 3).background(tone.opacity(0.2), in: Capsule()).foregroundStyle(tone)
                }
                Text("\(inc.seatLabel.map { "\($0) · " } ?? "")\(shortDate(inc.createdAt))\(row.map { " · \(durationText(Double($0.durationS)))" } ?? "")")
                    .font(.footnote).foregroundStyle(.secondary)
                Text(inc.reason).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                HStack(spacing: 12) {
                    step(row?.notifyS != nil, row?.notifyS.map { "Gửi tin \(durationText($0))" } ?? "Chưa gửi được tin", tint: Noir.accent)
                    step(inc.viewedAt != nil, inc.viewedAt != nil ? "Xem sau \(durationText(row?.ackS ?? ((inc.viewedAt ?? 0) - inc.createdAt)))" : "Chưa ai xem", tint: Noir.accent)
                    step(!open, open ? "Đang mở" : "Đóng sau \(durationText(max(0, (inc.resolvedAt ?? inc.createdAt) - inc.createdAt)))", tint: Theme.green)
                }
                .font(.caption2).padding(.top, 2)
                if let b = row?.basis, b != "measured" { BasisChip(basis: b) }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func step(_ done: Bool, _ text: String, tint: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(done ? tint : Color.clear).overlay(Circle().strokeBorder(done ? tint : Color.orange, lineWidth: 1)).frame(width: 8, height: 8)
            Text(text).foregroundStyle(.secondary)
        }
    }
}

/// One row of the device-activity list. Only rows that are not real measurements wear a source chip, so "Mô phỏng" stands out.
struct NoirActivityRow: View {
    let item: CabinLogItem
    var body: some View {
        let isReplay = item.kind == "replay"
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(item.kind == "replay" ? Color.secondary : .orange)
                .frame(width: 34, height: 34).background(Color.white.opacity(0.08), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(isReplay ? "Video thử · \(item.clip ?? "")" : item.label).font(.body.weight(.semibold)).lineLimit(2)
                Text(subtitle).font(.footnote).foregroundStyle(.secondary)
                if isReplay { Text("\(durationText(Double(item.durationS))) trong video").font(.caption).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 4)
            if item.ongoing { Text("Đang mở").font(.caption.weight(.semibold)).foregroundStyle(Theme.red) }
            else if item.basis != "measured" { BasisChip(basis: item.basis) }
        }
        .accessibilityElement(children: .combine)
    }
    private var icon: String { item.kind == "camera_blocked" ? "eye.slash.fill" : item.kind == "device_offline" ? "wifi.slash" : "play.rectangle.fill" }
    private var subtitle: String {
        if item.kind == "replay" { return "\(item.outcomeLabel ?? "")\(item.confMax.map { " · độ tin cậy cao nhất \(Int($0 * 100))%" } ?? "")" }
        return "\(clock(item.startedAt).prefix(5)) → \(item.ongoing ? "đang diễn ra" : String(clock(item.endedAt).prefix(5))) · \(durationText(Double(item.durationS)))"
    }
}

struct NoirIncidentRow: View {
    let inc: Incident
    var body: some View {
        let st = LevelStyle.of(inc.level)
        HStack(spacing: 12) {
            Image(systemName: st.icon).symbolRenderingMode(.hierarchical).foregroundStyle(st.color).font(.title2).frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(inc.level == "critical" ? "Nghiêm trọng" : "Cảnh báo").font(.headline)
                Text(inc.reason).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                Text("\(shortDate(inc.createdAt)) · \(inc.status == "open" ? "Đang mở" : "Đã đóng bởi \(inc.resolvedBy ?? "—")")")
                    .font(.caption).foregroundStyle(inc.status == "open" ? Theme.red : Theme.green)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct NoirIncidentDetail: View {
    let incidentId: String
    @Environment(AppModel.self) private var model
    @State private var inc: Incident?

    var body: some View {
        List {
            if let inc {
                Section { NoirIncidentRow(inc: inc) }
                Section {
                    NavigationLink { NoirIncidentReport(incidentId: inc.id) } label: { Label("Báo cáo sự cố (thời lượng, gửi tin, kết quả)", systemImage: "doc.text.magnifyingglass") }
                }
                Section("Diễn biến") {
                    ForEach(inc.events ?? [], id: \.self) { e in
                        HStack(alignment: .top, spacing: 12) {
                            Text(clock(e.at)).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.body)
                                Text(e.detail).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if let esc = inc.escalation {
                    Section("Leo thang") {
                        ForEach(esc.steps) { s in
                            LabeledContent(s.title, value: s.state == "done" ? "Đã làm" : s.state == "stopped" ? "Đã dừng" : "Chưa tới")
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .noirList()
        .navigationTitle("Chi tiết sự cố").navigationBarTitleDisplayMode(.inline)
        .task { inc = try? await model.api.incident(incidentId) }
    }
}

/// The self-check opened from History: same screen as in the car menu, with its own stack for the "keep photo" step.
struct NoirSelfCheckEntry: View {
    @State private var keep = false
    var body: some View {
        NoirSelfCheck { keep = true }
            .navigationDestination(isPresented: $keep) { PhotoCaptureView() }
    }
}


// MARK: - Detail of one activity row

/// What one row of device activity says. For a replayed test video the log keeps only the result, never the pictures (SR-01).
struct NoirActivityDetail: View {
    let item: CabinLogItem
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    /// A test clip is looked up on this phone only: first inside the app, then in the app's Documents/clips folder.
    private var clipURL: URL? {
        guard let name = item.clip, !name.isEmpty else { return nil }
        let base = (name as NSString).deletingPathExtension
        if let u = Bundle.main.url(forResource: base, withExtension: "mp4") { return u }
        let doc = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("clips/\(base).mp4")
        return FileManager.default.fileExists(atPath: doc.path) ? doc : nil
    }
    var body: some View {
        NavigationStack {
            List {
                if item.kind == "replay" {
                    Section {
                        if let url = clipURL {
                            VideoPlayer(player: player ?? AVPlayer(url: url))
                                .frame(height: 260).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                                .onAppear { if player == nil { player = AVPlayer(url: url) } }
                                .onDisappear { player?.pause() }
                        } else {
                            Label("Video này không có trên máy. Chỉ có kết quả được ghi lại.", systemImage: "video.slash").foregroundStyle(.secondary)
                        }
                    } footer: { if clipURL != nil { Text("Video nằm trong app trên điện thoại này, không tải từ máy chủ.") } }
                }
                Section {
                    row("Loại", item.kind == "replay" ? "Video thử" : item.label)
                    if let c = item.clip, item.kind == "replay" { row("Tệp", c) }
                    row("Bắt đầu", when(item.startedAt))
                    row(item.kind == "replay" ? "Độ dài video" : "Thời lượng", item.ongoing ? "Đang diễn ra" : durationText(Double(item.durationS)))
                    if let o = item.outcomeLabel { row("Kết quả", o) }
                    if let c = item.confMax { row("Độ tin cậy cao nhất", "\(Int(c * 100))%") }
                    HStack { Text("Nguồn số liệu").foregroundStyle(.secondary); Spacer(); BasisChip(basis: item.basis) }
                    row("Niêm phong", item.sealed ? "Đã niêm phong" : "Chưa niêm phong")
                }
                Section {
                    Label(item.kind == "replay"
                          ? "Video thử được phát từ bản sao nằm trong app, không đi qua máy chủ. Nhật ký trên máy chủ chỉ giữ kết quả, không giữ video hay ảnh."
                          : "Nhật ký chỉ giữ thời điểm và thời lượng, không giữ hình ảnh.", systemImage: "lock.shield")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Chi tiết").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline) { Text(k).foregroundStyle(.secondary); Spacer(minLength: 12); Text(v).multilineTextAlignment(.trailing) }
    }
    private func when(_ t: Double) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "HH:mm · dd/MM/yyyy"
        return f.string(from: Date(timeIntervalSince1970: t))
    }
}
