package com.golfiq.hud.runtime

import android.content.Context
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat

class ThermalWatchdog(private val context: Context) {

    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var listener: PowerManager.OnThermalStatusChangedListener? = null
    @Volatile private var currentStatus: Int = readCurrentStatus()

    var onUpdate: ((String) -> Unit)? = null

    fun start() {
        if (listener != null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            onUpdate?.invoke(currentState())
            return
        }

        val callback = PowerManager.OnThermalStatusChangedListener { status ->
            currentStatus = status
            onUpdate?.invoke(mapStatus(status))
        }
        powerManager.addThermalStatusListener(ContextCompat.getMainExecutor(context), callback)
        listener = callback
        onUpdate?.invoke(currentState())
    }

    fun stop() {
        listener?.let { powerManager.removeThermalStatusListener(it) }
        listener = null
    }

    fun currentState(): String = mapStatus(currentStatus)

    private fun readCurrentStatus(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            powerManager.currentThermalStatus
        } else {
            PowerManager.THERMAL_STATUS_NONE
        }
    }

    private fun mapStatus(status: Int): String {
        return when (status) {
            PowerManager.THERMAL_STATUS_NONE -> "NONE"
            PowerManager.THERMAL_STATUS_LIGHT -> "LIGHT"
            PowerManager.THERMAL_STATUS_MODERATE -> "MODERATE"
            PowerManager.THERMAL_STATUS_SEVERE -> "SEVERE"
            PowerManager.THERMAL_STATUS_CRITICAL,
            PowerManager.THERMAL_STATUS_EMERGENCY,
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "CRITICAL"
            else -> "NONE"
        }
    }
}
