package com.golfiq.hud.analytics

import com.golfiq.hud.model.FeatureFlagConfig
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import kotlin.system.exitProcess
import org.json.JSONObject

class CrashTelemetryBridge(
    private val telemetryEndpoint: URL,
    private val platform: String = "android",
) : Thread.UncaughtExceptionHandler {
    @Volatile
    private var crashEnabled: Boolean = false
    @Volatile
    private var previousHandler: Thread.UncaughtExceptionHandler? = Thread.getDefaultUncaughtExceptionHandler()

    fun updateFlags(flags: FeatureFlagConfig) {
        crashEnabled = flags.crashEnabled
        if (crashEnabled) {
            if (Thread.getDefaultUncaughtExceptionHandler() !== this) {
                previousHandler = Thread.getDefaultUncaughtExceptionHandler()
                Thread.setDefaultUncaughtExceptionHandler(this)
            }
        } else if (Thread.getDefaultUncaughtExceptionHandler() === this) {
            Thread.setDefaultUncaughtExceptionHandler(previousHandler)
        }
    }

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        if (crashEnabled) {
            try {
                postCrashEvent()
            } catch (_: Exception) {
                // swallow to avoid interfering with crash propagation
            }
        }
        val delegate = previousHandler
        if (delegate != null && delegate !== this) {
            delegate.uncaughtException(thread, throwable)
        } else {
            exitProcess(2)
        }
    }

    private fun postCrashEvent() {
        val payload = JSONObject()
            .put("event", "app_crash")
            .put("platform", platform)
            .put("sampled", true)
            .put("ts", System.currentTimeMillis())
            .put("thermal", "unknown")
            .put("batteryPct", -1)
        val connection = (telemetryEndpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
            connectTimeout = 2_000
            readTimeout = 2_000
        }
        try {
            OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
                writer.write(payload.toString())
            }
            connection.inputStream?.use { }
        } catch (_: Exception) {
            connection.errorStream?.close()
        } finally {
            connection.disconnect()
        }
    }
}
