package com.golfiq.bench.policy

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.golfiq.bench.telemetry.TelemetryClient
import com.golfiq.bench.telemetry.ThermalBatterySample
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class ThermalBatteryPolicy(
    private val context: Context,
    private val telemetryClient: TelemetryClient,
    private val telemetryScope: CoroutineScope,
    private val listener: Listener,
    private val config: Config = Config(),
    private val elapsedRealtime: () -> Long = { SystemClock.elapsedRealtime() },
    private val wallClock: () -> Long = { System.currentTimeMillis() },
) : DefaultLifecycleObserver {

    data class Config(
        val sampleInterval: Duration = Duration.ofSeconds(60),
        val batteryWindow: Duration = Duration.ofMinutes(15),
        val batteryDropThresholdPercent: Double = 9.0,
        val severeThermalStatus: Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            PowerManager.THERMAL_STATUS_SEVERE
        } else {
            Int.MAX_VALUE
        },
    )

    enum class Trigger { THERMAL, BATTERY, USER }

    enum class PolicyAction {
        NONE,
        SWITCH_TO_2D,
        REDUCE_REFRESH,
        PAUSE_HEAVY_FEATURES,
        RESUME_REQUESTED,
    }

    interface Listener {
        fun onPolicyApplied(action: PolicyAction, trigger: Trigger)
        fun onPolicyCleared()
    }

    private data class BatterySample(val timestamp: Long, val percent: Int)

    private val scheduler = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "golfiq-thermal-battery").apply { isDaemon = true }
    }
    private var scheduledTask: ScheduledFuture<*>? = null
    private val batterySamples = ArrayDeque<BatterySample>()
    private val running = AtomicBoolean(false)

    private val powerManager: PowerManager? = context.getSystemService(PowerManager::class.java)
    private val batteryManager: BatteryManager? = context.getSystemService(BatteryManager::class.java)

    private var lastThermalStatus: Int? = currentThermalStatus()
    private var latestBatteryPercent: Int? = null
    private var latestBatteryDelta: Double? = null
    private var activeAction: PolicyAction = PolicyAction.NONE
    private var activeTrigger: Trigger? = null

    private val thermalListener = PowerManager.OnThermalStatusChangedListener { status ->
        handleThermalStatus(status)
    }

    override fun onStart(owner: LifecycleOwner) {
        start()
    }

    override fun onStop(owner: LifecycleOwner) {
        stop()
    }

    fun start() {
        if (!running.compareAndSet(false, true)) {
            return
        }
        registerThermalListener()
        scheduleBatterySampling()
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) {
            return
        }
        unregisterThermalListener()
        scheduledTask?.cancel(true)
        scheduledTask = null
        batterySamples.clear()
        latestBatteryPercent = null
        latestBatteryDelta = null
        if (activeAction != PolicyAction.NONE) {
            listener.onPolicyCleared()
        }
        activeAction = PolicyAction.NONE
        activeTrigger = null
    }

    fun requestResumeFromFallback() {
        if (activeAction == PolicyAction.NONE) {
            listener.onPolicyCleared()
            emitTelemetry(PolicyAction.NONE, Trigger.USER)
            return
        }
        activeAction = PolicyAction.RESUME_REQUESTED
        activeTrigger = Trigger.USER
        listener.onPolicyCleared()
        emitTelemetry(PolicyAction.RESUME_REQUESTED, Trigger.USER)
        activeAction = PolicyAction.NONE
        activeTrigger = null
    }

    private fun registerThermalListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return
        }
        val manager = powerManager ?: return
        runCatching {
            manager.addThermalStatusListener(ContextCompat.getMainExecutor(context), thermalListener)
            lastThermalStatus = manager.currentThermalStatus
            lastThermalStatus?.let { status ->
                if (status >= config.severeThermalStatus) {
                    applyPolicy(PolicyAction.SWITCH_TO_2D, Trigger.THERMAL)
                }
                emitTelemetry(activeAction, Trigger.THERMAL)
            }
        }.onFailure { throwable ->
            Log.w(TAG, "Unable to register thermal listener", throwable)
        }
    }

    private fun unregisterThermalListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return
        }
        val manager = powerManager ?: return
        runCatching {
            manager.removeThermalStatusListener(thermalListener)
        }.onFailure { throwable ->
            Log.w(TAG, "Unable to unregister thermal listener", throwable)
        }
    }

    private fun handleThermalStatus(status: Int) {
        lastThermalStatus = status
        if (status >= config.severeThermalStatus) {
            applyPolicy(PolicyAction.SWITCH_TO_2D, Trigger.THERMAL)
        }
        emitTelemetry(activeAction, Trigger.THERMAL)
    }

    private fun scheduleBatterySampling() {
        if (batteryManager == null) {
            return
        }
        val intervalMillis = max(config.sampleInterval.toMillis(), 1L)
        scheduledTask = scheduler.scheduleAtFixedRate(
            { sampleBattery() },
            0L,
            intervalMillis,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun sampleBattery() {
        val manager = batteryManager ?: return
        val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (level == Int.MIN_VALUE) {
            return
        }
        val now = elapsedRealtime()
        latestBatteryPercent = level
        synchronized(batterySamples) {
            batterySamples += BatterySample(now, level)
            trimBatterySamples(now)
            latestBatteryDelta = computeBatteryDeltaLocked()
        }
        latestBatteryDelta?.let { delta ->
            when {
                delta >= config.batteryDropThresholdPercent * 1.5 ->
                    applyPolicy(PolicyAction.PAUSE_HEAVY_FEATURES, Trigger.BATTERY)
                delta >= config.batteryDropThresholdPercent ->
                    if (activeAction != PolicyAction.PAUSE_HEAVY_FEATURES) {
                        applyPolicy(PolicyAction.REDUCE_REFRESH, Trigger.BATTERY)
                    }
            }
        }
        if ((latestBatteryDelta ?: 0.0) < config.batteryDropThresholdPercent * 0.5 &&
            activeTrigger == Trigger.BATTERY &&
            activeAction != PolicyAction.NONE
        ) {
            activeAction = PolicyAction.NONE
            activeTrigger = null
            listener.onPolicyCleared()
        }
        emitTelemetry(activeAction, Trigger.BATTERY)
    }

    private fun trimBatterySamples(now: Long) {
        val windowMillis = config.batteryWindow.toMillis()
        while (batterySamples.isNotEmpty() && now - batterySamples.first().timestamp > windowMillis) {
            batterySamples.removeFirst()
        }
    }

    private fun computeBatteryDeltaLocked(): Double? {
        if (batterySamples.size < 2) {
            return 0.0
        }
        val newest = batterySamples.last()
        val oldest = batterySamples.first()
        return max(0.0, (oldest.percent - newest.percent).toDouble())
    }

    private fun applyPolicy(action: PolicyAction, trigger: Trigger) {
        if (activeAction == action) {
            return
        }
        activeAction = action
        activeTrigger = trigger
        listener.onPolicyApplied(action, trigger)
    }

    private fun emitTelemetry(action: PolicyAction, trigger: Trigger) {
        if (!running.get()) {
            return
        }
        val sample = ThermalBatterySample(
            timestampMs = wallClock(),
            thermalStatus = lastThermalStatus,
            batteryPercent = latestBatteryPercent,
            batteryDeltaPercent = latestBatteryDelta,
            action = action.name.lowercase(),
            trigger = trigger.name.lowercase(),
        )
        telemetryScope.launch {
            telemetryClient.postPolicySamples(listOf(sample))
        }
    }

    private fun currentThermalStatus(): Int? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            powerManager?.currentThermalStatus
        } else {
            null
        }
    }

    companion object {
        private const val TAG = "ThermalBatteryPolicy"
    }
}
