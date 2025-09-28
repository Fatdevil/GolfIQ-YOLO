package com.golfiq.hud.model

import java.time.Instant
import java.util.UUID

data class HUDSession(
    val id: UUID,
    val platform: String,
    val deviceModel: String,
    val osVersion: String,
    val startTimestamp: Instant,
    val endTimestamp: Instant?,
    val thermalEvents: List<ThermalEvent>,
    val averageFps: Double,
    val latencyMsP50: Double,
    val latencyMsP90: Double,
    val batteryDeltaPercent: Double,
    val fallbackTriggered: Boolean,
    val offlineDurationMs: Int,
)