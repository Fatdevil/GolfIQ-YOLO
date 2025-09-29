import Foundation

public struct ShotEvent: Codable {
    public let id: String
    public let sessionId: String
    public let telemetry: Telemetry
}
