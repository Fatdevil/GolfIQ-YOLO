import Foundation

struct Anchor: Codable, Identifiable {
    enum AnchorType: String, Codable {
        case pin
        case layup
        case reticle
        case groundPlane
    }

    let id: UUID
    let sessionID: UUID
    let type: AnchorType
    let position: SIMD3<Double>
    let normal: SIMD3<Double>
    let stabilityConfidence: Double
    let lastRevalidatedAt: Date
    var driftMeters: Double
}