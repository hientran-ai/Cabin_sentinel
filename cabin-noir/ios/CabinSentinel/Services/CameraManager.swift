@preconcurrency import AVFoundation
import UIKit
import Observation

/// Still-photo capture with AVFoundation. Authorization is requested when `start()` is called.
@MainActor
@Observable
final class CameraManager: NSObject {
    enum State { case idle, running, denied, unavailable }

    let session = AVCaptureSession()
    private(set) var state: State = .idle
    private let output = AVCapturePhotoOutput()
    private var configured = false
    private var continuation: CheckedContinuation<Data?, Never>?

    func start() async {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) ?? AVCaptureDevice.default(for: .video) else {
            state = .unavailable; return
        }
        guard await AVCaptureDevice.requestAccess(for: .video) else { state = .denied; return }
        if !configured {
            guard let input = try? AVCaptureDeviceInput(device: device) else { state = .unavailable; return }
            session.beginConfiguration()
            session.sessionPreset = .photo
            if session.canAddInput(input) { session.addInput(input) }
            if session.canAddOutput(output) { session.addOutput(output) }
            session.commitConfiguration()
            configured = true
        }
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { s.startRunning() }
        state = .running
    }

    func stop() {
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { s.stopRunning() }
        if state == .running { state = .idle }
    }

    /// JPEG bytes of one frame, or nil if capture failed. Nothing is uploaded here.
    func capture() async -> Data? {
        await withCheckedContinuation { c in
            continuation = c
            output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }
}

extension CameraManager: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let data = error == nil ? photo.fileDataRepresentation() : nil
        Task { @MainActor in
            self.continuation?.resume(returning: data)
            self.continuation = nil
        }
    }
}

extension UIImage {
    /// Downscaled JPEG so uploads stay small on mobile data.
    func jpegForUpload(maxSide: CGFloat = 1600, quality: CGFloat = 0.8) -> Data? {
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let img = UIGraphicsImageRenderer(size: target).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return img.jpegData(compressionQuality: quality)
    }
}
