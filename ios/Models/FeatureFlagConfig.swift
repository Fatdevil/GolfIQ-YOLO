import Foundation

struct FeatureFlagConfig: Codable {
    enum Source: String, Codable {
        case `default`
        case featureService
        case override
    }

    var hudWindHintEnabled: Bool
    var hudTargetLineEnabled: Bool
    var hudBatterySaverEnabled: Bool
    var source: Source
}