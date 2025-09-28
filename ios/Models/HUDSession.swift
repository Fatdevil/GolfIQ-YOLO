import Foundation

struct HUDSession: Codable, Identifiable {
    let id: UUID
    let platform: String
    let deviceModel: String
    let osVersion: String
    let startTimestamp: Date
    var endTimestamp: Date?
    var thermalEvents: [ThermalEvent]
    var averageFPS: Double
    var latencyMsP50: Double
    var latencyMsP90: Double
    var batteryDeltaPercent: Double
    var fallbackTriggered: Bool
    var offlineDurationMs: Int
}