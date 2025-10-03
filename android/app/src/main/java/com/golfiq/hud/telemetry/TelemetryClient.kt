package com.golfiq.hud.telemetry

import com.golfiq.hud.inference.RuntimeMode
import com.golfiq.hud.model.DeviceProfile

data class MetricRecord(
    val name: String,
    val value: Double,
    val deviceClass: String,
    val sampled: Boolean,
)

data class DeviceProfilePayload(
    val id: String,
    val tier: String,
    val estimatedFps: Double,
    val defaultRuntime: String,
    val activeRuntime: String,
)

class TelemetryClient {
    private val metrics = mutableListOf<MetricRecord>()
    private val deviceProfiles = mutableListOf<DeviceProfilePayload>()
    private var impactTriggerCount: Int = 0

    fun emit(name: String, value: Double, deviceClass: String, sampled: Boolean) {
        metrics += MetricRecord(name, value, deviceClass, sampled)
    }

    fun postDeviceProfile(profile: DeviceProfile, activeRuntime: RuntimeMode) {
        deviceProfiles += DeviceProfilePayload(
            id = profile.id,
            tier = profile.tier.name,
            estimatedFps = profile.estimatedFps,
            defaultRuntime = profile.defaultRuntime.storageValue,
            activeRuntime = activeRuntime.storageValue,
        )
    }

    fun logImpactTriggerEvent(magnitudeDb: Double) {
        impactTriggerCount += 1
        emit(name = "impact_trigger", value = magnitudeDb, deviceClass = "audio", sampled = true)
    }

    fun logHudCalibration() {
        emit(name = "arhud_calibrate", value = 1.0, deviceClass = "arhud", sampled = false)
    }

    fun logHudRecenter() {
        emit(name = "arhud_recenter", value = 1.0, deviceClass = "arhud", sampled = false)
    }

    fun logHudFps(fps: Double) {
        emit(name = "arhud_fps", value = fps, deviceClass = "arhud", sampled = true)
    }

    fun all(): List<MetricRecord> = metrics.toList()
    fun postedProfiles(): List<DeviceProfilePayload> = deviceProfiles.toList()
    fun impactTriggerEvents(): Int = impactTriggerCount
}
