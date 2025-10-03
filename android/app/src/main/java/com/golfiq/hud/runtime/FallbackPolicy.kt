package com.golfiq.hud.runtime

enum class FallbackAction(val wireName: String) {
    NONE("none"),
    REDUCE_HUD("reduce_hud"),
    SWITCH_TO_2D("switch_to_2d")
}

object FallbackPolicy {
    const val THERMAL_MAX = "SEVERE"
    const val BATTERY_DROP_15M_MAX = 9.0

    private val thermalOrder = listOf("NONE", "LIGHT", "MODERATE", "SEVERE", "CRITICAL")

    fun evaluate(thermal: String, drop15m: Double): FallbackAction {
        val normalized = thermal.uppercase()
        val severityIndex = thermalOrder.indexOf(normalized).takeIf { it >= 0 } ?: 0
        val thresholdIndex = thermalOrder.indexOf(THERMAL_MAX).takeIf { it >= 0 } ?: thermalOrder.lastIndex

        if (severityIndex >= thresholdIndex) {
            return FallbackAction.SWITCH_TO_2D
        }

        if (drop15m > BATTERY_DROP_15M_MAX) {
            return FallbackAction.REDUCE_HUD
        }

        return FallbackAction.NONE
    }
}
