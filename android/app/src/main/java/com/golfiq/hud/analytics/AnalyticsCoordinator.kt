package com.golfiq.hud.analytics

import android.content.Context
import com.golfiq.hud.model.FeatureFlagConfig
import com.golfiq.hud.telemetry.TelemetryClient
import java.net.URL

class AnalyticsCoordinator(
    private val context: Context,
    private val telemetryClient: TelemetryClient,
    baseUrl: URL,
    private val dsnProvider: () -> String?,
) {
    private val crashBridge = CrashTelemetryBridge(URL(baseUrl, "telemetry"))
    private var lastSignature: String? = null

    fun apply(flags: FeatureFlagConfig, configHash: String?) {
        val dsn = dsnProvider()?.takeIf { !it.isNullOrBlank() }
        AnalyticsInit.initIfEnabled(context, flags, dsn)
        crashBridge.updateFlags(flags)
        val signature = listOf(
            configHash ?: "local",
            flags.analyticsEnabled,
            flags.crashEnabled,
            !dsn.isNullOrEmpty(),
        ).joinToString(":")
        if (signature != lastSignature) {
            telemetryClient.logAnalyticsConfig(
                analyticsEnabled = flags.analyticsEnabled,
                crashEnabled = flags.crashEnabled,
                dsnPresent = !dsn.isNullOrEmpty(),
                configHash = configHash ?: "local",
            )
            lastSignature = signature
        }
    }
}
