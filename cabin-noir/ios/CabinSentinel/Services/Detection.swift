import Vision
import ImageIO
import CoreML
import CoreGraphics
import CoreImage
import os

/// iPhone back-camera buffers are landscape and need turning to be upright; the turn depends on how the phone is held
/// (portrait, or landscape when it sits near the rear-view mirror). A Mac webcam is already upright.
/// PhoneSensor updates this when the interface rotates; detectors read it for every frame, from any queue.
enum VisionOrientation {
    /// A Mac webcam is already upright, both for Mac Catalyst and for an iPhone app running on a Mac ("Designed for iPhone").
    static let onMac: Bool = {
        #if targetEnvironment(macCatalyst)
        true
        #else
        ProcessInfo.processInfo.isiOSAppOnMac
        #endif
    }()
    /// Only Mac Catalyst hands over upright webcam frames. An iPhone app running on a Mac gets the webcam as if it were a
    /// phone camera: frames turned like a phone held upright, so they need the same turn as on an iPhone.
    static let uprightSensor: Bool = {
        #if targetEnvironment(macCatalyst)
        true
        #else
        false
        #endif
    }()
    private static let box = OSAllocatedUnfairLock(initialState: uprightSensor ? CGImagePropertyOrientation.up : .right)
    static var current: CGImagePropertyOrientation { box.withLock { $0 } }
    static func set(_ o: CGImagePropertyOrientation) { box.withLock { $0 = o } }
    /// True when the upright image has the buffer's height as its width.
    static var swapsAxes: Bool { current == .left || current == .right }
}

var visionOrientation: CGImagePropertyOrientation { VisionOrientation.current }

/// One object found in a camera frame. `label` uses COCO names ("person", "dog", "backpack"…).
struct Det: Identifiable, Equatable {
    let id = UUID()
    let label: String
    let conf: Float
    let box: CGRect          // normalized, origin top-left, in the upright (portrait) image
}

protocol Detector {
    /// Short id sent to the backend so every result says which model produced it.
    var name: String { get }
    func detect(_ pixels: CVPixelBuffer) -> [Det]
}

/// Built-in fallback: Apple Vision finds people and cats/dogs. No objects (backpack, bottle…).
/// Requests are created once and reused (creating them per frame is a large part of the cost);
/// the animal request is the slowest, so it runs every 4th frame and its result is carried over.
final class AppleVisionDetector: Detector {
    let name = "apple-vision"
    private let handler = VNSequenceRequestHandler()
    private let humans = VNDetectHumanRectanglesRequest()
    private let animals = VNRecognizeAnimalsRequest()
    private var frame = 0
    private var cachedPets: [Det] = []

    func detect(_ px: CVPixelBuffer) -> [Det] {
        frame += 1
        let runAnimals = frame % 4 == 1
        try? handler.perform(runAnimals ? [humans, animals] : [humans], on: px, orientation: visionOrientation)
        var out = (humans.results ?? []).map { Det(label: "person", conf: $0.confidence, box: $0.boundingBox.topLeftOrigin) }
        if runAnimals {
            cachedPets = (animals.results ?? []).compactMap { a in
                guard let l = a.labels.first, l.identifier == "Cat" || l.identifier == "Dog" else { return nil }
                return Det(label: l.identifier.lowercased(), conf: l.confidence, box: a.boundingBox.topLeftOrigin)
            }
        }
        out += cachedPets
        return out
    }
}

/// Faces, used only to hide them on screen and to help guess child vs adult. Never stored or sent.
final class FaceFinder {
    private let handler = VNSequenceRequestHandler()
    private let request = VNDetectFaceRectanglesRequest()

    func faces(in px: CVPixelBuffer) -> [CGRect] {
        try? handler.perform([request], on: px, orientation: visionOrientation)
        return (request.results ?? []).map { $0.boundingBox.topLeftOrigin }
    }
}

/// Child/adult from the trained person-crop classifier exported as `CabinAge.mlpackage` (drop it next to CabinYOLO;
/// no code change). Until that file is bundled `CoreMLAgeClassifier()` is nil and every person is "unknown" — never
/// "adult". An age result is only a hint and never changes an alert.
///
/// Contract with the training code (`src/vision/age.py`): crop the person box with 10% padding from the ORIGINAL
/// frame (the on-screen face cover is drawn later and never touches this buffer), stretch the whole crop to 224x224
/// (`scaleFill`, no center crop), RGB with ImageNet mean/std normalization baked into the exported model, and take
/// the class names from the model's own labels — the order is never assumed. Historical "infant" is added to
/// "child". Child needs >= 0.5; adult needs child <= 0.1; anything else, or any error, is "unknown".
final class CoreMLAgeClassifier {
    static let resource = "CabinAge"
    static let padding: CGFloat = 0.1
    static let childThreshold = 0.5
    static let adultThreshold = 0.9
    private let request: VNCoreMLRequest

