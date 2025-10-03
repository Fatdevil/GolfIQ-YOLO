import Foundation

final class FeatureFlagsService {
    private var config: FeatureFlagConfig

    init(
        defaults: FeatureFlagConfig = FeatureFlagConfig(
            hudWindHintEnabled: true,
            hudTargetLineEnabled: true,
            hudBatterySaverEnabled: false,
            handsFreeImpactEnabled: false,
            source: .default
        )
    ) {
        self.config = defaults
    }

    func current() -> FeatureFlagConfig {
        config
    }

    func applyRemote(overrides: FeatureFlagConfig) {
        config = overrides
    }

    func applyDeviceTier(profile: DeviceProfile) {
        config = FeatureFlagConfig.forTier(profile.tier)
    }

    func setHandsFreeEnabled(_ enabled: Bool) {
        config = FeatureFlagConfig(
            hudWindHintEnabled: config.hudWindHintEnabled,
            hudTargetLineEnabled: config.hudTargetLineEnabled,
            hudBatterySaverEnabled: config.hudBatterySaverEnabled,
            handsFreeImpactEnabled: enabled,
            source: .override
        )
    }
}
