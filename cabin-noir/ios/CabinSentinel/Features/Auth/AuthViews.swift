import SwiftUI
import UserNotifications

// MARK: - Welcome + phone login

struct WelcomeFlow: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            WelcomeView { path.append("phone") }
                .navigationDestination(for: String.self) { _ in PhoneLoginView() }
        }
    }
}

struct WelcomeView: View {
    var start: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("An tâm").font(.system(size: 44, weight: .bold))
                Text("mỗi chuyến đi").font(.system(size: 34, weight: .bold)).foregroundStyle(Theme.ink2)
            }
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24).padding(.top, 40)

            Image("car-vf8").resizable().scaledToFit().padding(.horizontal, 12).padding(.top, 8)

            VStack(alignment: .leading, spacing: 12) {
                Text("CabinSentinel báo cho bạn khi có thể có người hoặc thú cưng bị bỏ lại trong xe, và khi con bạn lên, xuống xe.")
                    .font(.system(size: 17)).foregroundStyle(Theme.ink2)
                Text("Ứng dụng hỗ trợ giám sát, không đảm bảo an toàn tuyệt đối.")
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 24)
            Spacer()
            Button("Bắt đầu", action: start).buttonStyle(PrimaryButtonStyle()).padding(.horizontal, 20).padding(.bottom, 12)
        }
        .screenBackground()
    }
}

struct PhoneLoginView: View {
    @Environment(AppModel.self) private var model
    @State private var phone = ""
    @State private var name = ""
    @State private var code = ""
    @State private var sent: OtpResponse?
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Bool

    private var digits: String { phone.filter(\.isNumber) }
    private var phoneOk: Bool { digits.count == 10 && digits.hasPrefix("0") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(sent == nil ? "Đăng nhập bằng số điện thoại" : "Nhập mã xác nhận")
                    .font(.system(size: 28, weight: .bold)).foregroundStyle(Theme.ink)
                Text(sent == nil ? "Chúng tôi gửi mã 6 số qua Telegram hoặc SMS. Không cần mật khẩu." : "Đã gửi mã tới \(digits). Mã hết hạn sau 5 phút.")
                    .font(.system(size: 16)).foregroundStyle(Theme.ink2)

                if sent == nil {
                    field("Số điện thoại", text: $phone, placeholder: "09xx xxx xxx", keyboard: .phonePad)
                        .focused($focus)
                } else {
                    field("Mã xác nhận", text: $code, placeholder: "6 chữ số", keyboard: .numberPad)
                        .focused($focus)
                    field("Tên hiển thị (nếu là tài khoản mới)", text: $name, placeholder: "Ví dụ: Lê Hoàng Minh", keyboard: .default)
                    if let link = sent?.telegram?.deepLink, let url = URL(string: link) {
                        VStack(alignment: .leading, spacing: 6) {
                            Link(destination: url) {
                                Label("Mở Telegram để nhận mã", systemImage: "paperplane.fill")
                                    .font(.system(size: 16, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 48)
                                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(Theme.ink)
                            }
                            Text("Đã liên kết Telegram thì mã tự gửi vào đó. Lần đầu: mở bot, bấm Start rồi chia sẻ số điện thoại để xác nhận số này là của bạn.")
                                .font(.system(size: 13)).foregroundStyle(Theme.muted)
                        }
                    }
                    if let dev = sent?.devCode {
                        HStack { DemoBadge(text: "Bản dùng thử"); Text("Mã: \(dev)").font(.system(size: 15, weight: .bold).monospacedDigit()) }
                            .onTapGesture { code = dev }
                    }
                    Button("Đổi số điện thoại") { sent = nil; code = "" }
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.ink)
                }
                if let error { Text(error).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.redDark) }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                Task { await submit() }
            } label: {
                if busy { ProgressView().tint(.white) } else { Text(sent == nil ? "Gửi mã" : "Xác nhận") }
            }
            .buttonStyle(PrimaryButtonStyle(enabled: sent == nil ? phoneOk : code.count == 6))
            .disabled(busy || (sent == nil ? !phoneOk : code.count != 6))
            .padding(.horizontal, 20).padding(.bottom, 8)
        }
        .screenBackground()
        .onAppear { focus = true }
        .onChange(of: phone) { if phone.filter(\.isNumber).count > 10 { phone = String(phone.filter(\.isNumber).prefix(10)) } }
        .onChange(of: code) { if code.count > 6 || code.contains(where: { !$0.isNumber }) { code = String(code.filter(\.isNumber).prefix(6)) } }
    }

    private func field(_ label: String, text: Binding<String>, placeholder: String, keyboard: UIKeyboardType) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2)
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .font(.system(size: 18, weight: .semibold))
                .padding(.horizontal, 14).frame(height: 54)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                
        }
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            if sent == nil {
                sent = try await model.api.sendOtp(phone: digits)
            } else {
                let auth = try await model.api.verify(phone: digits, code: code, name: name.trimmingCharacters(in: .whitespaces))
                await model.signedIn(auth)
            }
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}

