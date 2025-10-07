package com.golfiq.hud.config

import com.golfiq.hud.model.DeviceProfile
import com.golfiq.hud.model.FeatureFlagConfig

class FeatureFlagsService(
    defaults: FeatureFlagConfig = FeatureFlagConfig(
        hudEnabled = false,
        hudTracerEnabled = false,
        fieldTestModeEnabled = false,
        playsLikeEnabled = false,
        hudWindHintEnabled = true,
        hudTargetLineEnabled = true,
        hudBatterySaverEnabled = false,
        handsFreeImpactEnabled = false,
        inputSize = 320,
        reducedRate = false,
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
            hudEnabled = config.hudEnabled,
            hudTracerEnabled = config.hudTracerEnabled,
            fieldTestModeEnabled = config.fieldTestModeEnabled,
            analyticsEnabled = config.analyticsEnabled,
            crashEnabled = config.crashEnabled,
            playsLikeEnabled = config.playsLikeEnabled,
            handsFreeImpactEnabled = enabled,
            inputSize = config.inputSize,
            reducedRate = config.reducedRate,
            source = FeatureFlagConfig.Source.OVERRIDE,
        )
    }

    fun setHudEnabled(enabled: Boolean) {
        config = config.copy(
            hudEnabled = enabled,
            fieldTestModeEnabled = config.fieldTestModeEnabled,
            hudTracerEnabled = config.hudTracerEnabled,
            analyticsEnabled = config.analyticsEnabled,
            crashEnabled = config.crashEnabled,
            playsLikeEnabled = config.playsLikeEnabled,
            inputSize = config.inputSize,
            reducedRate = config.reducedRate,
            source = FeatureFlagConfig.Source.OVERRIDE,
        )
    }

    fun setHudTracerEnabled(enabled: Boolean) {
        config = config.copy(
            hudTracerEnabled = enabled,
            fieldTestModeEnabled = config.fieldTestModeEnabled,
            hudEnabled = config.hudEnabled,
            analyticsEnabled = config.analyticsEnabled,
            crashEnabled = config.crashEnabled,
            playsLikeEnabled = config.playsLikeEnabled,
            inputSize = config.inputSize,
            reducedRate = config.reducedRate,
            source = FeatureFlagConfig.Source.OVERRIDE,
        )
    }

    fun setFieldTestModeEnabled(enabled: Boolean) {
        config = config.copy(
            hudEnabled = config.hudEnabled,
            hudTracerEnabled = config.hudTracerEnabled,
            fieldTestModeEnabled = enabled,
            analyticsEnabled = config.analyticsEnabled,
            crashEnabled = config.crashEnabled,
            playsLikeEnabled = config.playsLikeEnabled,
            inputSize = config.inputSize,
            reducedRate = config.reducedRate,
            source = FeatureFlagConfig.Source.OVERRIDE,
        )
    }
}
