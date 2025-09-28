package com.golfiq.hud.model

import java.time.Instant
import java.util.UUID

data class Anchor(
    val id: UUID,
    val sessionId: UUID,
    val type: AnchorType,
    val position: Triple<Double, Double, Double>,
    val normal: Triple<Double, Double, Double>,
    val stabilityConfidence: Double,
    val lastRevalidatedAt: Instant,
    val driftMeters: Double,
) {
    enum class AnchorType { PIN, LAYUP, RETICLE, GROUND_PLANE }
}