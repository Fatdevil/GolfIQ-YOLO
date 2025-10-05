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
    private val events = mutableListOf<Pair<String, Map<String, Any>>>()

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

    fun logBundleRefresh(status: String, etag: String?, ageDays: Int) {
        val payload = mutableMapOf<String, Any>(
            "status" to status,
            "age_days" to ageDays,
        )
        if (!etag.isNullOrEmpty()) {
            payload["etag"] = etag
        }
        send(event = "bundle_refresh", payload = payload)
    }

    fun all(): List<MetricRecord> = metrics.toList()
    fun postedProfiles(): List<DeviceProfilePayload> = deviceProfiles.toList()
    fun impactTriggerEvents(): Int = impactTriggerCount
    fun sentEvents(): List<Pair<String, Map<String, Any>>> = events.toList()

    fun send(event: String, payload: Map<String, Any>) {
        events += event to payload
    }

    fun sendThermalBattery(thermal: String, batteryPct: Double, drop15m: Double, action: String) {
        send(
            event = "thermal_battery",
            payload = mapOf(
                "thermal" to thermal,
                "battery_pct" to batteryPct,
                "drop_15m_pct" to drop15m,
                "action" to action,
            ),
        )
    }

    fun logRemoteConfigActive(
        hash: String,
        profile: DeviceProfile,
        runtime: Map<String, Any>,
        inputSize: Int,
        reducedRate: Boolean,
        analyticsEnabled: Boolean,
        crashEnabled: Boolean,
    ) {
        val payload = mutableMapOf<String, Any>(
            "configHash" to hash,
            "device" to mapOf(
                "id" to profile.id,
                "tier" to profile.tier.name,
                "os" to profile.osVersion,
                "estimatedFps" to profile.estimatedFps,
            ),
            "runtime" to runtime,
            "inputSize" to inputSize,
            "reducedRate" to reducedRate,
            "analyticsEnabled" to analyticsEnabled,
            "crashEnabled" to crashEnabled,
        )
        if (profile.estimatedFps > 0) {
            payload["latencyMs"] = 1000.0 / profile.estimatedFps
        }
        send(event = "remote_config_active", payload = payload)
    }
}
