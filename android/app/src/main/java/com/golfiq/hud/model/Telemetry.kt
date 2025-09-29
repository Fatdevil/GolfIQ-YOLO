package com.golfiq.hud.model

data class Telemetry(
    val timestampMs: Long,
    val club: String?,
    val ballSpeed: Double?,
    val clubSpeed: Double?,
    val launchAngle: Double?,
    val spinRpm: Int?,
    val carryMeters: Double?
)
