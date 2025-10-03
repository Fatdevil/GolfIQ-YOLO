package com.golfiq.bench.telemetry

import org.json.JSONObject

data class ThermalBatterySample(
    val timestampMs: Long,
    val thermalStatus: Int?,
    val batteryPercent: Int?,
    val batteryDeltaPercent: Double?,
    val action: String,
    val trigger: String,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("type", "thermal_battery_sample")
        put("timestamp_ms", timestampMs)
        thermalStatus?.let { put("thermal_status", it) }
        batteryPercent?.let { put("battery_percent", it) }
        batteryDeltaPercent?.let { put("battery_delta_percent", it) }
        put("policy_action", action)
        put("trigger", trigger)
        put("device", android.os.Build.MODEL ?: "unknown")
        put("api_level", android.os.Build.VERSION.SDK_INT)
    }
}
