package com.golfiq.hud.model

data class FeatureFlagConfig(
    val hudWindHintEnabled: Boolean,
    val hudTargetLineEnabled: Boolean,
    val hudBatterySaverEnabled: Boolean,
    val source: Source,
) {
    enum class Source { DEFAULT, FEATURE_SERVICE, OVERRIDE }
}