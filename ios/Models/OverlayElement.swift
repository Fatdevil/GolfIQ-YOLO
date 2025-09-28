import Foundation

struct OverlayElement: Codable, Identifiable {
    enum ElementType: String, Codable {
        case distanceMarker
        case layupMarker
        case targetLine
        case windHint
        case safetyBanner
        case offlineBadge
        case perfOverlay
    }

    let id: UUID
    let sessionID: UUID
    let anchorID: UUID
    let type: ElementType
    var distanceMeters: Double?
    var windTier: String?
    var isVisible: Bool
}