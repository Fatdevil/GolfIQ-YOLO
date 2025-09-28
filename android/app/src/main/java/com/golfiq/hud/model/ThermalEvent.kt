package com.golfiq.hud.model

import java.time.Instant

data class ThermalEvent(
    val timestamp: Instant,
    val severity: Severity,
    val actionTaken: ActionTaken,
) {
    enum class Severity { INFO, WARNING, CRITICAL }
    enum class ActionTaken { LOG_ONLY, PROMPT_USER, AUTO_REDUCE_FEATURES }
}