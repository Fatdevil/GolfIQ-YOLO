package com.golfiq.hud.config

import com.golfiq.hud.model.DeviceProfile
import com.golfiq.hud.model.FeatureFlagConfig

class FeatureFlagsService(
    defaults: FeatureFlagConfig = FeatureFlagConfig(
        hudWindHintEnabled = true,
        hudTargetLineEnabled = true,
        hudBatterySaverEnabled = false,
        handsFreeImpactEnabled = false,
        source = FeatureFlagConfig.Source.DEFAULT,
    ),
) {
    private var config: FeatureFlagConfig = defaults

    fun current(): FeatureFlagConfig = config

    fun applyRemote(overrides: FeatureFlagConfig) {
        config = overrides
    }

    fun applyDeviceTier(profile: DeviceProfile) {
        config = FeatureFlagConfig.forTier(profile.tier)
    }

    fun setHandsFreeEnabled(enabled: Boolean) {
        config = config.copy(
            handsFreeImpactEnabled = enabled,
            source = FeatureFlagConfig.Source.OVERRIDE,
        )
    }
}
