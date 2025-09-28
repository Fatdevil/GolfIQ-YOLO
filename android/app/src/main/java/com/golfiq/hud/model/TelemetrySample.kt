package com.golfiq.hud.model

import java.time.Instant
import java.util.UUID

data class TelemetrySample(
    val id: UUID,
    val sessionId: UUID,
    val timestamp: Instant,
    val metric: String,
    val value: Double,
    val deviceClass: String,
    val sampled: Boolean,
)