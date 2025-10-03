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
    var handsFreeImpactEnabled: Bool
    var source: Source

    static func forTier(_ tier: DeviceProfile.Tier) -> FeatureFlagConfig {
        switch tier {
        case .a:
            return FeatureFlagConfig(
                hudWindHintEnabled: true,
                hudTargetLineEnabled: true,
                hudBatterySaverEnabled: false,
                handsFreeImpactEnabled: true,
                source: .default
            )
        case .b:
            return FeatureFlagConfig(
                hudWindHintEnabled: true,
                hudTargetLineEnabled: true,
                hudBatterySaverEnabled: true,
                handsFreeImpactEnabled: true,
                source: .default
            )
        case .c:
            return FeatureFlagConfig(
                hudWindHintEnabled: false,
                hudTargetLineEnabled: false,
                hudBatterySaverEnabled: true,
                handsFreeImpactEnabled: false,
                source: .default
            )
        }
    }
}
