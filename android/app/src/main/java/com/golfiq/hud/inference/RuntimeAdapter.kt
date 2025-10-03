package com.golfiq.hud.inference

import android.content.SharedPreferences
import androidx.core.content.edit
import com.golfiq.hud.model.DeviceProfile
import java.util.concurrent.atomic.AtomicReference

enum class RuntimeMode(val storageValue: String) {
    TFLITE_CPU("tflite_cpu"),
    TFLITE_NNAPI("tflite_nnapi"),
    TFLITE_GPU("tflite_gpu"),
    NCNN_CPU("ncnn_cpu"),
    NCNN_VULKAN("ncnn_vulkan"),
    ;

    companion object {
        private val byStorage = values().associateBy { it.storageValue }

        fun fromStorage(value: String?): RuntimeMode? = value?.let { byStorage[it] }
    }
}

class RuntimeAdapter(
    private val preferences: SharedPreferences,
    private val profileProvider: DeviceProfileProvider,
) {
    interface DeviceProfileProvider {
        fun getDeviceProfile(): DeviceProfile
    }

    private val overrideKey = "runtime_adapter_override"
    private val cachedActive = AtomicReference<RuntimeMode?>()

    fun availableModes(): List<RuntimeMode> = RuntimeMode.values().toList()

    fun activeMode(): RuntimeMode {
        val cached = cachedActive.get()
        if (cached != null) {
            return cached
        }

        val override = RuntimeMode.fromStorage(preferences.getString(overrideKey, null))
        val resolved = override ?: profileProvider.getDeviceProfile().defaultRuntime
        cachedActive.set(resolved)
        return resolved
    }

    fun override(mode: RuntimeMode?) {
        cachedActive.set(null)
        preferences.edit {
            if (mode == null) {
                remove(overrideKey)
            } else {
                putString(overrideKey, mode.storageValue)
            }
        }
    }

    fun describe(): Map<String, Any> {
        val profile = profileProvider.getDeviceProfile()
        return mapOf(
            "tier" to profile.tier.name,
            "estimatedFps" to profile.estimatedFps,
            "defaultRuntime" to profile.defaultRuntime.storageValue,
            "activeRuntime" to activeMode().storageValue,
        )
    }
}
