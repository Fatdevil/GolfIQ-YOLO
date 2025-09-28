import Foundation

final class FeatureFlagsService {
    private var config: FeatureFlagConfig

    init(defaults: FeatureFlagConfig = FeatureFlagConfig(hudWindHintEnabled: true, hudTargetLineEnabled: true, hudBatterySaverEnabled: true, source: .default)) {
        self.config = defaults
    }

    func current() -> FeatureFlagConfig {
        config
    }

    func applyRemote(overrides: FeatureFlagConfig) {
        config = overrides
    }
}