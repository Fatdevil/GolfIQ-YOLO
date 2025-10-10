package com.golfiq.bench.util

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.golfiq.bench.config.BenchmarkConfig
import com.golfiq.bench.data.FrameSequence
import com.golfiq.bench.runtime.InferenceRuntime
import com.golfiq.bench.runtime.RuntimeKind
import com.golfiq.bench.runtime.model.InferenceResult
import com.golfiq.bench.telemetry.TelemetryPayload
import kotlin.math.max

class BenchmarkRunner(
    private val context: Context,
    private val frames: FrameSequence,
    private val config: BenchmarkConfig,
    private val runtime: InferenceRuntime,
) {
    fun run(): TelemetryPayload {
        val metrics = MetricCollector(runtime.kind)
        runtime.prepare()
        val start = SystemClock.elapsedRealtime()
        var warmupCount = 0
        while (warmupCount < config.warmupFrameCount) {
            execute(frames.nextFrame())
            warmupCount++
        }
        metrics.coldStartMs = (SystemClock.elapsedRealtime() - start).toInt()

        val timedEnd = SystemClock.elapsedRealtime() + config.timedLoopDuration.inWholeMilliseconds
        while (SystemClock.elapsedRealtime() < timedEnd) {
            val frame = frames.nextFrame()
            val result = execute(frame)
            metrics.addTimedResult(result)
        }

        val batteryBefore = captureBattery()
        val thermalBefore = captureThermal()
        config.extendedLoopDuration?.let { duration ->
            val extendedEnd = SystemClock.elapsedRealtime() + duration.inWholeMilliseconds
            while (SystemClock.elapsedRealtime() < extendedEnd) {
                val frame = frames.nextFrame()
                val result = execute(frame)
                metrics.addExtendedResult(result)
            }
        }
        val batteryAfter = captureBattery()
        val thermalAfter = captureThermal()

        metrics.thermalStatus = thermalAfter ?: thermalBefore
        metrics.batteryDelta = if (batteryBefore != null && batteryAfter != null) {
            batteryAfter - batteryBefore
        } else null
        metrics.modelSizeMb = frames.modelSize(runtime.modelAssetData)
        metrics.modelParamSizeMb = runtime.modelAssetParam?.let { frames.modelSize(it) }
        metrics.modelBinSizeMb = runtime.modelAssetBin?.let { frames.modelSize(it) }
        metrics.memoryMb = RuntimeMemory.sample()

        return metrics.summary()
    }

    private fun execute(frame: com.golfiq.bench.runtime.model.InferenceFrame): InferenceResult {
        val before = SystemClock.elapsedRealtime()
        val result = runtime.run(frame)
        val latency = SystemClock.elapsedRealtime() - before
        return result.copy(latencyMillis = latency)
    }

    private fun captureBattery(): Int? {
        if (!config.captureBattery) return null
        val manager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun captureThermal(): Int? {
        if (!config.captureThermals) return null
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            power?.currentThermalStatus
        } else null
    }
}

private class MetricCollector(private val runtime: RuntimeKind) {
    private val timedLatencies = mutableListOf<Long>()
    private val timedFps = mutableListOf<Float>()
    private val extendedLatencies = mutableListOf<Long>()
    private val extendedFps = mutableListOf<Float>()

    var coldStartMs: Int = 0
    var batteryDelta: Int? = null
    var thermalStatus: Int? = null
    var modelSizeMb: Double? = null
    var modelParamSizeMb: Double? = null
    var modelBinSizeMb: Double? = null
    var memoryMb: Double? = null

    fun addTimedResult(result: InferenceResult) {
        timedLatencies += result.latencyMillis
        timedFps += 1000f / max(result.latencyMillis, 1L)
    }

    fun addExtendedResult(result: InferenceResult) {
        extendedLatencies += result.latencyMillis
        extendedFps += 1000f / max(result.latencyMillis, 1L)
    }

    fun summary(): TelemetryPayload = TelemetryPayload(
        runtime = runtime.wireName,
        metrics = TelemetryPayload.Metrics(
            fpsAvg = timedFps.averageOrZero(),
            fpsMin = timedFps.minOrNull()?.toDouble() ?: 0.0,
            fpsMax = timedFps.maxOrNull()?.toDouble() ?: 0.0,
            latencyP50Ms = timedLatencies.percentile(0.5),
            latencyP95Ms = timedLatencies.percentile(0.95),
            coldStartMs = coldStartMs,
            modelFileMb = modelSizeMb,
            modelParamMb = modelParamSizeMb,
            modelBinMb = modelBinSizeMb,
            rssMemMb = memoryMb,
            batteryDelta15m = batteryDelta,
            thermalState = thermalStatus,
            extendedFpsAvg = extendedFps.averageOrZero(),
        ),
        metadata = TelemetryPayload.Metadata(timestampMs = System.currentTimeMillis())
    )
}

private fun List<Float>.averageOrZero(): Double = if (isEmpty()) 0.0 else average()

private fun List<Long>.percentile(p: Double): Double {
    if (isEmpty()) return 0.0
    val sorted = sorted()
    val index = ((sorted.size - 1) * p).toInt().coerceIn(0, sorted.size - 1)
    return sorted[index].toDouble()
}

private object RuntimeMemory {
    fun sample(): Double? = try {
        val info = android.os.Debug.MemoryInfo()
        android.os.Debug.getMemoryInfo(info)
        info.totalPss / 1024.0
    } catch (t: Throwable) {
        Log.w("BenchmarkRunner", "Failed to read memory", t)
        null
    }
}
