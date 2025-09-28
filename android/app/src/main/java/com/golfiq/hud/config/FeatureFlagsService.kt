package com.golfiq.hud.config

import com.golfiq.hud.model.FeatureFlagConfig

class FeatureFlagsService(
    defaults: FeatureFlagConfig = FeatureFlagConfig(true, true, true, FeatureFlagConfig.Source.DEFAULT)
) {
    private var config: FeatureFlagConfig = defaults

    fun current(): FeatureFlagConfig = config

    fun applyRemote(overrides: FeatureFlagConfig) {
        config = overrides
    }
}