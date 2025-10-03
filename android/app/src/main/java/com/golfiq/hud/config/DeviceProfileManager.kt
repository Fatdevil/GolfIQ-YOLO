package com.golfiq.hud.config

import android.content.Context
import android.content.SharedPreferences
import android.os.BatteryManager
import android.os.Build
import androidx.core.content.edit
import com.golfiq.hud.inference.RuntimeAdapter
import com.golfiq.hud.inference.RuntimeMode
import com.golfiq.hud.model.DeviceProfile
import com.golfiq.hud.telemetry.TelemetryClient
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

class DeviceProfileManager(
    private val context: Context,
    private val preferences: SharedPreferences,
    private val microbench: Microbench,
    private val telemetryClient: TelemetryClient,
    private val clock: () -> Long = System::currentTimeMillis,
) : RuntimeAdapter.DeviceProfileProvider {

    fun interface Microbench {
        fun sampleLatencyMillis(durationMillis: Long): List<Double>
    }

    private val profileKey = "device_profile_json"
    private val profileVersionKey = "device_profile_version"
    private val currentVersion = 1
    private val benchWindowMillis = 8_000L

    override fun getDeviceProfile(): DeviceProfile = ensureProfile()

    fun ensureProfile(): DeviceProfile {
        val cached = load()
        if (cached != null) {
            return cached
        }

        val latencies = microbench.sampleLatencyMillis(benchWindowMillis)
        val p95 = percentile(latencies, 95.0)
        val fps = if (p95 == 0.0) 0.0 else 1_000.0 / p95
        val tier = resolveTier(fps)
        val runtime = defaultRuntimeForTier(tier)

        val profile = DeviceProfile(
            id = Build.MODEL ?: "unknown",
            osVersion = Build.VERSION.RELEASE ?: "unknown",
            chipset = Build.HARDWARE ?: Build.BOARD ?: "unknown",
            thermalThresholds = emptyMap(),
            batteryCapacityMah = batteryCapacityMah(context),
            tier = tier,
            estimatedFps = fps,
            defaultRuntime = runtime,
            lastEvaluatedAtMillis = clock(),
        )

        persist(profile)
        telemetryClient.postDeviceProfile(profile, runtime)
        return profile
    }

    fun clearProfile() {
        preferences.edit {
            remove(profileKey)
            remove(profileVersionKey)
        }
    }

    private fun resolveTier(fps: Double): DeviceProfile.Tier {
        return when {
            fps >= 30.0 -> DeviceProfile.Tier.A
            fps >= 15.0 -> DeviceProfile.Tier.B
            else -> DeviceProfile.Tier.C
        }
    }

    private fun defaultRuntimeForTier(tier: DeviceProfile.Tier): RuntimeMode {
        return when (tier) {
            DeviceProfile.Tier.A -> RuntimeMode.TFLITE_GPU
            DeviceProfile.Tier.B -> RuntimeMode.TFLITE_NNAPI
            DeviceProfile.Tier.C -> RuntimeMode.NCNN_CPU
        }
    }

    private fun percentile(values: List<Double>, percentile: Double): Double {
        if (values.isEmpty()) {
            return Double.POSITIVE_INFINITY
        }
        val sorted = values.sorted()
        val rank = percentile / 100.0 * (sorted.size - 1)
        val lowerIndex = max(rank.toInt(), 0)
        val upperIndex = min(lowerIndex + 1, sorted.lastIndex)
        val weight = rank - lowerIndex
        return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
    }

    private fun batteryCapacityMah(context: Context): Int {
        val batteryManager = context.getSystemService(BatteryManager::class.java) ?: return -1
        val microAh = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
        return if (microAh == Int.MIN_VALUE) {
            -1
        } else {
            (microAh / 1_000.0).toInt()
        }
    }

    private fun persist(profile: DeviceProfile) {
        val json = JSONObject().apply {
            put("id", profile.id)
            put("osVersion", profile.osVersion)
            put("chipset", profile.chipset)
            put("thermalThresholds", JSONObject(profile.thermalThresholds))
            put("batteryCapacityMah", profile.batteryCapacityMah)
            put("tier", profile.tier.name)
            put("estimatedFps", profile.estimatedFps)
            put("defaultRuntime", profile.defaultRuntime.storageValue)
            put("lastEvaluatedAtMillis", profile.lastEvaluatedAtMillis)
        }

        preferences.edit {
            putString(profileKey, json.toString())
            putInt(profileVersionKey, currentVersion)
        }
    }

    private fun load(): DeviceProfile? {
        val storedVersion = preferences.getInt(profileVersionKey, -1)
        if (storedVersion != currentVersion) {
            return null
        }
        val raw = preferences.getString(profileKey, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            val tier = DeviceProfile.Tier.valueOf(json.getString("tier"))
            val runtime = RuntimeMode.fromStorage(json.getString("defaultRuntime")) ?: defaultRuntimeForTier(tier)
            DeviceProfile(
                id = json.getString("id"),
                osVersion = json.getString("osVersion"),
                chipset = json.getString("chipset"),
                thermalThresholds = json.getJSONObject("thermalThresholds").toMap(),
                batteryCapacityMah = json.getInt("batteryCapacityMah"),
                tier = tier,
                estimatedFps = json.getDouble("estimatedFps"),
                defaultRuntime = runtime,
                lastEvaluatedAtMillis = json.getLong("lastEvaluatedAtMillis"),
            )
        }.getOrNull()
    }

    private fun JSONObject.toMap(): Map<String, Double> {
        val map = mutableMapOf<String, Double>()
        val keys = keys()
        while (keys.hasNext()) {
            val key = keys.next()
            map[key] = optDouble(key)
        }
        return map
    }
}