    init?() {
        guard let url = Bundle.main.url(forResource: Self.resource, withExtension: "mlmodelc"),
              let ml = try? MLModel(contentsOf: url, configuration: { let c = MLModelConfiguration(); c.computeUnits = .all; return c }()),
              let vn = try? VNCoreMLModel(for: ml) else { return nil }
        request = VNCoreMLRequest(model: vn)
        request.imageCropAndScaleOption = .scaleFill
    }

    /// `box` is normalized, top-left origin, in the upright image (same space as `Det.box`).
    func classify(person box: CGRect, in px: CVPixelBuffer) -> String {
        let upright = CIImage(cvPixelBuffer: px).oriented(visionOrientation)
        guard let rect = Self.cropRect(box, width: upright.extent.width, height: upright.extent.height) else { return "unknown" }
        // CIImage origin is bottom-left.
        let ci = CGRect(x: rect.minX, y: upright.extent.height - rect.maxY, width: rect.width, height: rect.height)
        do { try VNImageRequestHandler(ciImage: upright.cropped(to: ci)).perform([request]) } catch { return "unknown" }
        guard let obs = request.results as? [VNClassificationObservation], !obs.isEmpty else { return "unknown" }
        var probs: [String: Double] = [:]
        for o in obs { probs[o.identifier.lowercased()] = Double(o.confidence) }
        return Self.decide(probs)
    }

    /// Padded pixel rectangle (top-left origin), clipped to the image; nil for an empty or non-finite box.
    static func cropRect(_ box: CGRect, width: CGFloat, height: CGFloat) -> CGRect? {
        let x1 = box.minX * width, y1 = box.minY * height, x2 = box.maxX * width, y2 = box.maxY * height
        guard [x1, y1, x2, y2].allSatisfy({ $0.isFinite }), x2 > x1, y2 > y1 else { return nil }
        let dx = (x2 - x1) * padding, dy = (y2 - y1) * padding
        let left = max(0, floor(x1 - dx)), top = max(0, floor(y1 - dy))
        let right = min(width, ceil(x2 + dx)), bottom = min(height, ceil(y2 + dy))
        guard right > left, bottom > top else { return nil }
        return CGRect(x: left, y: top, width: right - left, height: bottom - top)
    }

    /// Labels must be the training labels; anything unexpected is "unknown", not "adult".
    static func decide(_ probs: [String: Double]) -> String {
        guard !probs.isEmpty, Set(probs.keys).isSubset(of: ["adult", "child", "infant"]),
              probs["adult"] != nil, probs["child"] != nil else { return "unknown" }
        var child = (probs["child"] ?? 0) + (probs["infant"] ?? 0)
        if child > 1, child <= 1 + 1e-6 { child = 1 }   // float rounding of the merged score, not a real overshoot
        guard child.isFinite, child >= 0, child <= 1 else { return "unknown" }
        if child >= childThreshold { return "child" }
        if 1 - child >= adultThreshold { return "adult" }
        return "unknown"
    }
}

/// YOLOv8n exported to Core ML WITHOUT the built-in NMS (`CabinYOLO.mlpackage`, same weights as the web backend's
/// `models/yolov8n.pt`). The exported NMS wrapper reports inflated scores (0.27 became 0.96 on the same image), and the
/// app compares scores with a 50% threshold, so the raw head (1x84x8400: cx, cy, w, h in 640px, then 80 class scores)
/// is decoded here and NMS is done in Swift. Only the classes the cabin logic cares about are scored.
/// A model exported with NMS (VNRecognizedObjectObservation results) still works as a fallback.
final class CoreMLDetector: Detector {
    static let resource = "CabinYOLO"
    static let input: Float = 640
    static let minScore: Float = 0.25
    static let iou: Float = 0.5
    /// COCO class id -> label used by `Cabin`.
    static let classes: [Int: String] = [0: "person", 15: "cat", 16: "dog", 24: "backpack", 25: "umbrella", 26: "handbag",
                                         28: "suitcase", 39: "bottle", 63: "laptop", 67: "cell phone", 77: "teddy bear"]
    let name: String
    private let request: VNCoreMLRequest

