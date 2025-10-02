package com.golfiq.bench.telemetry

import android.content.Context
import android.util.Log
import com.golfiq.bench.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray

class TelemetryClient(context: Context) {
    private val httpClient = OkHttpClient()
    private val endpoint = BuildConfig.TELEMETRY_BASE_URL.trimEnd('/') + "/telemetry"

    suspend fun postBatch(payloads: List<TelemetryPayload>) {
        if (payloads.isEmpty()) return
        withContext(Dispatchers.IO) {
            val json = JSONArray().apply {
                payloads.forEach { put(it.toJson()) }
            }
            val body = json.toString().toRequestBody(JSON.toMediaType())
            val request = Request.Builder().url(endpoint).post(body).build()
            runCatching { httpClient.newCall(request).execute() }
                .onFailure { Log.e(TAG, "Telemetry POST failed", it) }
                .onSuccess { response ->
                    if (!response.isSuccessful) {
                        Log.e(TAG, "Telemetry POST status ${response.code}")
                    } else {
                        Log.i(TAG, "Telemetry POST success: ${response.code}")
                    }
                    response.close()
                }
        }
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private const val TAG = "TelemetryClient"
    }
}
