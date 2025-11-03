package com.golfiq.watch.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Base64
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

@ReactModule(name = WearBridgeModule.NAME)
class WearBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val broadcastManager = LocalBroadcastManager.getInstance(reactContext)
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                WearListenerService.ACTION_IMU -> {
                    val bytes = intent.getByteArrayExtra(WearListenerService.EXTRA_BYTES) ?: return
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(EVENT_IMU, mapOf("b64" to b64))
                }
                WearListenerService.ACTION_MESSAGE -> {
                    val json = intent.getStringExtra(WearListenerService.EXTRA_JSON) ?: return
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(EVENT_MESSAGE, mapOf("json" to json))
                }
            }
        }
    }

    private var isRegistered = false

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        if (!isRegistered) {
            val filter = IntentFilter().apply {
                addAction(WearListenerService.ACTION_IMU)
                addAction(WearListenerService.ACTION_MESSAGE)
            }
            broadcastManager.registerReceiver(receiver, filter)
            isRegistered = true
        }
    }

    override fun onCatalystInstanceDestroy() {
        if (isRegistered) {
            broadcastManager.unregisterReceiver(receiver)
            isRegistered = false
        }
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required to satisfy React Native event emitter contract
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // Required to satisfy React Native event emitter contract
    }

    companion object {
        const val NAME = "WearBridgeAndroid"
        private const val EVENT_IMU = "wear.imu.v1"
        private const val EVENT_MESSAGE = "watch.message.v1"
    }
}
