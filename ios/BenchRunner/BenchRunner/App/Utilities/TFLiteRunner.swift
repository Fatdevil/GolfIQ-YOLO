import Foundation
import CoreGraphics

protocol InferencePerformer {
    var backendIdentifier: String { get }
    var identifier: String { get }
    var modelSizeMB: Double { get }
    func prepare() throws
    func perform(on image: CGImage) throws -> TimeInterval
}

#if canImport(TensorFlowLite)
import TensorFlowLite
import UIKit
import CoreVideo

struct TFLiteRunner: InferencePerformer {
    let backendIdentifier = "tflite"
    let identifier: String
    let modelSizeMB: Double
    private let interpreter: Interpreter
    private let inputShape: Tensor.Shape

    init?(modelName: String = "MobileNetV2") {
        guard let modelURL = Bundle.main.url(forResource: modelName, withExtension: "tflite") else {
            return nil
        }
        identifier = modelName
        modelSizeMB = TFLiteRunner.fileSizeMB(at: modelURL)
        do {
            interpreter = try Interpreter(modelPath: modelURL.path)
            try interpreter.allocateTensors()
            inputShape = try interpreter.input(at: 0).shape
        } catch {
            print("[TFLite] Failed to initialize interpreter: \(error)")
            return nil
        }
    }

    func prepare() throws {}

    func perform(on image: CGImage) throws -> TimeInterval {
        let rgba = try PixelBufferConverter.buffer(from: image, width: inputShape.dimensions[1], height: inputShape.dimensions[2])
        let start = CFAbsoluteTimeGetCurrent()
        try interpreter.copy(rgba, toInputAt: 0)
        try interpreter.invoke()
        _ = try interpreter.output(at: 0)
        return CFAbsoluteTimeGetCurrent() - start
    }

    static func fileSizeMB(at url: URL) -> Double {
        if let attributes = try? FileManager.default.attributesOfItem(atPath: url.path), let size = attributes[.size] as? NSNumber {
            return size.doubleValue / (1024.0 * 1024.0)
        }
        return 0
    }
}

private enum PixelBufferConverter {
    static func buffer(from image: CGImage, width: Int, height: Int) throws -> Data {
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        var data = Data(count: width * height * 4)
        let bytesPerRow = width * 4
        let result = data.withUnsafeMutableBytes { ptr -> Bool in
            guard let context = CGContext(
                data: ptr.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else {
                return false
            }
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        if result {
            return data
        } else {
            throw NSError(domain: "TFLite", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to prepare RGBA buffer"])
        }
    }
}
#else
struct TFLiteRunner: InferencePerformer {
    let backendIdentifier = "tflite"
    let identifier = "TensorFlowLite"
    let modelSizeMB: Double = 0

    init?() {
        print("[TFLite] TensorFlowLite is not linked. Falling back to CoreML.")
        return nil
    }

    func prepare() throws {}

    func perform(on image: CGImage) throws -> TimeInterval {
        throw NSError(domain: "TFLite", code: -1, userInfo: [NSLocalizedDescriptionKey: "TensorFlowLite not linked"])
    }
}
#endif
