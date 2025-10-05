package com.golfiq.hud.analytics

import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.min
import org.json.JSONObject

internal class CrashTelemetryBridge(private val baseUrl: URL) {
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "crash-telemetry").apply { isDaemon = true }
    }

    fun postCrash(throwable: Throwable, consented: Boolean, enabled: Boolean) {
        if (!consented || !enabled) {
            return
        }
        val stack = throwable.stackTrace
            .take(MAX_STACK_FRAMES)
            .joinToString(separator = "\n") { frame ->
                "${frame.className}.${frame.methodName}(${frame.fileName}:${frame.lineNumber})"
            }
        val payload = JSONObject()
            .put("event", "app_crash")
            .put("message", throwable.message ?: throwable.javaClass.name)
            .put("exception", throwable.javaClass.name)
            .put("stack", stack)
            .put("frames", min(throwable.stackTrace.size, MAX_STACK_FRAMES))
            .put("thread", Thread.currentThread().name)
            .put("timestamp", System.currentTimeMillis())

        executor.execute {
            val endpoint = URL(baseUrl, "/telemetry")
            val connection = (endpoint.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                doOutput = true
            }
            runCatching {
                BufferedWriter(OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8)).use { writer ->
                    writer.write(payload.toString())
                }
                connection.responseCode // force request
            }.onFailure {
                // Swallow errors to avoid masking the original crash.
            }.also {
                connection.disconnect()
            }
        }
    }

    fun shutdown() {
        executor.shutdown()
        executor.awaitTermination(500, TimeUnit.MILLISECONDS)
    }

    private companion object {
        private const val MAX_STACK_FRAMES = 50
        private const val TIMEOUT_MS = 2_500
    }
}
