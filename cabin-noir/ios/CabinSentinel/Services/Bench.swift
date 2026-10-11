import Vision
import CoreVideo
import CoreGraphics
import Foundation
import ImageIO

/// `CabinSentinel --bench-detector` prints per-request and pipeline timings, then exits. Debug aid, no UI.
enum Bench {
    static func runIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--detect-image"), i + 1 < args.count { detectImage(args[i + 1]) }
        guard ProcessInfo.processInfo.arguments.contains("--bench-detector") else { return }
        let px = frame(640, 480)
        func time(_ n: Int, _ f: () -> Void) -> Double {
            for _ in 0..<5 { f() }
            let t = Date(); for _ in 0..<n { f() }
            return Date().timeIntervalSince(t) * 1000 / Double(n)
        }
        let det = DetectorFactory.make(), faces = FaceFinder()
        let h = VNSequenceRequestHandler(), humans = VNDetectHumanRectanglesRequest(), animals = VNRecognizeAnimalsRequest()
        let mHumans = time(100) { try? h.perform([humans], on: px, orientation: .right) }
        let mAnimals = time(100) { try? h.perform([animals], on: px, orientation: .right) }
        let mFaces = time(100) { _ = faces.faces(in: px) }
        var i = 0
        let mPipe = time(200) { i += 1; _ = det.detect(px); if i % 2 == 1 { _ = faces.faces(in: px) } }
        print(String(format: "bench %@ 640x480: humans %.1f ms | animals %.1f ms | faces %.1f ms | pipeline %.1f ms/frame = %.0f fps",
                     det.name, mHumans, mAnimals, mFaces, mPipe, 1000 / mPipe))
        exit(0)
    }

    /// `--detect-image <path>`: runs the active detector on one picture and prints what it found (parity check vs the web model).
    private static func detectImage(_ path: String) {
        guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("detect: cannot read \(path)"); exit(1) }
        var px: CVPixelBuffer?
        CVPixelBufferCreate(nil, img.width, img.height, kCVPixelFormatType_32BGRA, [kCVPixelBufferCGBitmapContextCompatibilityKey: true] as CFDictionary, &px)
        let buf = px!
        CVPixelBufferLockBaseAddress(buf, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
        CVPixelBufferUnlockBaseAddress(buf, [])
        let det = DetectorFactory.make()
        for d in det.detect(buf).sorted(by: { $0.conf > $1.conf }) { print(String(format: "detect %@ %@ %.3f", det.name, d.label, d.conf)) }
        let t = Date(); for _ in 0..<50 { _ = det.detect(buf) }
        print(String(format: "detect %@ %.1f ms/frame", det.name, Date().timeIntervalSince(t) * 20))
        exit(0)
    }

    private static func frame(_ w: Int, _ h: Int) -> CVPixelBuffer {
        var px: CVPixelBuffer?
        CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32BGRA, [kCVPixelBufferCGBitmapContextCompatibilityKey: true] as CFDictionary, &px)
        let buf = px!
        CVPixelBufferLockBaseAddress(buf, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        ctx.setFillColor(CGColor(gray: 0.35, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        for (x, c) in [(120, 0.7), (320, 0.55), (520, 0.8)] as [(Int, CGFloat)] {
            ctx.setFillColor(CGColor(gray: c, alpha: 1))
            ctx.fillEllipse(in: CGRect(x: x - 40, y: 280, width: 80, height: 80))   // head
            ctx.fill(CGRect(x: x - 60, y: 60, width: 120, height: 210))              // torso
        }
        CVPixelBufferUnlockBaseAddress(buf, [])
        return buf
    }
}