// MARK: - Onboarding

struct OnboardingFlow: View {
    let step: OnboardingStep
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .purpose: PurposeView()
                #if PRODUCTION
                case .link: NoirAddVehicleView(onDone: { model.phase = .onboarding(.consent) })
                #else
                case .link: LinkVehicleView(onDone: { model.phase = .onboarding(.consent) })
                #endif
                case .consent: CameraConsentView()
                case .notifications: NotifyPermissionView()
                }
            }
            .screenBackground()
        }
    }
}

struct StepHeader: View {
    let index: Int
    let title: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                ForEach(1...4, id: \.self) { i in
                    Capsule().fill(i <= index ? Theme.primary : Theme.greyBg).frame(height: 4)
                }
            }
            Text("Bước \(index)/4 · \(title)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted)
        }
    }
}

struct PurposeView: View {
    #if PRODUCTION
    static let doLines = ["Cảnh báo khi có thể có người", "Báo khi con lên, xuống xe", "Báo khi thiết bị trong xe mất kết nối"]
    #else
    static let doLines = ["Cảnh báo khi có thể có người", "Xem camera khi có sự cố", "Bật điều hòa từ xa", "Báo khi con lên, xuống xe"]
    #endif

    @Environment(AppModel.self) private var model
    @State private var pick = "both"

    private let options: [(String, String, String, String)] = [
        ("cabin", "Bảo vệ người và thú cưng trong xe", "Cảnh báo khi có người hoặc thú cưng bị bỏ lại trong xe đã khóa.", "shield.lefthalf.filled"),
        ("school", "Theo dõi con đi học bằng xe", "Biết con đã lên xe, đã tới trường hay chưa.", "figure.and.child.holdinghands"),
        ("both", "Cả hai", "Phù hợp gia đình có trẻ nhỏ.", "checkmark.seal"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                StepHeader(index: 1, title: "Mục đích")
                Text("Bạn dùng CabinSentinel để làm gì?").font(.system(size: 28, weight: .bold))
                ForEach(options, id: \.0) { o in
                    Button { pick = o.0 } label: {
                        HStack(spacing: 14) {
                            Image(systemName: o.3).font(.system(size: 20)).frame(width: 48, height: 48)
                                .background(pick == o.0 ? Theme.primary : Theme.bg, in: Circle())
                                .foregroundStyle(pick == o.0 ? .white : Theme.ink)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(o.1).font(.system(size: 17, weight: .bold))
                                Text(o.2).font(.system(size: 14)).foregroundStyle(Theme.ink2)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: pick == o.0 ? "largecircle.fill.circle" : "circle").font(.system(size: 22))
                        }
                        .foregroundStyle(Theme.ink).multilineTextAlignment(.leading)
                        .padding(16)
                        .background(pick == o.0 ? Theme.card : Theme.card, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(pick == o.0 ? Theme.primary : .clear, lineWidth: 2))
                    }
                    .accessibilityAddTraits(pick == o.0 ? .isSelected : [])
                }
                HStack(alignment: .top, spacing: 10) {
                    doesBox(title: "Ứng dụng làm", color: Theme.green, bg: Theme.greenBg,
                            lines: Self.doLines)
                    doesBox(title: "Không làm", color: Theme.redDark, bg: Theme.redBg,
                            lines: ["Mở khóa xe", "Điều khiển còi, kính, ghế", "Nhận diện tên, tuổi", "Thay bạn kiểm tra xe"])
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            Button("Tiếp tục") {
                Task {
                    await model.updateSettings { $0.purpose = pick }
                    model.phase = .onboarding(.link)
                }
            }
            .buttonStyle(PrimaryButtonStyle()).padding(.horizontal, 20).padding(.bottom, 8)
        }
    }

