package com.golfiq.hud.model

data class DeviceProfile(
    val id: String,
    val osVersion: String,
    val chipset: String,
    val thermalThresholds: Map<String, Double>,
    val batteryCapacityMah: Int,
)