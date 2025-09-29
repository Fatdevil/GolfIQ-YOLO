package com.golfiq.hud.model

data class ShotEvent(
    val id: String,
    val sessionId: String,
    val telemetry: Telemetry
)
