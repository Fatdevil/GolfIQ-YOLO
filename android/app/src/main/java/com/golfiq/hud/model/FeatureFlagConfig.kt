package com.golfiq.hud.model

import com.golfiq.hud.model.DeviceProfile.Tier

/**
 * Represents feature toggles that can be driven by remote config, device tiering, or
 * explicit overrides from the Settings surface.
 */
data class FeatureFlagConfig(
    val hudEnabled: Boolean = false,
    val hudTracerEnabled: Boolean = false,
    val fieldTestModeEnabled: Boolean = false,
    val hudWindHintEnabled: Boolean,
    val hudTargetLineEnabled: Boolean,
    val hudBatterySaverEnabled: Boolean,
    val handsFreeImpactEnabled: Boolean,
    val analyticsEnabled: Boolean,
    val crashEnabled: Boolean,
    val inputSize: Int,
    val reducedRate: Boolean,
    val source: Source = Source.DEFAULT,
) {
    enum class Source { DEFAULT, FEATURE_SERVICE, REMOTE_CONFIG, OVERRIDE }

    companion object {
        fun forTier(tier: Tier): FeatureFlagConfig {
            return when (tier) {
                Tier.A -> FeatureFlagConfig(
                    hudEnabled = false,
                    hudTracerEnabled = false,
                    fieldTestModeEnabled = false,
                    hudWindHintEnabled = true,
                    hudTargetLineEnabled = true,
                    hudBatterySaverEnabled = false,
                    handsFreeImpactEnabled = true,
                    analyticsEnabled = true,
                    crashEnabled = true,
                    inputSize = 320,
                    reducedRate = false,
                    source = Source.DEFAULT,
                )
                Tier.B -> FeatureFlagConfig(
                    hudEnabled = false,
                    hudTracerEnabled = false,
                    fieldTestModeEnabled = false,
                    hudWindHintEnabled = true,
                    hudTargetLineEnabled = true,
                    hudBatterySaverEnabled = true,
                    handsFreeImpactEnabled = true,
                    analyticsEnabled = true,
                    crashEnabled = true,
                    inputSize = 320,
                    reducedRate = true,
                    source = Source.DEFAULT,
                )
                Tier.C -> FeatureFlagConfig(
                    hudEnabled = false,
                    hudTracerEnabled = false,
                    fieldTestModeEnabled = false,
                    hudWindHintEnabled = false,
                    hudTargetLineEnabled = false,
                    hudBatterySaverEnabled = true,
                    handsFreeImpactEnabled = false,
                    analyticsEnabled = true,
                    crashEnabled = true,
                    inputSize = 224,
                    reducedRate = true,
                    source = Source.DEFAULT,
                )
            }
        }
    }
}
