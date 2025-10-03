package com.golfiq.hud.runtime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.SystemClock
import java.util.ArrayDeque
import java.util.concurrent.TimeUnit
import kotlin.math.max

class BatteryMonitor(private val context: Context) {

    private data class Sample(val timestamp: Long, val level: Double)

    private val samples = ArrayDeque<Sample>()
    private val windowMillis = TimeUnit.MINUTES.toMillis(15)
    private val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    private val lock = Any()

    private var receiver: BroadcastReceiver? = null
    private var lastLevel: Double = Double.NaN

    fun start() {
        if (receiver != null) {
            return
        }

        val newReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                handleIntent(intent)
            }
        }
        val sticky = context.registerReceiver(newReceiver, filter)
        receiver = newReceiver
        if (sticky != null) {
            handleIntent(sticky)
        } else {
            captureSnapshot()
        }
    }

    fun stop() {
        receiver?.let { context.unregisterReceiver(it) }
        receiver = null
    }

    fun currentLevel(): Double {
        synchronized(lock) {
            if (!lastLevel.isNaN()) {
                return lastLevel
            }
        }
        return captureSnapshot()
    }

    fun dropLast15Minutes(): Double {
        synchronized(lock) {
            pruneLocked(SystemClock.elapsedRealtime())
            val first = samples.firstOrNull() ?: return 0.0
            val last = samples.lastOrNull() ?: return 0.0
            return max(0.0, first.level - last.level)
        }
    }

    private fun captureSnapshot(): Double {
        val intent = context.registerReceiver(null, filter)
        return if (intent != null) {
            handleIntent(intent)
        } else {
            synchronized(lock) {
                if (lastLevel.isNaN()) {
                    lastLevel = 0.0
                    samples.addLast(Sample(SystemClock.elapsedRealtime(), lastLevel))
                }
                lastLevel
            }
        }
    }

    private fun handleIntent(intent: Intent): Double {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) {
            synchronized(lock) {
                return if (lastLevel.isNaN()) 0.0 else lastLevel
            }
        }
        val pct = level * 100.0 / scale.toDouble()
        synchronized(lock) {
            lastLevel = pct
            recordSampleLocked(pct)
        }
        return pct
    }

    private fun recordSampleLocked(level: Double) {
        val now = SystemClock.elapsedRealtime()
        pruneLocked(now)
        samples.addLast(Sample(now, level))
    }

    private fun pruneLocked(now: Long) {
        while (samples.isNotEmpty() && now - samples.first().timestamp > windowMillis) {
            samples.removeFirst()
        }
        if (samples.isEmpty() && !lastLevel.isNaN()) {
            samples.addLast(Sample(now, lastLevel))
        }
    }
}
