import SwiftUI
import UniformTypeIdentifiers

// MARK: - Formatting

func durationText(_ seconds: Double?) -> String {
    guard let s = seconds else { return "–" }
    let n = Int(s.rounded())
    if n < 60 { return "\(n) giây" }
    if n < 3600 { let m = n / 60, r = n % 60; return r == 0 ? "\(m) phút" : "\(m) phút \(r) giây" }
    let h = n / 3600, m = Int((Double(n % 3600) / 60).rounded())
    return m == 0 ? "\(h) giờ" : "\(h) giờ \(m) phút"
}

func basisLabel(_ b: String) -> String {
    switch b { case "measured": "Đo thật"; case "simulated": "Mô phỏng"; default: "Chưa rõ nguồn" }
}

private func kindStyle(_ kind: String) -> (icon: String, color: Color) {
    switch kind {
    case "left_behind": ("figure.child.circle.fill", Theme.red)
    case "camera_blocked": ("eye.slash.fill", .orange)
    case "replay": ("play.rectangle.fill", .gray)
    default: ("wifi.slash", .gray)
    }
}

/// A small label that says where a number comes from. Never colour alone: the text is always there.
struct BasisChip: View {
    let basis: String
    var body: some View {
        Text(basisLabel(basis)).font(.caption2.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((basis == "measured" ? Theme.green : Color.gray).opacity(0.22), in: Capsule())
            .foregroundStyle(basis == "measured" ? Theme.green : Color.secondary)
    }
}

// MARK: - CSV share

/// The server-built CSV, fetched only when the person chooses to share it.
struct CabinCSV: Transferable {
    let api: APIClient; let vehicleId: String; let days: Int
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .commaSeparatedText) { c in
            let data = try await c.api.cabinLogCSV(c.vehicleId, days: c.days)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("nhat-ky-cabin-\(c.days)-ngay.csv")
            try data.write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

// MARK: - Log sections (used inside the History list)

enum LogMode { case alerts, activity }

/// One half of the cabin log. Alerts = left-behind episodes (someone has to act). Activity = camera blocked, connection lost, test videos.
struct NoirCabinLogSections: View {
    let log: CabinLog
    let mode: LogMode
    @Binding var kind: String
    let days: Int
    let vehicleId: String
    var onActivity: () -> Void = {}
    @Environment(AppModel.self) private var model

    var body: some View {
        let s = log.stats
        Section {
            if mode == .alerts {
                statRow("Lần bỏ quên", "\(s.leftBehind)", sub: "\(s.critical) nghiêm trọng · \(s.open) đang mở", tint: s.critical > 0 ? Theme.red : nil)
                statRow("Đóng thủ công", "\(s.manualClose)", sub: "Hệ thống vẫn thấy người nhưng đã có người xác nhận", tint: nil)
                statRow("Có người xem sau", durationText(s.medianAckS), sub: "Trung vị, từ lúc báo", tint: nil)
                statRow("Gửi tin sau", durationText(s.medianNotifyS), sub: "Trung vị, từ lúc phát hiện", tint: nil)
                // Camera blocked and lost connection mean "not monitored", so they are never buried in the other half.
                if s.cameraBlocked + s.offline > 0 {
                    Button(action: onActivity) {
                        Label {
                            Text("Có lúc xe không được giám sát: camera bị che \(s.cameraBlocked) lần (\(durationText(s.cameraBlockedMin * 60))), mất kết nối \(s.offline) lần (\(durationText(s.offlineMin * 60))). Xem ở Hoạt động thiết bị.")
                                .font(.footnote).multilineTextAlignment(.leading)
                        } icon: { Image(systemName: "eye.slash.fill").foregroundStyle(.orange) }
                    }
                    .buttonStyle(.plain)
                }
            } else {
                statRow("Camera bị che", "\(s.cameraBlocked) lần", sub: "Tổng \(durationText(s.cameraBlockedMin * 60))", tint: s.cameraBlocked > 0 ? .orange : nil)
                statRow("Mất kết nối", "\(s.offline) lần", sub: "Tổng \(durationText(s.offlineMin * 60))", tint: nil)
            }
            HStack(spacing: 6) {
                ForEach(s.basis, id: \.self) { BasisChip(basis: $0) }
                Spacer(minLength: 0)
            }
            Label(log.chain.ok ? "Nhật ký nguyên vẹn (\(log.chain.checked) dòng niêm phong)" : "Nhật ký có dấu hiệu bị sửa",
                  systemImage: log.chain.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.footnote).foregroundStyle(log.chain.ok ? Theme.green : Theme.red)
        } header: { Text("\(mode == .alerts ? "Các lần bỏ quên" : "Hoạt động thiết bị") · \(days) ngày") }

        Section {
            if mode == .activity {
                Picker("Loại", selection: $kind) {
                    Text("Tất cả").tag("all"); Text("Camera bị che").tag("camera_blocked"); Text("Mất kết nối").tag("device_offline"); Text("Video thử").tag("replay")
                }.pickerStyle(.menu)
            }
            if log.items.isEmpty {
                Label(mode == .alerts ? "Không có lần bỏ quên nào trong khoảng này" : "Không có hoạt động nào trong khoảng này", systemImage: "checkmark.shield").foregroundStyle(.secondary)
            }
            ForEach(log.items) { item in
                if let iid = item.incidentId {
                    NavigationLink { NoirIncidentReport(incidentId: iid) } label: { NoirLogRow(item: item) }
                } else {
                    NoirLogRow(item: item)
                }
            }
        } header: { Text(mode == .alerts ? "Danh sách" : "Các lần xảy ra") } footer: {
            Text("\(log.note) Lưu \(log.retentionDays) ngày.")
        }

        if model.selected?.role == "owner" || model.selected?.role == "confirm" {
            Section {
                ShareLink(item: CabinCSV(api: model.api, vehicleId: vehicleId, days: days), preview: SharePreview("Nhật ký cabin (CSV)")) {
                    Label("Tải nhật ký (CSV)", systemImage: "square.and.arrow.up")
                }
            }
        }
    }

    private func statRow(_ title: String, _ value: String, sub: String, tint: Color?) -> some View {
        LabeledContent {
            Text(value).font(.headline.monospacedDigit()).foregroundStyle(tint ?? .primary)
        } label: {
            VStack(alignment: .leading, spacing: 1) { Text(title); Text(sub).font(.caption).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
    }
}

struct NoirLogRow: View {
    let item: CabinLogItem
    var body: some View {
        let st = kindStyle(item.kind)
        HStack(spacing: 12) {
            Image(systemName: st.icon).symbolRenderingMode(.hierarchical).foregroundStyle(st.color).font(.title2).frame(width: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(item.label)\(item.seatLabel.map { " · \($0)" } ?? "")").font(.headline).lineLimit(2)
                Text("\(shortDate(item.startedAt)) → \(item.ongoing ? "đang diễn ra" : clock(item.endedAt).prefix(5).description) · \(durationText(Double(item.durationS)))")
                    .font(.footnote).foregroundStyle(.secondary)
                if let clip = item.clip {
                    Text("Clip: \(clip)\(item.confMax.map { " · độ tin cậy cao nhất \(Int($0 * 100))%" } ?? "") · thời lượng trong video")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                HStack(spacing: 6) {
                    if item.ongoing { Text("Đang mở").font(.caption.weight(.semibold)).foregroundStyle(Theme.red) }
                    else if let o = item.outcomeLabel, !o.isEmpty { Text(o).font(.caption).foregroundStyle(.secondary) }
                    BasisChip(basis: item.basis)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Incident report

struct NoirIncidentReport: View {
    let incidentId: String
    @Environment(AppModel.self) private var model
    @State private var report: IncidentReport?
    @State private var error: String?

    var body: some View {
        List {
            if let r = report {
                let inc = r.incident
                Section {
                    Text(inc.reason).font(.headline)
                    HStack(spacing: 6) {
                        Text(inc.level == "critical" ? "Nghiêm trọng" : "Cảnh báo").font(.caption.weight(.semibold))
                            .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.red.opacity(0.22), in: Capsule()).foregroundStyle(Theme.red)
                        if let b = r.log?.basis { BasisChip(basis: b) }
                        Text(inc.status == "open" ? "Đang mở" : "Đã đóng").font(.caption).foregroundStyle(.secondary)
                    }
                    LabeledContent("Bắt đầu", value: shortDate(inc.createdAt))
                    LabeledContent("Thời lượng", value: durationText(Double(r.log?.durationS ?? inc.elapsed)))
                    if let o = r.log?.outcomeLabel, !o.isEmpty { LabeledContent("Kết quả", value: o) }
                    LabeledContent("Gửi tin sau", value: durationText(r.deliveries.first { $0.kind == "level" && $0.status == "ok" }?.delayS))
                    LabeledContent("Có người xem sau", value: durationText(r.log?.ackS))
                    if let by = inc.viewedBy { LabeledContent("Người xem", value: by) }
                    if let t = inc.cabinTemp { LabeledContent("Nhiệt độ cabin", value: "\(Int(t.rounded()))°C") }
                }
                Section("Diễn biến") {
                    ForEach(inc.events ?? [], id: \.self) { e in
                        HStack(alignment: .top, spacing: 12) {
                            Text(clock(e.at).prefix(5).description).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 2) { Text(e.title); Text(e.detail).font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                }
                Section("Thông báo đã gửi") {
                    if r.deliveries.isEmpty { Text("Không có bản ghi gửi tin (đã quá 30 ngày hoặc chưa gửi).").foregroundStyle(.secondary) }
                    ForEach(r.deliveries, id: \.self) { d in
                        LabeledContent {
                            Text(d.status == "ok" ? "Đã gửi" : d.status == "failed" ? "Lỗi" : "Bỏ qua")
                                .foregroundStyle(d.status == "ok" ? Theme.green : d.status == "failed" ? Theme.red : .secondary)
                        } label: {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(deliveryName(d.kind))
                                Text("\(clock(d.at).prefix(5)) · sau \(durationText(d.delayS)) · \(d.detail)").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section {
                    NoirObsBars(points: r.observations)
                } header: { Text("Camera thấy gì trong sự cố") } footer: { Text(r.notes) }
                if !r.related.isEmpty {
                    Section("Cùng thời điểm") { ForEach(r.related) { NoirLogRow(item: $0) } }
                }
                Section {
                    Label(r.chain.ok ? "Nhật ký xe nguyên vẹn: \(r.chain.checked) dòng niêm phong." : "Chuỗi niêm phong không khớp, nhật ký có thể đã bị sửa.",
                          systemImage: r.chain.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(r.chain.ok ? Theme.green : Theme.red)
                    ShareLink(item: summary(r), subject: Text("Báo cáo sự cố Cabin Noir")) { Label("Chia sẻ báo cáo", systemImage: "square.and.arrow.up") }
                }
            } else if let error {
                ContentUnavailableView { Label("Không mở được báo cáo", systemImage: "wifi.exclamationmark") } description: { Text(error) }
                    .listRowBackground(Color.clear)
            } else {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .noirList()
        .navigationTitle("Báo cáo sự cố").navigationBarTitleDisplayMode(.inline)
        .task {
            do { report = try await model.api.incidentReport(incidentId) }
            catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        }
    }

    private func deliveryName(_ k: String) -> String {
        ["level": "Thông báo đầu tiên", "repeat": "Nhắc lại", "resolved": "Báo đã đóng", "sms": "SMS", "call": "Gọi tự động", "contacts": "SMS người liên hệ"][k] ?? k
    }

    /// Plain text for the share sheet: counts, times and outcome. No images, no child names.
    private func summary(_ r: IncidentReport) -> String {
        let inc = r.incident
        var lines = ["Báo cáo sự cố Cabin Noir", inc.reason, "Mã: \(inc.id)", "Bắt đầu: \(shortDate(inc.createdAt))",
                     "Thời lượng: \(durationText(Double(r.log?.durationS ?? inc.elapsed)))", "Mức: \(inc.level == "critical" ? "Nghiêm trọng" : "Cảnh báo")",
                     "Nguồn số liệu: \(basisLabel(r.log?.basis ?? "unknown"))"]
        if let o = r.log?.outcomeLabel, !o.isEmpty { lines.append("Kết quả: \(o)") }
        for e in inc.events ?? [] { lines.append("\(clock(e.at).prefix(5)) \(e.title)") }
        lines.append("Cabin Noir chỉ giám sát, không điều khiển xe.")
        return lines.joined(separator: "\n")
    }
}

/// Counts over time, no images. Bars with the camera not seeing are drawn thin and grey.
struct NoirObsBars: View {
    let points: [ObsPoint]
    var body: some View {
        if points.isEmpty {
            Text("Nhật ký quan sát chi tiết đã hết hạn lưu (7 ngày) hoặc chưa có.").font(.footnote).foregroundStyle(.secondary)
        } else {
            let peak = max(1, points.map { $0.people + $0.pets }.max() ?? 1)
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(Array(points.enumerated()), id: \.offset) { _, p in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(p.cameraOk == 1 ? Theme.red : Color.gray.opacity(0.5))
                        .frame(maxWidth: 14, minHeight: 4)
                        .frame(height: max(4, CGFloat(p.people + p.pets) / CGFloat(peak) * 56))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .bottomLeading)
            .accessibilityElement().accessibilityLabel("Số người và thú cưng camera thấy trong suốt sự cố, cao nhất \(peak)")
        }
    }
}

// MARK: - Overview (the top of the History tab)

/// All your vehicles at once; tapping a vehicle makes it the one shown in the log below. Not the admin console.
struct NoirOverviewSections: View {
    let data: Overview
    @Environment(AppModel.self) private var model

    var body: some View {
        if data.vehicles.isEmpty {
            Section { Text("Thêm xe để xem tổng quan.").foregroundStyle(.secondary) }
        } else {
            totals(data)
            Section {
                ForEach(data.vehicles) { v in
                    Button { model.selectedId = v.vehicleId } label: { vehicleRow(v) }.buttonStyle(.plain)
                }
            } header: { Text("Từng xe (xe cần chú ý xếp trước)") } footer: {
                Text("\(data.note) Chỉ có số lượng, nhãn ghế và thời lượng. Không có ảnh và không hiện tên bé.")
            }
        }
    }

    @ViewBuilder private func totals(_ o: Overview) -> some View {
        let t = o.total
        Section {
            row("Sự cố bỏ quên", "\(t.leftBehind)", "\(t.critical) nghiêm trọng · \(t.open) đang mở", t.open > 0 ? Theme.red : nil)
            row("Đóng thủ công", "\(t.manualClose)", "Hệ thống vẫn thấy người nhưng đã có người xác nhận", nil)
            row("Camera bị che", "\(t.cameraBlocked) lần", "Tổng \(durationText(t.cameraBlockedMin * 60))", t.cameraBlocked > 0 ? .orange : nil)
            row("Mất kết nối", "\(t.offline) lần", "Tổng \(durationText(t.offlineMin * 60))", nil)
            row("Có người xem sau", durationText(t.medianAckS), "Trung vị", nil)
            row("Gửi tin sau", durationText(t.medianNotifyS), "Trung vị, từ lúc phát hiện", nil)
            HStack(spacing: 6) { ForEach(o.basis, id: \.self) { BasisChip(basis: $0) }; Spacer(minLength: 0) }
        } header: { Text("Tổng quan · \(t.vehicles) xe · \(o.days) ngày qua") }
    }

    private func row(_ title: String, _ value: String, _ sub: String, _ tint: Color?) -> some View {
        LabeledContent {
            Text(value).font(.headline.monospacedDigit()).foregroundStyle(tint ?? .primary)
        } label: {
            VStack(alignment: .leading, spacing: 1) { Text(title); Text(sub).font(.caption).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
    }

    private func vehicleRow(_ v: OverviewVehicle) -> some View {
        let picked = v.vehicleId == model.selected?.id
        return HStack(spacing: 12) {
            Image(systemName: "car.fill").foregroundStyle(v.open > 0 ? Theme.red : .secondary).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(v.name) · \(v.plate)").font(.headline)
                Text("\(v.leftBehind) bỏ quên (\(v.critical) nghiêm trọng) · che camera \(durationText(v.cameraBlockedMin * 60)) · mất kết nối \(durationText(v.offlineMin * 60))")
                    .font(.footnote).foregroundStyle(.secondary)
                Text(v.open > 0 ? "\(v.open) đang mở" : v.device.known ? (v.device.online ? "Thiết bị trực tuyến" : "Thiết bị ngoại tuyến") : "Chưa có thiết bị")
                    .font(.caption.weight(.semibold)).foregroundStyle(v.open > 0 ? Theme.red : v.device.online ? Theme.green : .secondary)
            }
            Spacer(minLength: 0)
            if picked { Image(systemName: "checkmark.circle.fill").foregroundStyle(Noir.accent).accessibilityLabel("Đang xem xe này") }
        }
        .accessibilityElement(children: .combine)
    }
}
