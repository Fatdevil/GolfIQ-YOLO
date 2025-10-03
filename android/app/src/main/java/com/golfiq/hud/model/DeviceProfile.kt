package com.golfiq.hud.model

import com.golfiq.hud.inference.RuntimeMode

data class DeviceProfile(
    val id: String,
    val osVersion: String,
    val chipset: String,
    val thermalThresholds: Map<String, Double>,
    val batteryCapacityMah: Int,
    val tier: Tier,
    val estimatedFps: Double,
    val defaultRuntime: RuntimeMode,
    val lastEvaluatedAtMillis: Long,
) {
    enum class Tier { A, B, C }
}
