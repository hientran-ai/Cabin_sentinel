import SwiftUI
import AVFoundation
import PhotosUI

/// Capture (or pick) → preview → Retake / Send. Nothing leaves the phone until the user taps Send.
struct PhotoCaptureView: View {
    @Environment(AppModel.self) private var model
    @State private var camera = CameraManager()
    @State private var picked: PhotosPickerItem?
    @State private var photo: UIImage?
    @State private var uploading = false
    @State private var toast: String?
    @State private var error: String?
    @State private var sent = false

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFit()
                } else if camera.state == .running {
                    PreviewLayer(session: camera.session)
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: camera.state == .denied ? "camera.badge.ellipsis" : "camera").font(.system(size: 36))
                        Text(placeholder).multilineTextAlignment(.center).font(.system(size: 15, weight: .semibold))
                    }.foregroundStyle(.white).padding(24)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .padding(16)

            VStack(spacing: 12) {
                if let error { ErrorBanner(message: error) }
                if sent {
                    Label("Đã gửi ảnh vào nhật ký xe", systemImage: "checkmark.circle.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(Theme.green)
                }
                if photo != nil {
                    Button { Task { await upload() } } label: { if uploading { ProgressView().tint(.white) } else { Text("Gửi ảnh") } }
                        .buttonStyle(PrimaryButtonStyle()).disabled(uploading || sent)
                    Button("Chụp lại") { photo = nil; sent = false; error = nil; Task { await camera.start() } }
                        .buttonStyle(SecondaryButtonStyle()).disabled(uploading)
                } else {
                    Button { Task { await shoot() } } label: { Text("Chụp ảnh") }
                        .buttonStyle(PrimaryButtonStyle(enabled: camera.state == .running)).disabled(camera.state != .running)
                    PhotosPicker(selection: $picked, matching: .images) { Text(libraryLabel) }
                        .buttonStyle(SecondaryButtonStyle())
                }
                Text("Ảnh chỉ được gửi sau khi bạn bấm Gửi ảnh.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 16).padding(.bottom, 8)
            Spacer(minLength: 0)
        }
        .screenBackground()
        .navigationTitle("Gửi ảnh").navigationBarTitleDisplayMode(.inline)
        .toast($toast)
        .task { await camera.start() }
        .onDisappear { camera.stop() }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) { photo = img; sent = false; error = nil; camera.stop() }
                else { error = "Không đọc được ảnh này. Chọn ảnh khác." }
                picked = nil
            }
        }
    }

    private var libraryLabel: String { camera.state == .unavailable ? "Chọn ảnh từ thư viện" : "Hoặc chọn từ thư viện" }

    private var placeholder: String {
        switch camera.state {
        case .denied: return "Chưa được cấp quyền camera. Bật trong Cài đặt › CabinSentinel, hoặc chọn ảnh từ thư viện."
        case .unavailable: return "Máy này không có camera (Simulator). Hãy chọn ảnh từ thư viện."
        default: return "Đang mở camera…"
        }
    }

    private func shoot() async {
        guard let data = await camera.capture(), let img = UIImage(data: data) else { error = "Chụp không thành công. Thử lại."; return }
        photo = img; camera.stop()
    }

    private func upload() async {
        guard let id = model.selected?.id, let data = photo?.jpegForUpload() else { error = "Chưa có xe hoặc ảnh."; return }
        uploading = true; error = nil
        defer { uploading = false }
        do { _ = try await model.api.uploadPhoto(data, vehicle: id); sent = true; toast = "Đã gửi ảnh" }
        catch { self.error = (error as? APIError)?.message ?? "Không gửi được ảnh." }
    }
}
