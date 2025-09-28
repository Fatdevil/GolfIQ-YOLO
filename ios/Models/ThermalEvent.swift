import Foundation

struct ThermalEvent: Codable {
    enum Severity: String, Codable {
        case info
        case warning
        case critical
    }

    enum ActionTaken: String, Codable {
        case logOnly
        case promptUser
        case autoReduceFeatures
    }

    let timestamp: Date
    let severity: Severity
    let actionTaken: ActionTaken
}