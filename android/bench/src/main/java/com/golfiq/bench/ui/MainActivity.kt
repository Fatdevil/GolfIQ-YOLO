package com.golfiq.bench.ui

import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.golfiq.bench.R
import com.golfiq.bench.config.BenchmarkConfig
import com.golfiq.bench.data.FrameRepository
import com.golfiq.bench.runtime.RuntimeFactory
import com.golfiq.bench.telemetry.TelemetryClient
import com.golfiq.bench.telemetry.TelemetryPayload
import com.golfiq.bench.util.BenchmarkRunner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.io.use

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val status = findViewById<TextView>(R.id.statusText)
        val summary = findViewById<TextView>(R.id.summaryText)
        val config = BenchmarkConfig.fromIntent(intent)

        lifecycleScope.launch {
            status.setText(R.string.bench_status_running)
            val telemetryClient = TelemetryClient(this@MainActivity)
            val frames = withContext(Dispatchers.IO) {
                FrameRepository(this@MainActivity).load()
            }
            val reports = mutableListOf<TelemetryPayload>()
            for (runtime in config.runtimes) {
                val engine = RuntimeFactory.create(this@MainActivity, runtime)
                if (engine == null) {
                    reports.add(TelemetryPayload.skipped(runtime, "runtime_unavailable"))
                    continue
                }
                engine.use {
                    val runner = BenchmarkRunner(this@MainActivity, frames, config, engine)
                    val report = runCatching {
                        withContext(Dispatchers.IO) { runner.run() }
                    }.getOrElse { throwable ->
                        TelemetryPayload.failed(runtime, throwable)
                    }
                    reports.add(report)
                }
            }
            telemetryClient.postBatch(reports)
            status.setText(R.string.bench_status_done)
            summary.text = reports.joinToString(separator = "\n") { payload ->
                val statusLabel = payload.status.name.lowercase()
                "${payload.runtime} [$statusLabel]: fps=${"%.1f".format(payload.metrics.fpsAvg)} p50=${payload.metrics.latencyP50Ms}ms"
            }
        }
    }
}
