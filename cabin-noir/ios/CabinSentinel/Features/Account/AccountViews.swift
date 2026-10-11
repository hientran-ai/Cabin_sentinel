import SwiftUI

struct AccountView: View {
    @Environment(AppModel.self) private var model
    @State private var editingName = false
    @State private var name = ""
    @State private var confirmLogout = false
    @State private var toast: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text(String((model.me?.name ?? "?").prefix(1))).font(.system(size: 22, weight: .bold)).foregroundStyle(Theme.primary)
                            .frame(width: 56, height: 56).background(Theme.card, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.me?.name ?? "—").font(.system(size: 18, weight: .bold))
                            Text(model.me?.phone ?? "").font(.system(size: 14)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button("Sửa") { name = model.me?.name ?? ""; editingName = true }.font(.system(size: 15, weight: .bold))
                    }
                }
                Section("Xe của tôi") {
                    ForEach(model.vehicles) { v in
                        HStack(spacing: 12) {
                            CarPicture(vehicle: v.vehicle).frame(width: 64, height: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.vehicle.name).font(.system(size: 16, weight: .bold))
                                Text("\(v.vehicle.plate) · \(roleLabels[v.role] ?? v.role)").font(.system(size: 13)).foregroundStyle(Theme.muted)
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
                    NavigationLink { LinkVehicleView(onDone: {}) } label: { Label("Liên kết xe mới", systemImage: "plus.circle") }
                }
                Section("Gia đình và thiết bị") {
                    NavigationLink { FamilyView() } label: { Label("Gia đình", systemImage: "person.3") }
                    NavigationLink { ChildrenView() } label: { Label("Các bé", systemImage: "figure.and.child.holdinghands") }
                    NavigationLink { DeviceHealthView() } label: { Label("Thiết bị và bảo vệ", systemImage: "checkmark.shield") }
                    if model.status?.role == "owner" {
                        NavigationLink { PhoneSensorView() } label: { Label("Điện thoại làm camera trong xe", systemImage: "camera.viewfinder") }
                    }
                    NavigationLink { ContactsView() } label: { Label("Người liên hệ khẩn cấp", systemImage: "phone.badge.waveform") }
                }
                if let s = model.settings {
                    Section {
                        Toggle("Cảnh báo mức Cảnh báo", isOn: bind(\.notifyWarning, s))
                        Toggle("Đưa đón, đồ vật, thiết bị", isOn: bind(\.notifyInfo, s))
                        Toggle("Nhắc kiểm tra ghế sau khi rời xe", isOn: bind(\.exitReminder, s))
                        Toggle("Tự bật làm mát khi Nghiêm trọng", isOn: bind(\.autoCool, s))
                        NavigationLink { EscalationView() } label: { Text("Khi không nhận được thông báo") }
                    } header: { Text("Thông báo và tự động") } footer: {
                        Text("Cảnh báo Nghiêm trọng luôn bật. Tự bật làm mát: khi có sự cố Nghiêm trọng và cabin trên 35°C, xe làm mát về 20°C trong 20 phút.")
                    }
                    Section {
                        Picker("Mục đích", selection: Binding(get: { s.purpose }, set: { v in Task { await model.updateSettings { $0.purpose = v } } })) {
                            Text("Bảo vệ trong xe").tag("cabin"); Text("Đưa đón con").tag("school"); Text("Cả hai").tag("both")
                        }
                        Toggle("Chế độ dùng thử", isOn: bind(\.demoMode, s))
                    } header: { Text("Ứng dụng") } footer: {
                        Text("Dùng thử: xe, cảnh báo và chuyến đi do mô phỏng tạo ra. Thực tế: dùng GPS, camera và kênh thời gian thực của điện thoại, không có nút giả lập.")
                    }
                }
                Section {
                    @Bindable var model = model
                    TextField("http://127.0.0.1:8000", text: $model.serverURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let t = model.lastUpdated { Text("Cập nhật lần cuối \(clock(t.timeIntervalSince1970))").font(.system(size: 13)).foregroundStyle(Theme.muted) }
                } header: { Text("Máy chủ") } footer: {
                    Text("Trên iPhone thật, nhập địa chỉ máy tính chạy backend trong cùng mạng Wi‑Fi, ví dụ http://192.168.1.10:8000.")
                }
                Section {
                    NavigationLink { HelpView() } label: { Label("Trợ giúp", systemImage: "questionmark.circle") }
                    Button("Đăng xuất", role: .destructive) { confirmLogout = true }
                } footer: {
                    Text("CabinSentinel 2.0 · giám sát cabin và điều hòa từ xa, không mở khóa xe.\nẢnh xe: VinFast VF 8 · Alexander-93 và VF 6 · Ethan Llamas, Wikimedia Commons (CC BY-SA 4.0); đã tách nền, đổi màu.")
                }
            }
            .scrollContentBackground(.hidden).screenBackground()
            .navigationTitle("Tài khoản")
            .alert("Đổi tên hiển thị", isPresented: $editingName) {
                TextField("Tên", text: $name)
                Button("Lưu") {
                    Task {
                        do {
                            let m = try await model.api.updateName(name.trimmingCharacters(in: .whitespaces))
                            model.me = m
                        } catch { toast = (error as? APIError)?.message }
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

// MARK: - Family

struct FamilyView: View {
    @Environment(AppModel.self) private var model
    @State private var members: [Member] = []
    @State private var inviting = false
    @State private var editing: Member?
    @State private var toast: String?

    private var isOwner: Bool { model.selected?.role == "owner" }

    var body: some View {
        List {
            Section {
                ForEach(members) { m in
                    HStack(spacing: 12) {
                        Text(String(m.name.prefix(1))).font(.system(size: 17, weight: .bold)).foregroundStyle(Theme.primary)
                            .frame(width: 44, height: 44).background(Theme.card, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.name).font(.system(size: 16, weight: .bold))
                            Text(roleLabels[m.role] ?? m.role).font(.system(size: 14)).foregroundStyle(Theme.ink2)
                            if m.status == "pending" { Text("Đã mời · chờ đăng nhập bằng \(m.phone)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.orange) }
                        }
                        Spacer()
                        if isOwner && m.role != "owner" { Button("Sửa") { editing = m }.font(.system(size: 14, weight: .bold)).buttonStyle(.borderless) }
                    }
                }
            } header: { Text(model.selected?.vehicle.name ?? "") } footer: {
                Text("Mỗi người có tài khoản riêng và nhận cảnh báo trên điện thoại của họ. Không quyền nào mở khóa được xe.")
            }
            if isOwner {
                Section { Button { inviting = true } label: { Label("Mời người thân", systemImage: "person.badge.plus") } }
            }
            Section("Mỗi quyền làm được gì") {
                ForEach(["confirm", "view", "school"], id: \.self) { r in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(roleLabels[r]!).font(.system(size: 15, weight: .bold))
                        Text(roleDescriptions[r]!).font(.system(size: 14)).foregroundStyle(Theme.ink2)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle("Gia đình").navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $inviting) { MemberSheet(member: nil) { members = $0; toast = "Đã gửi lời mời" } }
        .sheet(item: $editing) { m in MemberSheet(member: m) { members = $0; toast = "Đã lưu" } }
        .toast($toast)
    }

    private func load() async {
        guard let id = model.selected?.id else { return }
        do { members = try await model.api.members(id) } catch { toast = (error as? APIError)?.message }
    }
}

struct MemberSheet: View {
    let member: Member?
    var onSaved: ([Member]) -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var phone = ""
    @State private var role = "view"
    @State private var error: String?
    @State private var confirmRemove = false

    var body: some View {
        NavigationStack {
            Form {
                if member == nil {
                    TextField("Tên người thân", text: $name)
                    TextField("Số điện thoại", text: $phone).keyboardType(.phonePad)
                }
                Section("Quyền") {
                    Picker("Quyền", selection: $role) {
                        ForEach(["confirm", "view", "school"], id: \.self) { Text(roleLabels[$0]!).tag($0) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                    Text(roleDescriptions[role] ?? "").font(.system(size: 14)).foregroundStyle(Theme.ink2)
                }
                if let error { Text(error).foregroundStyle(Theme.redDark) }
                if member != nil {
                    Button("Xóa khỏi gia đình", role: .destructive) { confirmRemove = true }
                }
            }
            .navigationTitle(member == nil ? "Mời người thân" : "Quyền của \(member!.name)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(member == nil ? "Gửi lời mời" : "Lưu") { Task { await save() } } }
            }
            .confirmationDialog("Xóa \(member?.name ?? "") khỏi gia đình?", isPresented: $confirmRemove, titleVisibility: .visible) {
                Button("Xóa", role: .destructive) { Task { await remove() } }
            } message: { Text("Người này không còn nhận cảnh báo của xe.") }
            .onAppear { if let m = member { role = m.role } }
        }
    }

    private func save() async {
        guard let vid = model.selected?.id else { return }
        do {
            let list = member == nil
                ? try await model.api.invite(vid, name: name.trimmingCharacters(in: .whitespaces), phone: phone.filter(\.isNumber), role: role)
                : try await model.api.setRole(vid, member: member!.id, role: role)
            onSaved(list); dismiss()
        } catch { self.error = (error as? APIError)?.message }
    }

    private func remove() async {
        guard let vid = model.selected?.id, let m = member else { return }
        do { onSaved(try await model.api.removeMember(vid, member: m.id)); dismiss() } catch { self.error = (error as? APIError)?.message }
    }
}

// MARK: - Children

struct ChildrenView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: Child?
    @State private var adding = false

    private let seatName = ["left": "Ghế sau trái", "mid": "Ghế sau giữa", "right": "Ghế sau phải"]

    var body: some View {
        List {
            Section {
                ForEach(model.children) { c in
                    Button { editing = c } label: {
                        HStack(spacing: 12) {
                            Text(String(c.name.prefix(1))).font(.system(size: 18, weight: .bold)).foregroundStyle(Theme.primary)
                                .frame(width: 44, height: 44).background(Theme.card, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.name).font(.system(size: 16, weight: .bold))
                                Text("\(c.cls.isEmpty ? "Chưa nhập lớp" : c.cls) · \(seatName[c.seat] ?? "")").font(.system(size: 13)).foregroundStyle(Theme.ink2)
                                Text("Đón \(c.pickup), về \(c.dropoff) · \(daysText(c.days))").font(.system(size: 13)).foregroundStyle(Theme.muted)
                            }
                        }
                        .foregroundStyle(Theme.ink)
                    }
                }
                if model.children.count < 4 { Button { adding = true } label: { Label("Thêm bé", systemImage: "plus.circle") } }
            } footer: {
                Text("Ứng dụng không lưu ảnh, ngày sinh hay số định danh của bé, và không nhận ra bé nào. Hai bé ngồi chung xe thì chọn hai ghế khác nhau để thông báo nêu đúng tên.")
            }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle("Các bé").navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { ChildSheet(child: $0) }
        .sheet(isPresented: $adding) { ChildSheet(child: nil) }
        .task { await model.reloadChildren() }
    }
}

func daysText(_ d: [Int]) -> String {
    let names = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
    if d.sorted() == [0, 1, 2, 3, 4] { return "T2–T6" }
    return d.sorted().compactMap { $0 < names.count ? names[$0] : nil }.joined(separator: ", ")
}

struct ChildSheet: View {
    let child: Child?
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var cls = ""
    @State private var seat = "left"
    @State private var pickup = Calendar.current.date(from: DateComponents(hour: 6, minute: 45)) ?? Date()
    @State private var dropoff = Calendar.current.date(from: DateComponents(hour: 16, minute: 30)) ?? Date()
    @State private var days: Set<Int> = [0, 1, 2, 3, 4]
    @State private var error: String?
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Tên gọi", text: $name)
                    TextField("Lớp hoặc trường", text: $cls)
                }
                Section("Ghế bé thường ngồi") {
                    Picker("Ghế", selection: $seat) { Text("Sau trái").tag("left"); Text("Sau giữa").tag("mid"); Text("Sau phải").tag("right") }
                        .pickerStyle(.segmented)
                    if let clash = model.children.first(where: { $0.seat == seat && $0.id != child?.id }) {
                        Text("Ghế này đang là ghế của \(clash.name).").font(.system(size: 14)).foregroundStyle(Theme.orange)
                    }
                }
                Section("Lịch đưa đón") {
                    DatePicker("Giờ đón", selection: $pickup, displayedComponents: .hourAndMinute)
                    DatePicker("Giờ về", selection: $dropoff, displayedComponents: .hourAndMinute)
                    HStack(spacing: 6) {
                        ForEach(0..<7, id: \.self) { i in
                            let on = days.contains(i)
                            Button(["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]) { if on { days.remove(i) } else { days.insert(i) } }
                                .font(.system(size: 13, weight: .bold)).foregroundStyle(on ? .white : Theme.ink)
                                .frame(maxWidth: .infinity, minHeight: 38).background(on ? Theme.primary : Theme.card, in: Capsule())
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.redDark) }
                if child != nil { Button("Xóa bé", role: .destructive) { confirmDelete = true } }
            }
            .navigationTitle(child == nil ? "Thêm bé" : "Thông tin của \(child!.name)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Lưu") { Task { await save() } }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || days.isEmpty) }
            }
            .confirmationDialog("Xóa \(child?.name ?? "")?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Xóa", role: .destructive) { Task { await delete() } }
            } message: { Text("Lịch đưa đón của bé cũng bị xóa.") }
            .onAppear(perform: fill)
        }
    }

    private func hm(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    private func date(_ s: String) -> Date {
        let p = s.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(from: DateComponents(hour: p.first ?? 0, minute: p.last ?? 0)) ?? Date()
    }

    private func fill() {
        guard let c = child else {
            seat = ["left", "right", "mid"].first { s in !model.children.contains { $0.seat == s } } ?? "left"
            return
        }
        name = c.name; cls = c.cls; seat = c.seat; pickup = date(c.pickup); dropoff = date(c.dropoff); days = Set(c.days)
    }

    private func save() async {
        let body = APIClient.ChildBody(name: name.trimmingCharacters(in: .whitespaces), cls: cls.trimmingCharacters(in: .whitespaces), seat: seat,
                                       pickup: hm(pickup), dropoff: hm(dropoff), days: days.sorted())
        do {
            model.children = child == nil ? try await model.api.addChild(body) : try await model.api.editChild(child!.id, body)
            await model.tick()
            dismiss()
        } catch { self.error = (error as? APIError)?.message }
    }

    private func delete() async {
        guard let c = child else { return }
        do { model.children = try await model.api.deleteChild(c.id); await model.tick(); dismiss() } catch { self.error = (error as? APIError)?.message }
    }
}

// MARK: - Contacts

struct ContactsView: View {
    @Environment(AppModel.self) private var model
    @State private var contacts: [Contact] = []
    @State private var name = ""
    @State private var rel = ""
    @State private var phone = ""
    @State private var error: String?

    var body: some View {
        List {
            Section {
                ForEach(contacts) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(c.name) (\(c.rel))").font(.system(size: 16, weight: .bold))
                        Text(c.phone).font(.system(size: 14).monospacedDigit()).foregroundStyle(Theme.ink2)
                    }
                }
                .onDelete { idx in
                    Task {
                        for i in idx { contacts = (try? await model.api.deleteContact(contacts[i].id)) ?? contacts }
                    }
                }
            } header: { Text("\(contacts.count)/3 người") } footer: {
                Text("Nhận SMS khi sự cố chưa được xử lý sau 90 giây, ở cả mức Cảnh báo và Nghiêm trọng. Họ không cần cài ứng dụng.")
            }
            if contacts.count < 3 {
                Section("Thêm người liên hệ") {
                    TextField("Họ tên", text: $name)
                    TextField("Quan hệ, ví dụ: Bố", text: $rel)
                    TextField("Số điện thoại", text: $phone).keyboardType(.phonePad)
                    Button("Thêm") {
                        Task {
                            do {
                                contacts = try await model.api.addContact(name: name, rel: rel.isEmpty ? "Người thân" : rel, phone: phone.filter(\.isNumber))
                                name = ""; rel = ""; phone = ""; error = nil
                            } catch { self.error = (error as? APIError)?.message }
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || phone.filter(\.isNumber).count < 10)
                    if let error { Text(error).foregroundStyle(Theme.redDark) }
                }
            }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle("Người liên hệ khẩn cấp").navigationBarTitleDisplayMode(.inline)
        .task { contacts = (try? await model.api.contacts()) ?? [] }
    }
}

// MARK: - Help

struct HelpView: View {
    private let faq: [(String, String)] = [
        ("Ứng dụng có mở khóa xe không?", "Không. Ứng dụng chỉ giám sát và bật điều hòa từ xa. Khi thấy người trong xe, hãy đến xe hoặc gọi 112."),
        ("“Đã xem” khác “Tôi đã kiểm tra xe” thế nào?", "“Đã xem” chỉ dừng leo thang và báo bạn đã đọc; sự cố vẫn mở. Chỉ “Tôi đã kiểm tra xe” mới đóng sự cố, và hệ thống kiểm tra lại dữ liệu mới nhất trước khi đóng."),
        ("Vì sao xác nhận bị từ chối?", "Có thể dữ liệu đã cũ, sự cố vừa thay đổi, camera bị che hoặc hệ thống vẫn thấy người trong xe. Màn xác nhận nói rõ lý do và việc cần làm."),
        ("Thông báo có tới khi tôi tắt ứng dụng?", "Bản dùng thử hiện chỉ báo khi ứng dụng đang mở. Bản phát hành dùng thông báo đẩy và SMS, gọi điện dự phòng."),
        ("Ứng dụng có nhận ra con tôi?", "Không. Hệ thống chỉ biết có một trẻ ở ghế đã đăng ký, trong giờ đưa đón. Không nhận diện khuôn mặt, không lưu ảnh."),
    ]

    var body: some View {
        List {
            Section("Khẩn cấp") {
                Link("Gọi 112 · Cứu nạn", destination: URL(string: "tel:112")!).foregroundStyle(Theme.redDark)
                Link("Gọi 115 · Cấp cứu y tế", destination: URL(string: "tel:115")!).foregroundStyle(Theme.redDark)
            }
            Section("Câu hỏi thường gặp") {
                ForEach(faq, id: \.0) { q in
                    DisclosureGroup(q.0) { Text(q.1).font(.system(size: 15)).foregroundStyle(Theme.ink2) }
                }
            }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle("Trợ giúp").navigationBarTitleDisplayMode(.inline)
    }
}
