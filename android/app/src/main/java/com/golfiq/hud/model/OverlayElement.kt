package com.golfiq.hud.model

import java.util.UUID

data class OverlayElement(
    val id: UUID,
    val sessionId: UUID,
    val anchorId: UUID,
    val type: ElementType,
    val distanceMeters: Double?,
    val windTier: String?,
    val isVisible: Boolean,
) {
    enum class ElementType {
        DISTANCE_MARKER,
        LAYUP_MARKER,
        TARGET_LINE,
        WIND_HINT,
        SAFETY_BANNER,
        OFFLINE_BADGE,
        PERF_OVERLAY
    }
}