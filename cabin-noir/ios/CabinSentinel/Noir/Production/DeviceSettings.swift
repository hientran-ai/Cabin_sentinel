import SwiftUI

/// Settings of the in-car screen. Everything here is local to this device.
struct NoirDeviceSettings: View {
    @Environment(DeviceModel.self) private var device
    @Environment(\.dismiss) private var dismiss
    var onUnpair: () -> Void

    var body: some View {
        @Bindable var d = device
        NavigationStack {
            Form {
                Section {
                    Picker("Hướng màn hình", selection: $d.orientationPref) {
                        ForEach(OrientationPref.allCases) { Text($0.title).tag($0) }
                    }
                    Toggle("Làm mờ mặt trên màn hình", isOn: $d.coverFaces)
                    Toggle("Hiện khung nhận diện", isOn: $d.showBoxes)
                    Toggle("Đảo trái phải", isOn: Binding(get: { device.sensor.mirrored }, set: { device.sensor.mirrored = $0 }))
                    Picker("Tự làm tối màn hình", selection: $d.autoDimMinutes) {
                        Text("Không").tag(0); Text("Sau 1 phút").tag(1); Text("Sau 5 phút").tag(5); Text("Sau 10 phút").tag(10)
                    }
                } header: { Text("Màn hình") } footer: {
                    Text("Đặt điện thoại nằm ngang gần gương chiếu hậu thì chọn Ngang. Làm tối màn hình không dừng giám sát, chỉ giảm nóng và pin.")
                }

                Section {
                    Picker("Chế độ ban đêm", selection: $d.nightPref) {
                        ForEach(NightPref.allCases) { Text($0.title).tag($0) }
                    }.pickerStyle(.segmented)
                    LabeledContent("Độ sáng màn hình ban đêm") {
                        Slider(value: $d.nightBrightness, in: 0.02...0.6).frame(maxWidth: 180)
                    }
                    LabeledContent("Độ sáng cảnh", value: "\(Int(device.sensor.lightLevel * 100))%")
                    LabeledContent("Trạng thái", value: device.night ? "Đang bật" : "Đang tắt")
                } header: { Text("Ban đêm") } footer: {
                    Text("Ban đêm: camera phơi sáng lâu hơn (khoảng 15 hình/giây), hình được làm sáng trước khi nhận diện, màn hình tối đi để không chói mắt tài xế. Tự động theo mặt trời tại vị trí xe. iPhone không có đèn hồng ngoại: trong bóng tối hoàn toàn camera vẫn không thấy gì, khi đó app hiện Thiếu sáng, chủ xe thấy Chưa thể đánh giá, không bao giờ hiện là an toàn. Không dùng đèn pin để khỏi làm trẻ thức giấc.")
                }

                if device.sensor.lensesAvailable.count > 1 {
                    Section {
                        Picker("Ống kính", selection: $d.lens) {
                            Text("Chính").tag(PhoneSensor.Lens.wide)
                            Text("Góc rộng 0,5×").tag(PhoneSensor.Lens.ultra)
                        }.pickerStyle(.segmented)
                    } header: { Text("Camera") } footer: {
                        Text("Góc rộng thấy đủ 3 ghế sau khi đặt gần gương, nhưng thu sáng kém hơn ống kính chính vào ban đêm.")
                    }
                }

                Section {
                    Toggle("Nhắc kiểm tra ghế sau khi đỗ xe", isOn: $d.rearReminder)
                } header: { Text("Nhắc nhở") } footer: {
                    Text("Khi xe vừa chạy xong và đỗ lại mà camera thấy người hoặc thú cưng ở ghế sau, thiết bị kêu 3 tiếng và hiện nhắc nhở. Đây chỉ là lời nhắc thêm, không thay cho cảnh báo gửi tới chủ xe.")
                }

                Section {
                    Button("Ngắt ghép nối thiết bị này", role: .destructive, action: onUnpair)
                }
            }
            .noirList().navigationTitle("Cài đặt").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}
