import Foundation

struct TelemetrySample: Codable, Identifiable {
    let id: UUID
    let sessionID: UUID
    let timestamp: Date
    let metric: String
    let value: Double
    let deviceClass: String
    let sampled: Bool
}