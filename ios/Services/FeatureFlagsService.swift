import Foundation

final class FeatureFlagsService {
    private var config: FeatureFlagConfig

    init(
        defaults: FeatureFlagConfig = FeatureFlagConfig(
            hudEnabled: false,
            hudTracerEnabled: false,
            fieldTestModeEnabled: false,
            playsLikeEnabled: false,
            hudWindHintEnabled: true,
            hudTargetLineEnabled: true,
            hudBatterySaverEnabled: false,
            handsFreeImpactEnabled: false,
            inputSize: 320,
            reducedRate: false,
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
            hudEnabled: config.hudEnabled,
            hudTracerEnabled: config.hudTracerEnabled,
            fieldTestModeEnabled: config.fieldTestModeEnabled,
            analyticsEnabled: config.analyticsEnabled,
            crashEnabled: config.crashEnabled,
            playsLikeEnabled: config.playsLikeEnabled,
            hudWindHintEnabled: config.hudWindHintEnabled,
            hudTargetLineEnabled: config.hudTargetLineEnabled,
            hudBatterySaverEnabled: config.hudBatterySaverEnabled,
            handsFreeImpactEnabled: enabled,
            inputSize: config.inputSize,
            reducedRate: config.reducedRate,
            source: .override
        )
    }

    func setHudEnabled(_ enabled: Bool) {
        config = FeatureFlagConfig(
            hudEnabled: enabled,
            hudTracerEnabled: config.hudTracerEnabled,
            fieldTestModeEnabled: config.fieldTestModeEnabled,
            analyticsEnabled: config.analyticsEnabled,
            crashEnabled: config.crashEnabled,
            playsLikeEnabled: config.playsLikeEnabled,
            hudWindHintEnabled: config.hudWindHintEnabled,
            hudTargetLineEnabled: config.hudTargetLineEnabled,
            hudBatterySaverEnabled: config.hudBatterySaverEnabled,
            handsFreeImpactEnabled: config.handsFreeImpactEnabled,
            inputSize: config.inputSize,
            reducedRate: config.reducedRate,
            source: .override
        )
    }

    func setHudTracerEnabled(_ enabled: Bool) {
        config = FeatureFlagConfig(
            hudEnabled: config.hudEnabled,
            hudTracerEnabled: enabled,
            fieldTestModeEnabled: config.fieldTestModeEnabled,
            analyticsEnabled: config.analyticsEnabled,
            crashEnabled: config.crashEnabled,
            playsLikeEnabled: config.playsLikeEnabled,
            hudWindHintEnabled: config.hudWindHintEnabled,
            hudTargetLineEnabled: config.hudTargetLineEnabled,
            hudBatterySaverEnabled: config.hudBatterySaverEnabled,
            handsFreeImpactEnabled: config.handsFreeImpactEnabled,
            inputSize: config.inputSize,
            reducedRate: config.reducedRate,
            source: .override
        )
    }

    func setFieldTestModeEnabled(_ enabled: Bool) {
        config = FeatureFlagConfig(
            hudEnabled: config.hudEnabled,
            hudTracerEnabled: config.hudTracerEnabled,
            fieldTestModeEnabled: enabled,
            analyticsEnabled: config.analyticsEnabled,
            crashEnabled: config.crashEnabled,
            playsLikeEnabled: config.playsLikeEnabled,
            hudWindHintEnabled: config.hudWindHintEnabled,
            hudTargetLineEnabled: config.hudTargetLineEnabled,
            hudBatterySaverEnabled: config.hudBatterySaverEnabled,
            handsFreeImpactEnabled: config.handsFreeImpactEnabled,
            inputSize: config.inputSize,
            reducedRate: config.reducedRate,
            source: .override
        )
    }
}
