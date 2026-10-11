@preconcurrency import AVFoundation
import Vision
import CoreLocation
import Observation
import UIKit
import CoreImage

/// Test-only sensor: the phone's camera and GPS stand in for the in-car device.
/// Frames never leave the phone; only seat, confidence, age hint and coordinates are sent.
///
/// Performance: the preview is AVCaptureVideoPreviewLayer (runs at the camera's native rate, independent of
/// detection). Detection runs on its own serial queue as fast as the model allows, late frames are dropped,
/// and the UI is refreshed at most ~15 times per second so SwiftUI never becomes the bottleneck.
@Observable
final class PhoneSensor: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, CLLocationManagerDelegate {
    struct Seen: Hashable { var seat: String; var kind: String; var name: String; var conf: Double; var age: String; var box = CGRect.zero }

    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "phone.sensor", qos: .userInitiated)
    private let location = CLLocationManager()
    @ObservationIgnored private let faceFinder = FaceFinder()
    @ObservationIgnored private let ageModel = CoreMLAgeClassifier()   // nil until CabinAge.mlpackage is bundled
    @ObservationIgnored private var ageBySeat: [String: String] = [:]
    @ObservationIgnored private var ageBusy = false
    @ObservationIgnored private let ageLock = NSLock()
    @ObservationIgnored private let ageQueue = DispatchQueue(label: "phone.sensor.age", qos: .utility)
    @ObservationIgnored private var frameNo = 0
    @ObservationIgnored private var darkSince: Date?
    @ObservationIgnored private var lastPublish = Date.distantPast
    @ObservationIgnored private var lastFrameAt = Date()
    @ObservationIgnored private var emaMs = 0.0
    @ObservationIgnored private var emaFps = 0.0
    @ObservationIgnored private var smoothed: [String: Seen] = [:]
    @ObservationIgnored private var faceCache: [CGRect] = []
    @ObservationIgnored private var device: AVCaptureDevice?
    @ObservationIgnored private var lastAspect: CGFloat = 0
    @ObservationIgnored private var nightOn = false          // read on the capture queue
    @ObservationIgnored private var ambient = 0.3            // smoothed brightness of the raw frame, 0...1
    @ObservationIgnored private let ciContext = CIContext()
    @ObservationIgnored private var pool: CVPixelBufferPool?
    @ObservationIgnored private var poolSize = CGSize.zero

    let detector: Detector = DetectorFactory.make()
    var cameraState = "idle"          // idle, running, denied, unavailable
    var mirrored = true               // phone faces the rear row from the front: image-left = car's right
    var covered = false
    var dets: [Det] = []              // raw boxes of the latest frame, for the overlay
    var faces: [CGRect] = []          // hidden on screen when "che mặt" is on
    var seen: [String: Seen] = [:]    // smoothed occupants and items
    var latencyMs = 0
    var aspect: CGFloat = 3.0 / 4     // width / height of the upright image, so boxes line up with the preview
    var fps = 0
    var coord: CLLocationCoordinate2D?
    var accuracy: Double?
    var speed: Double = 0            // m/s from GPS, -1 when unknown is mapped to 0
    var locationDenied = false
    var interface: UIInterfaceOrientation = .portrait
    var night = false                // night mode: longer exposure, brighter image for the detector
    var lightLevel = 1.0             // brightness of the raw camera frame, 0 (black) ... 1
    var lens: Lens = .wide
    var lensesAvailable: [Lens] {
        #if targetEnvironment(macCatalyst)
        [.wide]
        #else
        AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) == nil ? [.wide] : [.wide, .ultra]
        #endif
    }

    enum Lens: String, CaseIterable { case wide, ultra }

    /// How the phone is held decides how the sensor's landscape buffer is turned upright, for both the preview and Vision.
    /// A Mac webcam delivers upright frames, so nothing changes there.
    func setInterface(_ o: UIInterfaceOrientation) {
        guard !VisionOrientation.onMac else { return }
        #if !targetEnvironment(macCatalyst)
        let v: CGImagePropertyOrientation
        switch o {
        case .portrait: v = .right
        case .portraitUpsideDown: v = .left
        case .landscapeRight: v = .up
        case .landscapeLeft: v = .down
        default: return
        }
        VisionOrientation.set(v); interface = o
        #endif
    }

    /// Rotation for the preview layer's connection (nil on Mac).
    var previewRotation: CGFloat? {
        #if targetEnvironment(macCatalyst)
        nil
        #else
        switch interface { case .portrait: return 90; case .portraitUpsideDown: return 270; case .landscapeRight: return 0; case .landscapeLeft: return 180; default: return 90 }
        #endif
    }

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func start() async {
        location.requestWhenInUseAuthorization()
        location.startUpdatingLocation()
        guard let dev = Self.camera(for: lens) else { cameraState = "unavailable"; return }
        guard await AVCaptureDevice.requestAccess(for: .video) else { cameraState = "denied"; return }
        guard session.inputs.isEmpty, let input = try? AVCaptureDeviceInput(device: dev) else { if !session.inputs.isEmpty { run() }; return }
        session.beginConfiguration()
        // 640x480 is plenty for detection and keeps every per-frame conversion cheap.
        session.sessionPreset = session.canSetSessionPreset(.vga640x480) ? .vga640x480 : .medium
        if session.canAddInput(input) { session.addInput(input) }
        let out = AVCaptureVideoDataOutput()
        out.alwaysDiscardsLateVideoFrames = true
        out.setSampleBufferDelegate(self, queue: queue)
        if session.canAddOutput(out) { session.addOutput(out) }
        session.commitConfiguration()
        device = dev
        applyNight()
        run()
    }

    private static func camera(for lens: Lens) -> AVCaptureDevice? {
        #if !targetEnvironment(macCatalyst)
        if lens == .ultra, let d = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) { return d }
        #endif
        return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) ?? AVCaptureDevice.default(for: .video)
    }

    /// Swap the lens while running (ultra-wide sees all three rear seats from near the mirror).
    func setLens(_ l: Lens) {
        lens = l
        guard cameraState == "running", let dev = Self.camera(for: l), dev != device, let input = try? AVCaptureDeviceInput(device: dev) else { return }
        queue.async {
            self.session.beginConfiguration()
            for i in self.session.inputs { self.session.removeInput(i) }
            if self.session.canAddInput(input) { self.session.addInput(input) }
            self.session.commitConfiguration()
            self.device = dev
            self.applyNight()
        }
    }

    /// Night mode: the camera is asked for more light (longer exposure at ~15 fps, +exposure bias, low-light boost where the
    /// device has it) and the detector gets a brightened copy of the frame. No torch is used: it would wake a child and dazzle the driver.
    func setNight(_ on: Bool) {
        night = on
        queue.async { self.nightOn = on; self.applyNight() }
    }

    private func applyNight() {
        #if !targetEnvironment(macCatalyst)
        guard let dev = device, (try? dev.lockForConfiguration()) != nil else { return }
        defer { dev.unlockForConfiguration() }
        if dev.isLowLightBoostSupported { dev.automaticallyEnablesLowLightBoostWhenAvailable = true }
        dev.setExposureTargetBias(nightOn ? min(1.5, dev.maxExposureTargetBias) : 0)
        let fps15 = dev.activeFormat.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= 15 && $0.maxFrameRate >= 15 }
        let d: CMTime = nightOn && fps15 ? CMTime(value: 1, timescale: 15) : .invalid
        dev.activeVideoMinFrameDuration = d
        dev.activeVideoMaxFrameDuration = d
        #endif
    }

    /// Brightened copy of a dark frame for the detector only. The raw frame is still what decides "camera covered / too dark".
    private func brighten(_ px: CVPixelBuffer) -> CVPixelBuffer {
        let ev = min(3, max(0, log2(0.35 / max(ambient, 0.02))))
        guard ev > 0.15 else { return px }
        let w = CVPixelBufferGetWidth(px), h = CVPixelBufferGetHeight(px)
        if pool == nil || poolSize != CGSize(width: w, height: h) {
            let attrs: [CFString: Any] = [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey: w,
                                          kCVPixelBufferHeightKey: h, kCVPixelBufferIOSurfacePropertiesKey: [:] as [String: Any]]
            var p: CVPixelBufferPool?
            CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &p)
            pool = p; poolSize = CGSize(width: w, height: h)
        }
        var out: CVPixelBuffer?
        guard let pool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess, let out else { return px }
        let img = CIImage(cvPixelBuffer: px)
            .applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: ev])
            .applyingFilter("CIGammaAdjust", parameters: ["inputPower": 0.8])
        ciContext.render(img, to: out)
        return out
    }

    private func run() {
        queue.async { self.session.startRunning() }
        cameraState = "running"
    }

    func stop() {
        queue.async { self.session.stopRunning() }
        location.stopUpdatingLocation()
        if cameraState == "running" { cameraState = "idle" }
        dets = []; faces = []; seen = [:]; smoothed = [:]; fps = 0
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let px = CMSampleBufferGetImageBuffer(sb) else { return }
        frameNo += 1
        let w = CGFloat(CVPixelBufferGetWidth(px)), h = CGFloat(CVPixelBufferGetHeight(px))
        let a = VisionOrientation.swapsAxes ? h / w : w / h
        if a != lastAspect { lastAspect = a; DispatchQueue.main.async { self.aspect = a } }
        let t0 = Date()
        let lum: Double? = frameNo % 5 == 0 ? Self.luma(px) : nil
        if let lum { ambient = ambient * 0.7 + lum * 0.3 }
        let dark = lum.map { $0 < 0.05 }
        let seenPx = nightOn ? brighten(px) : px          // everything below looks at the brightened copy at night
        let found = detector.detect(seenPx)
        if frameNo % 2 == 1 { faceCache = faceFinder.faces(in: seenPx) }   // faces change slowly; every 2nd frame is enough
        let faces = faceCache
        let ms = Date().timeIntervalSince(t0) * 1000
        let dt = max(0.001, t0.timeIntervalSince(lastFrameAt)); lastFrameAt = t0
        emaMs = emaMs == 0 ? ms : emaMs * 0.9 + ms * 0.1
        emaFps = emaFps == 0 ? 1 / dt : emaFps * 0.9 + (1 / dt) * 0.1

        // Smooth on the queue (cheap), so a missed frame does not flip the verdict; fades out in ~1 s at 30 fps.
        let mirrored = self.mirrored
        var fresh: [String: Seen] = [:]
        var ageSeats = Set<String>()
        for d in found where d.conf >= 0.3 {
            let seat = Cabin.seat(forX: d.box.midX, mirrored: mirrored)
            let kind: String, name: String
            var age = "unknown"
            if d.label == "person" { kind = "person"; name = "Người"; age = personAge(seat: seat, box: d.box, px: seenPx, seats: &ageSeats) }
            else if Cabin.pets.contains(d.label) { kind = "pet"; name = "Thú cưng" }
            else if let n = Cabin.itemNames[d.label] { kind = "item"; name = n }
            else { continue }
            let key = "\(seat)|\(kind)|\(name)"
            if Double(d.conf) > (fresh[key]?.conf ?? 0) { fresh[key] = Seen(seat: seat, kind: kind, name: name, conf: Double(d.conf), age: age, box: d.box) }
        }
        ageLock.withLock { ageBySeat = ageBySeat.filter { ageSeats.contains($0.key) } }   // a seat with nobody in it forgets its age
        var next: [String: Seen] = [:]
        for k in Set(fresh.keys).union(smoothed.keys) {
            let old = smoothed[k], new = fresh[k]
            let c = max(new?.conf ?? 0, (old?.conf ?? 0) * 0.93)
            if c >= 0.15, let base = new ?? old { next[k] = Seen(seat: base.seat, kind: base.kind, name: base.name, conf: c, age: new?.age ?? base.age, box: new?.box ?? base.box) }
        }
        smoothed = next

        let now = Date()
        if now.timeIntervalSince(lastPublish) < 1.0 / 15 { if let dark { updateDark(dark, lum ?? 1, now) }; return }
        lastPublish = now
        let fps = Int(emaFps.rounded()), lat = Int(emaMs.rounded())
        DispatchQueue.main.async {
            if let dark { self.updateDark(dark, lum ?? 1, now) }
            if self.dets != found { self.dets = found }
            if self.faces != faces { self.faces = faces }
            if self.seen != next { self.seen = next }
            self.fps = fps; self.latencyMs = lat
        }
    }

    /// Age of the person in a seat. Never blocks the detection loop: the classifier runs on its own queue, one job at a
    /// time (a busy classifier just skips this frame), and this returns the last answer or "unknown" meanwhile.
    private func personAge(seat: String, box: CGRect, px: CVPixelBuffer, seats: inout Set<String>) -> String {
        seats.insert(seat)
        guard let ageModel else { return "unknown" }
        let known = ageLock.withLock { ageBySeat[seat] }
        guard known == nil || frameNo % 6 == 0, ageLock.withLock({ !ageBusy && { ageBusy = true; return true }() }) else { return known ?? "unknown" }
        nonisolated(unsafe) let held = px   // held only for this one short job
        ageQueue.async { [weak self] in
            let age = ageModel.classify(person: box, in: held)
            self?.ageLock.withLock { self?.ageBySeat[seat] = age; self?.ageBusy = false }
        }
        return known ?? "unknown"
    }

    private func updateDark(_ dark: Bool, _ lum: Double, _ now: Date) {
        DispatchQueue.main.async { self.lightLevel = lum }
        if dark { darkSince = darkSince ?? now } else { darkSince = nil }
        let c = darkSince.map { now.timeIntervalSince($0) > 2 } ?? false
        DispatchQueue.main.async { if self.covered != c { self.covered = c } }
    }

    /// Payload for the backend: only what clears the 50% bar, already assigned to a seat.
    func detections() -> ([APIClient.DetBody], [APIClient.ItemBody]) {
        let strong = seen.values.filter { $0.conf >= 0.5 }
        // Position only (0...1 of the frame, flipped when the picture is mirrored so it matches the seat names). The picture never leaves the phone.
        func box(_ r: CGRect) -> [Double]? {
            guard r.width > 0, r.height > 0 else { return nil }
            let x = Double(max(0, min(1, r.minX))), y = Double(max(0, min(1, r.minY)))
            let w = min(Double(r.width), 1 - x), h = min(Double(r.height), 1 - y)
            let fx = mirrored ? max(0, 1 - x - w) : x
            let values: [Double] = [fx, y, w, h]
            return values.map { (($0 * 1000).rounded()) / 1000 }
        }
        return (strong.filter { $0.kind != "item" }.map { .init(seat: $0.seat, kind: $0.kind, conf: $0.conf, age: $0.kind == "person" ? $0.age : nil, box: box($0.box)) },
                strong.filter { $0.kind == "item" }.map { .init(name: $0.name, seat: $0.seat, conf: $0.conf, box: box($0.box)) })
    }

    private static func luma(_ px: CVPixelBuffer) -> Double {
        CVPixelBufferLockBaseAddress(px, .readOnly); defer { CVPixelBufferUnlockBaseAddress(px, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(px, 0) else { return 1 }
        let w = CVPixelBufferGetWidthOfPlane(px, 0), h = CVPixelBufferGetHeightOfPlane(px, 0), bpr = CVPixelBufferGetBytesPerRowOfPlane(px, 0)
        let p = base.assumingMemoryBound(to: UInt8.self)
        var sum = 0, n = 0
        for y in stride(from: 0, to: h, by: 24) { for x in stride(from: 0, to: w, by: 24) { sum += Int(p[y * bpr + x]); n += 1 } }
        return n == 0 ? 1 : Double(sum) / Double(n) / 255
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let l = locs.last else { return }
        coord = l.coordinate; accuracy = l.horizontalAccuracy; speed = max(0, l.speed)
    }
    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        locationDenied = m.authorizationStatus == .denied || m.authorizationStatus == .restricted
    }
}
