import Foundation
import CoreGraphics
import ImageIO

final class FrameProvider {
    private(set) var frames: [CGImage] = []

    init(frameBudget: Int) {
        frames = Self.generateFrames(frameBudget: frameBudget)
    }

    private static func generateFrames(frameBudget: Int) -> [CGImage] {
        guard let data = Data(base64Encoded: EmbeddedResources.gradientFramePNGBase64) else {
            print("[FrameProvider] Failed to decode embedded frame data")
            return []
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            print("[FrameProvider] Unable to create CGImage from embedded PNG")
            return []
        }
        let targetCount = frameBudget > 0 ? frameBudget : 150
        let frames = Array(repeating: image, count: targetCount)
        print("[FrameProvider] Generated \(frames.count) frames from embedded asset")
        return frames
    }
}
