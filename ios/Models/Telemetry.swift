import Foundation

public struct Telemetry: Codable {
    public let timestampMs: Int64
    public let club: String?
    public let ballSpeed: Double?
    public let clubSpeed: Double?
    public let launchAngle: Double?
    public let spinRpm: Int?
    public let carryMeters: Double?
}