    private func doesBox(title: String, color: Color, bg: Color, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(color)
            ForEach(lines, id: \.self) { Text("· \($0)").font(.system(size: 13)).foregroundStyle(Theme.ink) }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(bg, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct CameraConsentView: View {
    @Environment(AppModel.self) private var model
    @State private var a = false
    @State private var b = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                StepHeader(index: 3, title: "Quyền riêng tư")
                Text("Camera trong xe của bạn").font(.system(size: 28, weight: .bold))
                Text("Camera giúp biết có người hoặc thú cưng bị bỏ lại. Đọc kỹ trước khi đồng ý.")
                    .font(.system(size: 16)).foregroundStyle(Theme.ink2)
                #if PRODUCTION
                fact("Chỉ giám sát khi xe đang đỗ", "Tự tạm dừng khi xe chạy, hoặc khi bạn bấm Tạm dừng giám sát (tối đa 60 phút). Không ghi âm.")
                fact("Hình ảnh không rời khỏi thiết bị", "Thiết bị trong xe chỉ gửi kết quả nhận diện (ghế, độ tin cậy). Không lưu ảnh, không gửi ảnh.")
                fact("Mặt người được làm mờ", "Mặt bị làm mờ trên màn hình của thiết bị trong xe.")
                check("Tôi đồng ý cho camera phân tích hàng ghế sau khi xe đang đỗ", $a)
                #else
                fact("Chỉ giám sát khi xe đã đỗ và khóa", "Tự tắt khi xe chạy hoặc có tài xế. Không ghi âm.")
                fact("Không lưu ảnh khi không có sự cố", "Ảnh chỉ dùng để nhận diện người, thú cưng và đồ vật.")
                fact("Đèn báo trên thiết bị", "Xanh lá: đang giám sát. Xanh dương nhấp nháy: có người đang xem trực tiếp.")
                check("Tôi đồng ý cho camera phân tích hình ảnh cabin khi xe đã đỗ và khóa", $a)
                #endif
                check("Tôi sẽ báo cho hành khách biết trong xe có camera", $b)
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                Button("Đồng ý và tiếp tục") { model.phase = .onboarding(.notifications) }
                    .buttonStyle(PrimaryButtonStyle(enabled: a && b)).disabled(!(a && b))
                Button("Không dùng camera") { model.phase = .onboarding(.notifications) }
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.ink).frame(minHeight: 44)
            }
            .padding(.horizontal, 20).padding(.bottom, 4).background(Theme.bg)
        }
    }

    private func fact(_ t: String, _ b: String) -> some View {
        Card { Text(t).font(.system(size: 16, weight: .bold)); Text(b).font(.system(size: 14)).foregroundStyle(Theme.ink2) }
    }

    private func check(_ text: String, _ on: Binding<Bool>) -> some View {
        Button { on.wrappedValue.toggle() } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: on.wrappedValue ? "checkmark.square.fill" : "square").font(.system(size: 22))
                Text(text).font(.system(size: 15, weight: .semibold)).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.ink).padding(14)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(on.wrappedValue ? Theme.primary : Color.clear, lineWidth: 1.5))
        }
        .accessibilityAddTraits(on.wrappedValue ? .isSelected : [])
    }
}

struct NotifyPermissionView: View {
    @Environment(AppModel.self) private var model
    @State private var result: Bool?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                StepHeader(index: 4, title: "Thông báo")
                Image(systemName: "bell.badge.fill").font(.system(size: 30)).foregroundStyle(.white)
                    .frame(width: 64, height: 64).background(Theme.primary, in: Circle())
                Text("Cho phép CabinSentinel gửi thông báo").font(.system(size: 28, weight: .bold))
                Text("Không có quyền này, bạn chỉ thấy sự cố khi tự mở ứng dụng.").font(.system(size: 16)).foregroundStyle(Theme.ink2)
                tier("1", Theme.red, "Cảnh báo khẩn", "Khi có thể có người hoặc thú cưng bị bỏ lại. Lặp lại tới khi có người xử lý.")
                tier("2", Theme.blue, "Đưa đón và đồ vật", "Con lên, xuống xe; đồ còn trên xe sau khi khóa.")
                tier("3", Theme.muted, "Tình trạng thiết bị", "Camera bị che, mất kết nối, pin yếu.")
                if result == false {
                    ErrorBanner(message: "Thông báo đang tắt. Bật lại trong Cài đặt › CabinSentinel › Thông báo.")
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                if result == nil {
                    Button("Cho phép thông báo") { Task { await ask() } }.buttonStyle(PrimaryButtonStyle())
                    Button("Để sau") { model.phase = .main }.font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.ink).frame(minHeight: 44)
                } else {
                    Button("Vào trang chủ") { model.phase = .main }.buttonStyle(PrimaryButtonStyle())
                }
            }
            .padding(.horizontal, 20).padding(.bottom, 4).background(Theme.bg)
        }
    }

    private func tier(_ n: String, _ c: Color, _ t: String, _ b: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(n).font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 40, height: 40).background(c, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(t).font(.system(size: 16, weight: .bold))
                Text(b).font(.system(size: 14)).foregroundStyle(Theme.ink2)
            }
            Spacer(minLength: 0)
        }
        .padding(14).background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
    }

    private func ask() async {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        result = ok
    }
}
