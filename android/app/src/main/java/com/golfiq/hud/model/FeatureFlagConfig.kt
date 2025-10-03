package com.golfiq.hud.model

import com.golfiq.hud.model.DeviceProfile.Tier

/**
 * Represents feature toggles that can be driven by remote config, device tiering, or
 * explicit overrides from the Settings surface.
 */
data class FeatureFlagConfig(
    val hudWindHintEnabled: Boolean,
    val hudTargetLineEnabled: Boolean,
    val hudBatterySaverEnabled: Boolean,
    val handsFreeImpactEnabled: Boolean,
    val source: Source,
) {
    enum class Source { DEFAULT, FEATURE_SERVICE, OVERRIDE }

    companion object {
        fun forTier(tier: Tier): FeatureFlagConfig {
            return when (tier) {
                Tier.A -> FeatureFlagConfig(
                    hudWindHintEnabled = true,
                    hudTargetLineEnabled = true,
                    hudBatterySaverEnabled = false,
                    handsFreeImpactEnabled = true,
                    source = Source.DEFAULT,
                )
                Tier.B -> FeatureFlagConfig(
                    hudWindHintEnabled = true,
                    hudTargetLineEnabled = true,
                    hudBatterySaverEnabled = true,
                    handsFreeImpactEnabled = true,
                    source = Source.DEFAULT,
                )
                Tier.C -> FeatureFlagConfig(
                    hudWindHintEnabled = false,
                    hudTargetLineEnabled = false,
                    hudBatterySaverEnabled = true,
                    handsFreeImpactEnabled = false,
                    source = Source.DEFAULT,
                )
            }
        }
    }
}
