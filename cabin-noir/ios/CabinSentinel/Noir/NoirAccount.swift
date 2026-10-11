import SwiftUI

/// Tài khoản: native grouped List. Sub-screens (Gia đình, Các bé, Liên hệ, Trợ giúp) are the shared List screens.
struct NoirAccount: View {
    @Environment(AppModel.self) private var model
    @State private var editingName = false
    @State private var name = ""
    @State private var confirmLogout = false
    @State private var toast: String?
    @AppStorage(NoirHome.toolbarKey) private var classicToolbar = NoirHome.defaultClassic

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Text(String((model.me?.name ?? "?").prefix(1))).font(.title2.bold()).foregroundStyle(Noir.accent)
                            .frame(width: 56, height: 56).background(.quaternary, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.me?.name ?? "—").font(.headline)
                            Text(model.me?.phone ?? "").font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Sửa") { name = model.me?.name ?? ""; editingName = true }.buttonStyle(.borderless)
                    }
                }
                Section("Xe của tôi") {
                    ForEach(model.vehicles) { v in
                        HStack(spacing: 12) {
                            CarPicture(vehicle: v.vehicle).frame(width: 64, height: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.vehicle.name).font(.headline)
                                Text("\(v.vehicle.plate) · \(roleLabels[v.role] ?? v.role)").font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions {
                            Button(v.role == "owner" ? "Hủy liên kết" : "Rời xe", role: .destructive) {
                                Task {
                                    do { try await model.api.unlink(v.id); try await model.loadAccount(); toast = "Đã hủy liên kết \(v.vehicle.name)" }
                                    catch { toast = (error as? APIError)?.message }
                                }
                            }
                        }
                    }
                    #if PRODUCTION
                    NavigationLink { NoirAddVehicleView(onDone: {}) } label: { Label("Thêm xe mới", systemImage: "plus.circle") }
                    #else
                    NavigationLink { LinkVehicleView(onDone: {}) } label: { Label("Liên kết xe mới", systemImage: "plus.circle") }
                    #endif
                }
                Section("Gia đình và thiết bị") {
                    NavigationLink { FamilyView() } label: { Label("Gia đình", systemImage: "person.3") }
                    NavigationLink { ChildrenView() } label: { Label("Các bé", systemImage: "figure.and.child.holdinghands") }
                    NavigationLink { NoirDevice() } label: { Label("Thiết bị và bảo vệ", systemImage: "checkmark.shield") }
                    #if PRODUCTION
                    NavigationLink { NoirDevices() } label: { Label("Thiết bị trong xe", systemImage: "camera.viewfinder") }
                    NavigationLink { NoirPushSetup() } label: { Label("Thông báo đẩy", systemImage: "bell.badge") }
                    #else
                    if model.status?.role == "owner" {
                        NavigationLink { NoirCamera() } label: { Label("Điện thoại làm camera trong xe", systemImage: "camera.viewfinder") }
                    }
                    #endif
                    NavigationLink { ContactsView() } label: { Label("Người liên hệ khẩn cấp", systemImage: "phone.badge.waveform") }
                }
                if let s = model.settings {
                    Section {
                        Toggle("Cảnh báo mức Cảnh báo", isOn: bind(\.notifyWarning, s))
                        Toggle("Đưa đón, đồ vật, thiết bị", isOn: bind(\.notifyInfo, s))
                        Toggle("Nhắc kiểm tra ghế sau khi rời xe", isOn: bind(\.exitReminder, s))
                        #if !PRODUCTION
                        Toggle("Tự bật làm mát khi Nghiêm trọng", isOn: bind(\.autoCool, s))
                        #endif
                        NavigationLink { NoirEscalation() } label: { Text("Khi không nhận được thông báo") }
                    } header: { Text("Thông báo và tự động") } footer: {
                        Text("Cảnh báo Nghiêm trọng luôn bật. Tự bật làm mát: khi có sự cố Nghiêm trọng và cabin trên 35°C, xe làm mát về 20°C trong 20 phút.")
                    }
                    Section {
                        Picker("Mục đích", selection: Binding(get: { s.purpose }, set: { v in Task { await model.updateSettings { $0.purpose = v } } })) {
                            Text("Bảo vệ trong xe").tag("cabin"); Text("Đưa đón con").tag("school"); Text("Cả hai").tag("both")
                        }
                        #if !PRODUCTION
                        Toggle("Chế độ dùng thử", isOn: bind(\.demoMode, s))
                        #endif
                    } header: { Text("Ứng dụng") } footer: {
                        #if PRODUCTION
                        Text("Dữ liệu xe và cảnh báo đến từ thiết bị đặt trong xe. Không có dữ liệu mô phỏng.")
                        #else
                        Text("Dùng thử: xe, cảnh báo và chuyến đi do mô phỏng tạo ra. Thực tế: dùng GPS, camera và kênh thời gian thực của điện thoại, không có nút giả lập.")
                        #endif
                    }
                }
                Section {
                    Toggle("Thanh trên cùng kiểu cũ", isOn: $classicToolbar)
                } header: { Text("Giao diện") } footer: {
                    Text("Bật: chuông thông báo và menu. Tắt: hai nút trẻ em và đồ vật kèm số.")
                }
                Section {
                    @Bindable var model = model
                    #if PRODUCTION
                    NavigationLink { NoirServerSettings() } label: { LabeledContent("Địa chỉ", value: URL(string: model.serverURL)?.host ?? model.serverURL) }
                    #else
                    TextField("http://127.0.0.1:8000", text: $model.serverURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    #endif
                    if let t = model.lastUpdated { Text("Cập nhật lần cuối \(clock(t.timeIntervalSince1970))").font(.footnote).foregroundStyle(.secondary) }
                } header: { Text("Máy chủ") } footer: {
                    Text("Trên iPhone thật, nhập địa chỉ máy tính chạy backend trong cùng mạng Wi‑Fi, ví dụ http://192.168.1.10:8000.")
                }
                Section {
                    NavigationLink { HelpView() } label: { Label("Trợ giúp", systemImage: "questionmark.circle") }
                    Button("Đăng xuất", role: .destructive) { confirmLogout = true }
                } footer: {
                    Text("CabinSentinel 2.0 · giám sát cabin và điều hòa từ xa, không mở khóa xe.\nẢnh xe: VinFast VF 8 · Alexander-93 và VF 6 · Ethan Llamas, Wikimedia Commons (CC BY-SA 4.0); đã tách nền, đổi màu. Biểu tượng chữ V: Wikimedia Commons.")
                }
            }
            .noirList()
            .navigationTitle("Tài khoản")
            .alert("Đổi tên hiển thị", isPresented: $editingName) {
                TextField("Tên", text: $name)
                Button("Lưu") {
                    Task {
                        do { model.me = try await model.api.updateName(name.trimmingCharacters(in: .whitespaces)) }
                        catch { toast = (error as? APIError)?.message }
                    }
                }
                Button("Hủy", role: .cancel) {}
            }
            .confirmationDialog("Đăng xuất khỏi CabinSentinel?", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("Đăng xuất", role: .destructive) { Task { await model.signOut() } }
            } message: { Text("Bạn sẽ không nhận cảnh báo trên điện thoại này cho tới khi đăng nhập lại.") }
            .toast($toast)
        }
    }

    private func bind(_ key: WritableKeyPath<UserSettings, Bool>, _ s: UserSettings) -> Binding<Bool> {
        Binding(get: { s[keyPath: key] }, set: { v in Task { await model.updateSettings { $0[keyPath: key] = v } } })
    }
}
