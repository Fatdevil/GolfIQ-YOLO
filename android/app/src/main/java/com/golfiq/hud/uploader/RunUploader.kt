package com.golfiq.hud.uploader

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.TimeUnit
import org.json.JSONObject

class RunUploader(private val context: Context, private val baseUrl: URL) {

    fun enqueue(runId: String, archive: File) {
        val work = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(buildConstraints(context))
            .setInputData(
                workDataOf(
                    KEY_RUN_ID to runId,
                    KEY_ARCHIVE_PATH to archive.absolutePath,
                    KEY_BASE_URL to baseUrl.toString(),
                ),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "$WORK_NAME-$runId",
            ExistingWorkPolicy.REPLACE,
            work,
        )
    }

    companion object {
        private const val WORK_NAME = "run-upload"
        internal const val KEY_RUN_ID = "run_id"
        internal const val KEY_ARCHIVE_PATH = "archive_path"
        internal const val KEY_BASE_URL = "base_url"

        private fun buildConstraints(context: Context): Constraints {
            return Constraints.Builder()
                .setRequiredNetworkType(preferredNetworkType(context))
                .build()
        }

        private fun preferredNetworkType(context: Context): NetworkType {
            val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val active = manager?.activeNetwork ?: return NetworkType.CONNECTED
            val capabilities = manager.getNetworkCapabilities(active)
            return if (capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true) {
                NetworkType.UNMETERED
            } else {
                NetworkType.CONNECTED
            }
        }
    }

    class UploadWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {

        override fun doWork(): Result {
            val runId = inputData.getString(KEY_RUN_ID) ?: return Result.failure()
            val archivePath = inputData.getString(KEY_ARCHIVE_PATH) ?: return Result.failure()
            val baseUrlString = inputData.getString(KEY_BASE_URL) ?: return Result.failure()

            val archive = File(archivePath)
            if (!archive.exists()) {
                return Result.failure()
            }

            return try {
                val start = SystemClock.elapsedRealtime()
                val baseUrl = URL(baseUrlString)
                val intent = requestUploadIntent(baseUrl, runId)
                when {
                    intent.url != null -> performPresignedUpload(intent.url, archive, intent.headers)
                    intent.formUrl != null -> performMultipartUpload(baseUrl, intent.formUrl, intent.key, archive)
                    else -> throw IllegalStateException("No upload target")
                }
                val duration = SystemClock.elapsedRealtime() - start
                postTelemetry(baseUrl, intent.key, archive.length(), duration)
                Result.success()
            } catch (ex: RetryableUploadException) {
                Result.retry()
            } catch (ex: IOException) {
                Result.retry()
            } catch (_: Exception) {
                Result.failure()
            }
        }

        private fun requestUploadIntent(baseUrl: URL, runId: String): UploadIntent {
            val requestUrl = URL(baseUrl, "runs/upload-url")
            val connection = (requestUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 3_000
                readTimeout = 5_000
            }
            val payload = JSONObject().put("runId", runId).toString()
            return try {
                OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
                    writer.write(payload)
                }
                val status = connection.responseCode
                if (status != HttpURLConnection.HTTP_OK) {
                    throw RetryableUploadException("upload-url status=$status")
                }
                val body = connection.inputStream.bufferedReader().use(BufferedReader::readText)
                val json = JSONObject(body)
                val headers = mutableMapOf<String, String>()
                if (json.has("headers")) {
                    val headerJson = json.getJSONObject("headers")
                    for (key in headerJson.keys()) {
                        headers[key] = headerJson.getString(key)
                    }
                }
                UploadIntent(
                    url = json.optString("url").takeIf { it.isNotBlank() },
                    formUrl = json.optString("formUrl").takeIf { it.isNotBlank() },
                    key = json.getString("key"),
                    headers = headers.takeIf { it.isNotEmpty() },
                )
            } finally {
                connection.disconnect()
            }
        }

        private fun performPresignedUpload(urlString: String, archive: File, headers: Map<String, String>?) {
            val connection = (URL(urlString).openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"
                doOutput = true
                connectTimeout = 5_000
                readTimeout = 15_000
                setRequestProperty("Content-Length", archive.length().toString())
                headers?.forEach { (key, value) -> setRequestProperty(key, value) }
                if (headers?.containsKey("Content-Type") != true) {
                    setRequestProperty("Content-Type", "application/zip")
                }
            }
            try {
                FileInputStream(archive).use { input ->
                    BufferedOutputStream(connection.outputStream).use { output ->
                        input.copyTo(output)
                    }
                }
                val status = connection.responseCode
                if (status !in 200..299) {
                    throw RetryableUploadException("put status=$status")
                }
            } finally {
                connection.disconnect()
            }
        }

        private fun performMultipartUpload(baseUrl: URL, formUrl: String, key: String, archive: File) {
            val boundary = "Boundary-${UUID.randomUUID()}"
            val requestUrl = URL(baseUrl, formUrl)
            val connection = (requestUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 5_000
                readTimeout = 15_000
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            }
            try {
                DataOutputStream(connection.outputStream).use { stream ->
                    stream.writeBytes("--$boundary\r\n")
                    stream.writeBytes("Content-Disposition: form-data; name=\"key\"\r\n\r\n")
                    stream.writeBytes(key)
                    stream.writeBytes("\r\n")

                    stream.writeBytes("--$boundary\r\n")
                    stream.writeBytes(
                        "Content-Disposition: form-data; name=\"file\"; filename=\"${archive.name}\"\r\n",
                    )
                    stream.writeBytes("Content-Type: application/zip\r\n\r\n")
                    FileInputStream(archive).use { input ->
                        input.copyTo(stream)
                    }
                    stream.writeBytes("\r\n--$boundary--\r\n")
                }
                val status = connection.responseCode
                if (status !in 200..299) {
                    throw RetryableUploadException("multipart status=$status")
                }
            } finally {
                connection.disconnect()
            }
        }

        private fun postTelemetry(baseUrl: URL, key: String, size: Long, durationMs: Long) {
            val telemetryUrl = URL(baseUrl, "telemetry")
            val connection = (telemetryUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 2_000
                readTimeout = 4_000
                setRequestProperty("Content-Type", "application/json")
            }
            val payload = JSONObject()
                .put("event", "upload_complete")
                .put("key", key)
                .put("size", size)
                .put("durationMs", durationMs)
            try {
                OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                }
                connection.inputStream?.close()
            } catch (_: Exception) {
                connection.errorStream?.close()
            } finally {
                connection.disconnect()
            }
        }
    }

    data class UploadIntent(
        val url: String?,
        val formUrl: String?,
        val key: String,
        val headers: Map<String, String>?,
    )

    class RetryableUploadException(message: String) : Exception(message)
}
