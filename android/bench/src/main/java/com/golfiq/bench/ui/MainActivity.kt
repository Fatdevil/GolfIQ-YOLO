package com.golfiq.bench.ui

import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.golfiq.bench.R
import com.golfiq.bench.config.BenchmarkConfig
import com.golfiq.bench.data.FrameRepository
import com.golfiq.bench.policy.ThermalBatteryPolicy
import com.golfiq.bench.runtime.RuntimeFactory
import com.golfiq.bench.telemetry.TelemetryClient
import com.golfiq.bench.telemetry.TelemetryPayload
import com.golfiq.bench.util.BenchmarkRunner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.io.use

class MainActivity : ComponentActivity(), ThermalBatteryPolicy.Listener {
    private lateinit var status: TextView
    private lateinit var summary: TextView
    private lateinit var telemetryClient: TelemetryClient
    private lateinit var protectionBanner: MaterialCardView
    private lateinit var protectionBannerText: TextView
    private lateinit var protectionBannerAction: MaterialButton
    private lateinit var policy: ThermalBatteryPolicy

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.statusText)
        summary = findViewById(R.id.summaryText)
        protectionBanner = findViewById(R.id.protectionBanner)
        protectionBannerText = findViewById(R.id.protectionBannerText)
        protectionBannerAction = findViewById(R.id.protectionBannerAction)
        val config = BenchmarkConfig.fromIntent(intent)

        telemetryClient = TelemetryClient(this)
        policy = ThermalBatteryPolicy(
            context = this,
            telemetryClient = telemetryClient,
            telemetryScope = lifecycleScope,
            listener = this,
        )
        lifecycle.addObserver(policy)

        protectionBannerAction.setOnClickListener {
            policy.requestResumeFromFallback()
        }

        lifecycleScope.launch {
            status.setText(R.string.bench_status_running)
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

    override fun onPolicyApplied(
        action: ThermalBatteryPolicy.PolicyAction,
        trigger: ThermalBatteryPolicy.Trigger,
    ) {
        when (action) {
            ThermalBatteryPolicy.PolicyAction.SWITCH_TO_2D -> showProtectionBanner()
            ThermalBatteryPolicy.PolicyAction.REDUCE_REFRESH -> status.text =
                getString(R.string.protection_status_battery)
            ThermalBatteryPolicy.PolicyAction.PAUSE_HEAVY_FEATURES -> status.text =
                getString(R.string.protection_status_heavy_features)
            ThermalBatteryPolicy.PolicyAction.RESUME_REQUESTED,
            ThermalBatteryPolicy.PolicyAction.NONE -> Unit
        }
    }

    override fun onPolicyCleared() {
        protectionBanner.visibility = View.GONE
        if (status.text != getString(R.string.bench_status_done)) {
            status.setText(R.string.bench_status_running)
        }
    }

    private fun showProtectionBanner() {
        if (protectionBanner.visibility != View.VISIBLE) {
            protectionBanner.visibility = View.VISIBLE
            protectionBanner.announceForAccessibility(protectionBannerText.text)
        }
    }
}
