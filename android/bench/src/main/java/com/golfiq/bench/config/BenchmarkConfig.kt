package com.golfiq.bench.config

import android.content.Intent
import com.golfiq.bench.runtime.RuntimeKind
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

data class BenchmarkConfig(
    val runtimes: List<RuntimeKind>,
    val warmupFrameCount: Int,
    val timedLoopDuration: Duration,
    val extendedLoopDuration: Duration?,
    val telemetryBatchSize: Int,
    val captureThermals: Boolean,
    val captureBattery: Boolean,
) {
    companion object {
        private const val EXTRA_RUNTIMES = "runtimes"
        private const val EXTRA_EXTENDED_MINUTES = "extendedMinutes"
        private const val EXTRA_WARMUP = "warmup"

        fun fromIntent(intent: Intent?): BenchmarkConfig {
            val runtimeOverride = intent?.getStringExtra(EXTRA_RUNTIMES)
                ?.split(',')
                ?.mapNotNull { RuntimeKind.fromWireName(it.trim()) }
            val runtimes = runtimeOverride?.takeIf { it.isNotEmpty() } ?: RuntimeKind.values().toList()
            val warmup = intent?.getIntExtra(EXTRA_WARMUP, DEFAULT_WARMUP_FRAMES) ?: DEFAULT_WARMUP_FRAMES
            val extendedMinutes = intent?.getIntExtra(EXTRA_EXTENDED_MINUTES, 0) ?: 0
            val extendedDuration = extendedMinutes.takeIf { it > 0 }?.minutes
            return BenchmarkConfig(
                runtimes = runtimes,
                warmupFrameCount = warmup,
                timedLoopDuration = 60.seconds,
                extendedLoopDuration = extendedDuration,
                telemetryBatchSize = 8,
                captureThermals = true,
                captureBattery = extendedDuration != null,
            )
        }

        private const val DEFAULT_WARMUP_FRAMES = 45
    }
}
