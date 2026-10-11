import SwiftUI

/// What the camera sees in the cabin right now, by seat. An estimate from the in-car camera, never a guarantee.
struct NoirCabinGlance: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    private var fresh: Bool {
        guard let s = model.status else { return false }
        return !s.restricted && s.verdict?.current != false && s.noRealData != true && s.seats != nil && (s.camera ?? "ok") == "ok"
    }

    var body: some View {
        NavigationStack {
            List {
                if !fresh {
                    Section {
                        Label("Chưa có dữ liệu mới từ camera trong xe, nên chưa thể nói trong xe có gì. Đây không phải là xe trống.", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.orange)
                    }
                } else if let s = model.status {
                    Section("Người và thú cưng") {
                        let who = (s.seats ?? []).filter(\.occ)
                        if who.isEmpty { Text("Camera chưa thấy ai ở hàng ghế sau.").foregroundStyle(.secondary) }
                        ForEach(who) { seat in
                            HStack {
                                Image(systemName: icon(seat))
                                    .foregroundStyle(Theme.red).frame(width: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(seat.label).font(.body.weight(.semibold))
                                    Text(describe(seat)).font(.footnote).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(Int(seat.conf * 100))%").font(.body.monospacedDigit().weight(.bold))
                            }
                        }
                    }
                    Section("Đồ vật") {
                        let items = s.items ?? []
                        if items.isEmpty { Text("Camera chưa thấy đồ vật.").foregroundStyle(.secondary) }
                        ForEach(Array(items.enumerated()), id: \.offset) { _, it in
                            HStack {
                                Image(systemName: "backpack.fill").foregroundStyle(Noir.accent).frame(width: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(it.name).font(.body.weight(.semibold))
                                    Text(seatName(it.seat)).font(.footnote).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(Int(it.conf * 100))%").font(.body.monospacedDigit().weight(.bold))
                            }
                        }
                    }
                }
                Section {} footer: {
                    Text("Ước tính từ camera, có thể sót hoặc nhầm, nhất là khi thiếu sáng hoặc bị che. Nhãn trẻ em chỉ là gợi ý và không làm giảm mức cảnh báo. Mục không thấy gì không có nghĩa là xe an toàn.")
                }
            }
            .noirList().navigationTitle("Trong xe").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() } } }
        }
    }

    private func icon(_ s: Seat) -> String {
        if s.kind == "pet" { return "pawprint.fill" }
        return s.age == "child" ? "figure.child" : "person.fill"
    }

    private func describe(_ s: Seat) -> String {
        let base = s.kind == "pet" ? "Thú cưng" : "Người"
        return s.kind == "pet" ? base : (s.age == "child" ? "\(base), có thể là trẻ em" : base)
    }
    private func seatName(_ key: String) -> String { ["rear_left": "Ghế sau trái", "rear_mid": "Ghế sau giữa", "rear_right": "Ghế sau phải"][key] ?? key }
}
