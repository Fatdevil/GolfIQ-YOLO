package com.golfiq.bench.telemetry

import com.golfiq.bench.runtime.RuntimeKind
import org.json.JSONObject

data class TelemetryPayload(
    val runtime: String,
    val metrics: Metrics,
    val metadata: Metadata,
    val status: Status = Status.SUCCESS,
    val error: String? = null,
) {
    enum class Status { SUCCESS, SKIPPED, ERROR }

    data class Metrics(
        val fpsAvg: Double,
        val fpsMin: Double,
        val fpsMax: Double,
        val latencyP50Ms: Double,
        val latencyP95Ms: Double,
        val coldStartMs: Int,
        val modelFileMb: Double?,
        val modelParamMb: Double?,
        val modelBinMb: Double?,
        val rssMemMb: Double?,
        val batteryDelta15m: Int?,
        val thermalState: Int?,
        val extendedFpsAvg: Double?,
    )

    data class Metadata(
        val timestampMs: Long,
        val device: String = android.os.Build.MODEL ?: "unknown",
        val apiLevel: Int = android.os.Build.VERSION.SDK_INT,
    )

    fun toJson(): JSONObject = JSONObject().apply {
        put("runtime", runtime)
        put("status", status.name.lowercase())
        put("metrics", JSONObject().apply {
            put("fps_avg", metrics.fpsAvg)
            put("fps_min", metrics.fpsMin)
            put("fps_max", metrics.fpsMax)
            put("latency_ms_p50", metrics.latencyP50Ms)
            put("latency_ms_p95", metrics.latencyP95Ms)
            put("cold_start_ms", metrics.coldStartMs)
            metrics.modelFileMb?.let { put("model_file_mb", it) }
            metrics.modelParamMb?.let { put("model_param_mb", it) }
            metrics.modelBinMb?.let { put("model_bin_mb", it) }
            metrics.rssMemMb?.let { put("rss_mem_mb", it) }
            metrics.batteryDelta15m?.let { put("battery_delta_15m", it) }
            metrics.thermalState?.let { put("thermal_state", it) }
            metrics.extendedFpsAvg?.let { put("extended_fps_avg", it) }
        })
        put("metadata", JSONObject().apply {
            put("timestamp_ms", metadata.timestampMs)
            put("device", metadata.device)
            put("api_level", metadata.apiLevel)
        })
        error?.let { put("error", it) }
    }

    companion object {
        fun fromMetrics(payload: TelemetryPayload): TelemetryPayload = payload

        fun skipped(kind: RuntimeKind, reason: String): TelemetryPayload = TelemetryPayload(
            runtime = kind.wireName,
            metrics = Metrics(
                fpsAvg = 0.0,
                fpsMin = 0.0,
                fpsMax = 0.0,
                latencyP50Ms = 0.0,
                latencyP95Ms = 0.0,
                coldStartMs = 0,
                modelFileMb = null,
                modelParamMb = null,
                modelBinMb = null,
                rssMemMb = null,
                batteryDelta15m = null,
                thermalState = null,
                extendedFpsAvg = null,
            ),
            metadata = Metadata(timestampMs = System.currentTimeMillis()),
            status = Status.SKIPPED,
            error = reason,
        )

        fun failed(kind: RuntimeKind, throwable: Throwable): TelemetryPayload = TelemetryPayload(
            runtime = kind.wireName,
            metrics = Metrics(
                fpsAvg = 0.0,
                fpsMin = 0.0,
                fpsMax = 0.0,
                latencyP50Ms = 0.0,
                latencyP95Ms = 0.0,
                coldStartMs = 0,
                modelFileMb = null,
                modelParamMb = null,
                modelBinMb = null,
                rssMemMb = null,
                batteryDelta15m = null,
                thermalState = null,
                extendedFpsAvg = null,
            ),
            metadata = Metadata(timestampMs = System.currentTimeMillis()),
            status = Status.ERROR,
            error = throwable.message ?: throwable::class.java.simpleName,
        )
    }
}
