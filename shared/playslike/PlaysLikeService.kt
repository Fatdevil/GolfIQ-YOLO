package com.golfiq.shared.playslike

import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.max
import org.json.JSONObject

object PlaysLikeService {
    data class ElevationProviderData(
        val elevationM: Double,
        val ttlSeconds: Int,
        val etag: String?,
    )

    data class WindProviderData(
        val speedMps: Double,
        val dirFromDeg: Double,
        val wParallel: Double?,
        val wPerp: Double?,
        val ttlSeconds: Int,
        val etag: String?,
    )

    private data class CacheEntry<T>(
        var value: T,
        var etag: String?,
        var expiresAt: Long,
    )

    @Volatile
    private var providersBaseUrl: String? = null

    private val elevationCache = ConcurrentHashMap<String, CacheEntry<ElevationProviderData>>()
    private val windCache = ConcurrentHashMap<String, CacheEntry<WindProviderData>>()

    fun setProvidersBaseUrl(url: String?) {
        providersBaseUrl = url?.trimEnd('/')
    }

    fun getProvidersBaseUrl(): String? = providersBaseUrl

    fun fetchElevation(lat: Double, lon: Double): ElevationProviderData {
        val base = providersBaseUrl ?: return ElevationProviderData(0.0, 0, null)
        val key = cacheKey(lat, lon)
        val cached = elevationCache[key]
        val now = nowMillis()
        if (cached != null && cached.expiresAt > now) {
            return cached.value.copy(etag = cached.etag)
        }

        val url = buildUrl(
            base,
            "/providers/elevation",
            mapOf("lat" to formatCoord(lat), "lon" to formatCoord(lon)),
        )
        val connection = openConnection(url, cached?.etag)
        try {
            val status = connection.responseCode
            if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                if (cached == null) {
                    throw IllegalStateException("304 without cached elevation entry")
                }
                val etag = stripWeakEtag(connection.getHeaderField("ETag")) ?: cached.etag
                val ttl = parseMaxAge(connection.getHeaderField("Cache-Control")) ?: cached.value.ttlSeconds
                cached.value = cached.value.copy(ttlSeconds = ttl, etag = null)
                cached.etag = etag
                cached.expiresAt = now + ttl * 1000L
                elevationCache[key] = cached
                return cached.value.copy(etag = cached.etag)
            }

            if (status !in 200..299) {
                throw IllegalStateException("Elevation provider error: $status")
            }

            val body = readBody(connection)
            val json = JSONObject(body)
            val ttlCandidate = json.optInt("ttl_s", -1)
            val ttl = if (ttlCandidate >= 0) ttlCandidate else parseMaxAge(connection.getHeaderField("Cache-Control")) ?: 0
            val etag = json.optString("etag", null) ?: stripWeakEtag(connection.getHeaderField("ETag"))
            val data = ElevationProviderData(
                elevationM = json.optDouble("elevation_m", 0.0),
                ttlSeconds = ttl,
                etag = etag,
            )
            elevationCache[key] = CacheEntry(
                value = data.copy(etag = null),
                etag = etag,
                expiresAt = now + ttl * 1000L,
            )
            return data
        } finally {
            connection.disconnect()
        }
    }

    fun fetchWind(lat: Double, lon: Double, bearing: Double? = null): WindProviderData {
        val base = providersBaseUrl ?: return WindProviderData(0.0, 0.0, 0.0, 0.0, 0, null)
        val key = cacheKey(lat, lon) + (bearing?.let { String.format(Locale.US, "@%.2f", it) } ?: "")
        val cached = windCache[key]
        val now = nowMillis()
        if (cached != null && cached.expiresAt > now) {
            return cached.value.copy(etag = cached.etag)
        }

        val params = mutableMapOf(
            "lat" to formatCoord(lat),
            "lon" to formatCoord(lon),
        )
        if (bearing != null) {
            params["bearing"] = String.format(Locale.US, "%.2f", bearing)
        }
        val url = buildUrl(base, "/providers/wind", params)
        val connection = openConnection(url, cached?.etag)
        try {
            val status = connection.responseCode
            if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                if (cached == null) {
                    throw IllegalStateException("304 without cached wind entry")
                }
                val etag = stripWeakEtag(connection.getHeaderField("ETag")) ?: cached.etag
                val ttl = parseMaxAge(connection.getHeaderField("Cache-Control")) ?: cached.value.ttlSeconds
                cached.value = cached.value.copy(ttlSeconds = ttl, etag = null)
                cached.etag = etag
                cached.expiresAt = now + ttl * 1000L
                windCache[key] = cached
                return cached.value.copy(etag = cached.etag)
            }

            if (status !in 200..299) {
                throw IllegalStateException("Wind provider error: $status")
            }

            val body = readBody(connection)
            val json = JSONObject(body)
            val ttlCandidate = json.optInt("ttl_s", -1)
            val ttl = if (ttlCandidate >= 0) ttlCandidate else parseMaxAge(connection.getHeaderField("Cache-Control")) ?: 0
            val etag = json.optString("etag", null) ?: stripWeakEtag(connection.getHeaderField("ETag"))
            val wParallel = if (json.isNull("w_parallel")) null else json.optDouble("w_parallel")
            val wPerp = if (json.isNull("w_perp")) null else json.optDouble("w_perp")
            val data = WindProviderData(
                speedMps = json.optDouble("speed_mps", 0.0),
                dirFromDeg = json.optDouble("dir_from_deg", 0.0),
                wParallel = wParallel,
                wPerp = wPerp,
                ttlSeconds = ttl,
                etag = etag,
            )
            windCache[key] = CacheEntry(
                value = data.copy(etag = null),
                etag = etag,
                expiresAt = now + ttl * 1000L,
            )
            return data
        } finally {
            connection.disconnect()
        }
    }

    private fun cacheKey(lat: Double, lon: Double): String =
        String.format(Locale.US, "%.5f,%.5f", lat, lon)

    private fun formatCoord(value: Double): String =
        String.format(Locale.US, "%.5f", value)

    private fun nowMillis(): Long = System.currentTimeMillis()

    private fun buildUrl(base: String, path: String, params: Map<String, String>): String {
        val query = params.entries.joinToString("&") { (key, value) ->
            "%s=%s".format(
                Locale.US,
                encode(key),
                encode(value),
            )
        }
        return "$base$path${if (query.isEmpty()) "" else "?$query"}"
    }

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, StandardCharsets.UTF_8.name())

    private fun openConnection(url: String, etag: String?): HttpURLConnection {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        if (!etag.isNullOrEmpty()) {
            connection.setRequestProperty("If-None-Match", etag)
        }
        return connection
    }

    private fun readBody(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode >= 400) connection.errorStream else connection.inputStream
        BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
            return reader.readText()
        }
    }

    private fun parseMaxAge(header: String?): Int? {
        if (header.isNullOrBlank()) return null
        val parts = header.split(",")
        for (part in parts) {
            val trimmed = part.trim()
            if (trimmed.lowercase(Locale.US).startsWith("max-age=")) {
                val value = trimmed.substringAfter("=").toIntOrNull()
                if (value != null && value >= 0) {
                    return value
                }
            }
        }
        return null
    }

    private fun stripWeakEtag(etag: String?): String? {
        if (etag.isNullOrBlank()) return null
        var candidate = etag.trim()
        if (candidate.startsWith("W/", ignoreCase = true)) {
            candidate = candidate.substring(2).trim()
        }
        return candidate.trim('"')
    }

    data class Components(
        val slopeM: Double,
        val windM: Double,
    )

    data class Result(
        val distanceEff: Double,
        val components: Components,
        val quality: Quality,
    )

    data class Options(
        val kS: Double = 1.0,
        val kHW: Double = 2.5,
        val warnThresholdRatio: Double = 0.05,
        val lowThresholdRatio: Double = 0.12,
    )

    enum class Quality(val value: String) {
        GOOD("good"),
        WARN("warn"),
        LOW("low"),
    }

    fun computeSlopeAdjust(D: Double, deltaH: Double, kS: Double = 1.0): Double {
        if (!D.isFinite() || D <= 0.0) return 0.0
        if (!deltaH.isFinite()) return 0.0
        val clampedKs = kS.coerceIn(0.2, 3.0)
        return deltaH * clampedKs
    }

    fun computeWindAdjust(D: Double, wParallel: Double, kHW: Double = 2.5): Double {
        if (!D.isFinite() || D <= 0.0) return 0.0
        if (!wParallel.isFinite()) return 0.0
        val clamped = kHW.coerceIn(0.5, 6.0)
        return wParallel * clamped
    }

    fun compute(
        D: Double,
        deltaH: Double,
        wParallel: Double,
        opts: Options = Options(),
    ): Result {
        val distance = if (D.isFinite()) max(D, 0.0) else 0.0
        val slopeM = computeSlopeAdjust(distance, deltaH, opts.kS)
        val windM = computeWindAdjust(distance, wParallel, opts.kHW)
        val eff = distance + slopeM + windM
        val total = abs(slopeM) + abs(windM)
        val ratio = if (distance > 0.0) total / distance else Double.POSITIVE_INFINITY
        val quality = when {
            ratio <= opts.warnThresholdRatio -> Quality.GOOD
            ratio <= opts.lowThresholdRatio -> Quality.WARN
            else -> Quality.LOW
        }
        return Result(
            distanceEff = eff,
            components = Components(slopeM = slopeM, windM = windM),
            quality = quality,
        )
    }
}