    init?() {
        guard let url = Bundle.main.url(forResource: Self.resource, withExtension: "mlmodelc"),
              let ml = try? MLModel(contentsOf: url, configuration: { let c = MLModelConfiguration(); c.computeUnits = .all; return c }()),
              let vn = try? VNCoreMLModel(for: ml) else { return nil }
        request = VNCoreMLRequest(model: vn)
        request.imageCropAndScaleOption = .scaleFill
        name = "coreml-" + Self.resource.lowercased()
    }

    func detect(_ px: CVPixelBuffer) -> [Det] {
        try? VNImageRequestHandler(cvPixelBuffer: px, orientation: visionOrientation).perform([request])
        if let objs = request.results as? [VNRecognizedObjectObservation], !objs.isEmpty {
            return objs.compactMap {
                guard let l = $0.labels.first else { return nil }
                return Det(label: l.identifier, conf: l.confidence, box: $0.boundingBox.topLeftOrigin)
            }
        }
        guard let feature = (request.results as? [VNCoreMLFeatureValueObservation])?.first?.featureValue.multiArrayValue else { return [] }
        return Self.decode(feature)
    }

    static func decode(_ a: MLMultiArray) -> [Det] {
        guard a.dataType == .float32, a.shape.count == 3, a.shape[1].intValue == 84 else { return [] }
        let n = a.shape[2].intValue
        let sc = a.strides.map { $0.intValue }
        let p = a.dataPointer.assumingMemoryBound(to: Float.self)
        func at(_ c: Int, _ i: Int) -> Float { p[c * sc[1] + i * sc[2]] }
        var found: [(label: String, score: Float, rect: CGRect)] = []
        for i in 0..<n {
            var best = minScore, label: String?
            for (cls, name) in classes {
                let s = at(4 + cls, i)
                if s >= best { best = s; label = name }
            }
            guard let label else { continue }
            let cx = at(0, i), cy = at(1, i), w = at(2, i), h = at(3, i)
            let r = CGRect(x: CGFloat((cx - w / 2) / input), y: CGFloat((cy - h / 2) / input), width: CGFloat(w / input), height: CGFloat(h / input))
            found.append((label, best, r.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))))
        }
        return nms(found).map { Det(label: $0.label, conf: $0.score, box: $0.rect) }
    }

    static func nms(_ items: [(label: String, score: Float, rect: CGRect)]) -> [(label: String, score: Float, rect: CGRect)] {
        var kept: [(label: String, score: Float, rect: CGRect)] = []
        for it in items.sorted(by: { $0.score > $1.score }) where !it.rect.isNull && it.rect.width > 0 && it.rect.height > 0 {
            let dup = kept.contains { k in
                guard k.label == it.label else { return false }
                let inter = k.rect.intersection(it.rect)
                guard !inter.isNull else { return false }
                let ia = Float(inter.width * inter.height)
                let ua = Float(k.rect.width * k.rect.height + it.rect.width * it.rect.height) - ia
                return ua > 0 && ia / ua > iou
            }
            if !dup { kept.append(it) }
        }
        return kept
    }
}

enum DetectorFactory {
    static func make() -> Detector { CoreMLDetector() ?? AppleVisionDetector() }
}

extension CGRect {
    /// Vision boxes have a bottom-left origin; the UI uses top-left.
    var topLeftOrigin: CGRect { CGRect(x: minX, y: 1 - maxY, width: width, height: height) }
}

/// What the cabin logic cares about, in Vietnamese. Anything else is ignored on purpose.
enum Cabin {
    static let pets: Set<String> = ["dog", "cat"]
    static let itemNames = ["backpack": "Ba lô", "handbag": "Túi xách", "suitcase": "Vali", "bottle": "Chai nước",
                            "cell phone": "Điện thoại", "laptop": "Laptop", "teddy bear": "Gấu bông", "umbrella": "Ô"]
    static let seats = ["rear_left", "rear_mid", "rear_right"]

    /// The phone looks at the rear row from the front, so image-left is the car's right side.
    static func seat(forX x: CGFloat, mirrored: Bool) -> String {
        let col = x < 1.0 / 3 ? 0 : (x < 2.0 / 3 ? 1 : 2)
        return seats[mirrored ? 2 - col : col]
    }
}
