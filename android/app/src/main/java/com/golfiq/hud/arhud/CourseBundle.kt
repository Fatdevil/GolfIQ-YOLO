package com.golfiq.hud.arhud

import android.location.Location
import android.content.Context
import com.golfiq.hud.telemetry.TelemetryClient
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

data class CourseCoordinate(
    val latitude: Double,
    val longitude: Double,
) {
    fun toLocation(): Location {
        return Location("course").apply {
            latitude = this@CourseCoordinate.latitude
            longitude = this@CourseCoordinate.longitude
        }
    }
}

data class CourseBundle(
    val id: String,
    val name: String,
    val pin: CourseCoordinate,
    val greenFront: CourseCoordinate,
    val greenCenter: CourseCoordinate,
    val greenBack: CourseCoordinate,
) {
    fun distancesFrom(location: Location): GreenDistances {
        return GreenDistances(
            front = location.distanceTo(greenFront.toLocation()),
            center = location.distanceTo(greenCenter.toLocation()),
            back = location.distanceTo(greenBack.toLocation()),
        )
    }
}

data class GreenDistances(
    val front: Float,
    val center: Float,
    val back: Float,
) {
    fun formattedYards(): Triple<String, String, String> {
        fun yards(meters: Float): String {
            val yards = meters * 1.09361f
            return String.format("%.0f yd", yards)
        }
        return Triple(yards(front), yards(center), yards(back))
    }
}

class CourseBundleRepository(
    context: Context,
    private val baseUrl: URL,
    private val telemetry: TelemetryClient,
) {
    class NetworkException(message: String, cause: Throwable? = null) : Exception(message, cause)

    private val appContext = context.applicationContext

    fun cached(courseId: String): CourseBundle? {
        val cache = RemoteBundleCache(appContext, courseId)
        val cached = cache.readData() ?: return null
        return runCatching { parseBundle(JSONObject(cached)) }.getOrNull()
    }

    fun refresh(courseId: String, forceRefresh: Boolean = false): CourseBundle {
        val cache = RemoteBundleCache(appContext, courseId)
        val cachedBundle = cached(courseId)
        val metadata = cache.readMetadata()

        if (!forceRefresh && metadata?.isFresh() == true && cachedBundle != null) {
            val age = cache.ageDays()
            telemetry.logBundleRefresh("304", metadata.etag, age)
            return cachedBundle
        }

        return if (forceRefresh) {
            performGet(courseId, cache, null, cachedBundle, null)
        } else {
            performHead(courseId, cache, metadata, cachedBundle)
        }
    }

    private fun performHead(
        courseId: String,
        cache: RemoteBundleCache,
        metadata: RemoteBundleCache.Metadata?,
        cachedBundle: CourseBundle?,
    ): CourseBundle {
        val connection = openConnection(courseId, "HEAD")
        metadata?.etag?.let { connection.setRequestProperty("If-None-Match", it) }

        return try {
            val responseCode = connection.responseCode
            val ttl = parseCacheControl(connection.getHeaderField("Cache-Control"))
            when (responseCode) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> {
                    val age = cache.ageDays()
                    telemetry.logBundleRefresh("304", metadata?.etag, age)
                    cache.writeMetadata(metadata?.etag, ttl)
                    cachedBundle ?: performGet(courseId, cache, metadata?.etag, null, ttl)
                }
                in 200..299 -> {
                    val etag = connection.getHeaderField("ETag") ?: metadata?.etag
                    performGet(courseId, cache, etag, cachedBundle, ttl)
                }
                else -> offlineFallback(cache, cachedBundle, NetworkException("Unexpected response: $responseCode"))
            }
        } catch (t: Throwable) {
            offlineFallback(cache, cachedBundle, t)
        } finally {
            connection.disconnect()
        }
    }

    private fun performGet(
        courseId: String,
        cache: RemoteBundleCache,
        ifNoneMatch: String?,
        cachedBundle: CourseBundle?,
        ttlHintSeconds: Long?,
    ): CourseBundle {
        val connection = openConnection(courseId, "GET")
        ifNoneMatch?.let { connection.setRequestProperty("If-None-Match", it) }

        return try {
            val responseCode = connection.responseCode
            val ttl = ttlHintSeconds ?: parseCacheControl(connection.getHeaderField("Cache-Control"))
            when (responseCode) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> {
                    val age = cache.ageDays()
                    telemetry.logBundleRefresh("304", ifNoneMatch, age)
                    cache.writeMetadata(ifNoneMatch, ttl)
                    return cachedBundle ?: performGet(courseId, cache, null, null, ttl)
                }
                in 200..299 -> {
                    val body = connection.inputStream.use { stream ->
                        BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
                            reader.readText()
                        }
                    }
                    cache.writeData(body)
                    val etag = connection.getHeaderField("ETag")
                    cache.writeMetadata(etag, ttl)
                    telemetry.logBundleRefresh("200", etag, 0)
                    parseBundle(JSONObject(body))
                }
                else -> offlineFallback(cache, cachedBundle, NetworkException("Unexpected response: $responseCode"))
            }
        } catch (t: Throwable) {
            offlineFallback(cache, cachedBundle, t)
        } finally {
            connection.disconnect()
        }
    }

    private fun offlineFallback(
        cache: RemoteBundleCache,
        cachedBundle: CourseBundle?,
        cause: Throwable?,
    ): CourseBundle {
        val metadata = cache.readMetadata()
        val age = cache.ageDays()
        telemetry.logBundleRefresh("offline", metadata?.etag, age)
        return cachedBundle ?: throw NetworkException("Failed to load course bundle", cause)
    }

    private fun openConnection(courseId: String, method: String): HttpURLConnection {
        val courseUrl = baseUrl.resolve("course/$courseId")
        return (courseUrl.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 5000
            readTimeout = 5000
        }
    }

    private fun parseCacheControl(header: String?): Long? {
        if (header.isNullOrBlank()) return null
        return header.split(',')
            .map { it.trim() }
            .firstOrNull { it.startsWith("max-age", ignoreCase = true) }
            ?.split('=')
            ?.getOrNull(1)
            ?.toLongOrNull()
    }

    private fun parseBundle(json: JSONObject): CourseBundle {
        fun JSONObject.coordinateFor(key: String): CourseCoordinate {
            val obj = getJSONObject(key)
            return CourseCoordinate(
                latitude = obj.getDouble("latitude"),
                longitude = obj.getDouble("longitude"),
            )
        }

        return CourseBundle(
            id = json.optString("id", ""),
            name = json.optString("name", ""),
            pin = json.coordinateFor("pin"),
            greenFront = json.coordinateFor("greenFront"),
            greenCenter = json.coordinateFor("greenCenter"),
            greenBack = json.coordinateFor("greenBack"),
        )
    }
}

private fun URL.resolve(path: String): URL {
    return if (toString().endsWith("/")) {
        URL(toString() + path)
    } else {
        URL("$this/$path")
    }
}
