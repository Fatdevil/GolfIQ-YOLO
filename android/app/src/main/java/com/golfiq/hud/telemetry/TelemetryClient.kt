package com.golfiq.hud.telemetry

data class MetricRecord(
    val name: String,
    val value: Double,
    val deviceClass: String,
    val sampled: Boolean,
)

class TelemetryClient {
    private val metrics = mutableListOf<MetricRecord>()

    fun emit(name: String, value: Double, deviceClass: String, sampled: Boolean) {
        metrics += MetricRecord(name, value, deviceClass, sampled)
    }

    fun all(): List<MetricRecord> = metrics.toList()
}