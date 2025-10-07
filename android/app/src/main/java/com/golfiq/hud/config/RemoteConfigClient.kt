package com.golfiq.hud.config

import com.golfiq.hud.inference.RuntimeAdapter
import com.golfiq.hud.model.FeatureFlagConfig
import com.golfiq.hud.telemetry.TelemetryClient
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject

class RemoteConfigClient(
    private val baseUrl: URL,
    private val deviceProfiles: DeviceProfileManager,
    private val featureFlags: FeatureFlagsService,
    private val telemetry: TelemetryClient,
    private val runtimeAdapter: RuntimeAdapter,
    private val onFlagsApplied: ((FeatureFlagConfig, String?) -> Unit)? = null,
) {
    companion object {
        private const val REFRESH_HOURS = 12L
    }

    private val executor = Executors.newSingleThreadScheduledExecutor()
    @Volatile
    private var etag: String? = null
    @Volatile
    private var lastAppliedAtMillis: Long = 0
    @Volatile
    private var lastAppliedHash: String? = null

    fun start() {
        executor.execute { fetch() }
        executor.scheduleAtFixedRate({ fetch() }, REFRESH_HOURS, REFRESH_HOURS, TimeUnit.HOURS)
    }

    fun shutdown() {
        executor.shutdownNow()
    }

    private fun fetch() {
        val requestUrl = URL(baseUrl, "config/remote")
        val connection = (requestUrl.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Accept", "application/json")
            connectTimeout = 3_000
            readTimeout = 3_000
            etag?.let { setRequestProperty("If-None-Match", it) }
        }
        try {
            val status = connection.responseCode
            if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                return
            }
            if (status != HttpURLConnection.HTTP_OK) {
                return
            }
            val body = connection.inputStream.bufferedReader().use(BufferedReader::readText)
            val json = JSONObject(body)
            val config = json.optJSONObject("config") ?: return
            val responseEtag = connection.getHeaderField("ETag") ?: json.optString("etag")
            applyConfig(config, responseEtag)
        } catch (ex: Exception) {
            // Remote config is best-effort; swallow network errors for now.
        } finally {
            connection.disconnect()
        }
    }

    private fun applyConfig(config: JSONObject, newEtag: String?) {
        val profile = deviceProfiles.ensureProfile()
        val tierKey = "tier${profile.tier.name}"
        val overrides = config.optJSONObject(tierKey) ?: return

        val current = featureFlags.current()
        val updated = current.copy(
            hudEnabled = overrides.optBoolean("hudEnabled", current.hudEnabled),
            fieldTestModeEnabled = overrides.optBoolean("fieldTestMode", current.fieldTestModeEnabled),
            analyticsEnabled = overrides.optBoolean("analyticsEnabled", current.analyticsEnabled),
            crashEnabled = overrides.optBoolean("crashEnabled", current.crashEnabled),
            playsLikeEnabled = overrides.optBoolean("playsLikeEnabled", current.playsLikeEnabled),
            inputSize = if (overrides.has("inputSize")) overrides.optInt("inputSize") else current.inputSize,
            reducedRate = if (overrides.has("reducedRate")) overrides.optBoolean("reducedRate") else current.reducedRate,
            source = FeatureFlagConfig.Source.REMOTE_CONFIG,
        )
        featureFlags.applyRemote(updated)

        val runtime = runtimeAdapter.describe()
        val hash = newEtag?.trim('"') ?: updated.source.name
        onFlagsApplied?.invoke(updated, hash)
        telemetry.logRemoteConfigActive(
            hash = hash,
            profile = profile,
            runtime = runtime,
            inputSize = updated.inputSize,
            reducedRate = updated.reducedRate,
        )
        etag = newEtag
        lastAppliedHash = hash
        lastAppliedAtMillis = System.currentTimeMillis()
    }

    fun etagAgeDays(nowMillis: Long = System.currentTimeMillis()): Int? {
        val appliedAt = lastAppliedAtMillis
        if (appliedAt <= 0L) {
            return null
        }
        val age = nowMillis - appliedAt
        if (age < 0L) {
            return 0
        }
        return (age / TimeUnit.DAYS.toMillis(1)).toInt()
    }

    fun activeEtag(): String? = lastAppliedHash
}
