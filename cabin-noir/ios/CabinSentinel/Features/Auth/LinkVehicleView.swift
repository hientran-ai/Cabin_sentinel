import SwiftUI

struct LinkVehicleView: View {
    var onDone: () -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var start: LinkStart?
    @State private var otp = ""
    @State private var name = ""
    @State private var color = "white"
    @State private var busy = false
    @State private var error: String?

    private let colors: [(String, String, Color)] = [("white", "Trắng", .white), ("black", "Đen", Color(hex: 0x141416)), ("red", "Đỏ", Theme.red)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.phase != .main { StepHeader(index: 2, title: "Liên kết xe") }
                Text(start == nil ? "Liên kết xe của bạn" : "Xác nhận và đặt tên xe").font(.system(size: 28, weight: .bold))
                if let start {
                    Card {
                        Text(start.model).font(.system(size: 18, weight: .bold))
                        Text("\(start.plate) · đọc từ thiết bị").font(.system(size: 15)).foregroundStyle(Theme.ink2)
                    }
                    Image(carName).resizable().scaledToFit().frame(height: 150).frame(maxWidth: .infinity)
                    label("Mã xác nhận gửi tới số của bạn")
                    input("6 chữ số", $otp, .numberPad)
                    if let dev = start.devCode {
                        HStack { DemoBadge(text: "Bản dùng thử"); Text("Mã: \(dev)").font(.system(size: 15, weight: .bold).monospacedDigit()) }
                            .onTapGesture { otp = dev }
                    }
                    label("Tên xe")
                    input("Ví dụ: SUV gia đình", $name, .default)
                    label("Màu xe")
                    HStack(spacing: 10) {
                        ForEach(colors, id: \.0) { c in
                            Button { color = c.0 } label: {
                                HStack(spacing: 8) {
                                    Circle().fill(c.2).frame(width: 22, height: 22)
                                    Text(c.1).font(.system(size: 15, weight: .bold))
                                }
                                .foregroundStyle(Theme.ink).frame(maxWidth: .infinity, minHeight: 48)
                                .background(color == c.0 ? Theme.card : Theme.card, in: Capsule())
                                .overlay(Capsule().strokeBorder(color == c.0 ? Theme.primary : Color.clear, lineWidth: 1.5))
                            }
                            .accessibilityAddTraits(color == c.0 ? .isSelected : [])
                        }
                    }
                } else {
                    Text("Nhập mã in trên thiết bị CabinSentinel gắn trong xe. Mã có dạng CS-XXX-2026.")
                        .font(.system(size: 16)).foregroundStyle(Theme.ink2)
                    input("CS-VF8-2026", $code, .asciiCapable).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    if model.demo || model.phase != .main {
                        VStack(alignment: .leading, spacing: 6) {
                            DemoBadge(text: "Mã thử")
                            ForEach(["CS-VF8-2026", "CS-VF6-2026", "CS-VF9-2026"], id: \.self) { c in
                                Button(c) { code = c }.font(.system(size: 15, weight: .bold).monospaced()).foregroundStyle(Theme.ink)
                            }
                        }
                    }
                }
                if let error { Text(error).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.redDark) }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                Task { await submit() }
            } label: {
                if busy { ProgressView().tint(.white) } else { Text(start == nil ? "Kiểm tra thiết bị" : "Liên kết xe") }
            }
            .buttonStyle(PrimaryButtonStyle(enabled: canSubmit)).disabled(!canSubmit || busy)
            .padding(.horizontal, 20).padding(.bottom, 8).background(Theme.bg)
        }
        .screenBackground()
        .onChange(of: otp) { if otp.count > 6 || otp.contains(where: { !$0.isNumber }) { otp = String(otp.filter(\.isNumber).prefix(6)) } }
    }

    private var carName: String {
        guard let start else { return "car-vf8" }
        if start.model.contains("VF 6") { return "car-vf6" }
        return color == "red" ? "car-vf8-red" : color == "black" ? "car-vf8-black" : "car-vf8"
    }

    private var canSubmit: Bool {
        start == nil ? code.trimmingCharacters(in: .whitespaces).count >= 6 : (otp.count == 6 && !name.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    private func label(_ t: String) -> some View { Text(t).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2) }

    private func input(_ p: String, _ t: Binding<String>, _ k: UIKeyboardType) -> some View {
        TextField(p, text: t).keyboardType(k).font(.system(size: 18, weight: .semibold))
            .padding(.horizontal, 14).frame(height: 54)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
            
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            if let s = start {
                let st = try await model.api.linkConfirm(challenge: s.challengeId, code: otp, name: name.trimmingCharacters(in: .whitespaces), color: color)
                try? await model.loadAccount()
                await model.select(st.vehicle.id)
                onDone()
                if model.phase == .main { dismiss() }
            } else {
                let s = try await model.api.linkStart(code: code.trimmingCharacters(in: .whitespaces))
                start = s
                name = s.suggestedName
            }
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}
