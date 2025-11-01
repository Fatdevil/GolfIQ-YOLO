package com.golfiq.watch

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable

@ReactModule(name = WatchConnectorModule.NAME)
class WatchConnectorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun isCapable(promise: Promise) {
        val context = reactApplicationContext
        val availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        if (availability != ConnectionResult.SUCCESS) {
            promise.resolve(false)
            return
        }
        Wearable.getCapabilityClient(context)
            .getCapability(CAPABILITY, CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener { capability ->
                val reachable = capability.nodes?.isNotEmpty() == true
                promise.resolve(reachable)
            }
            .addOnFailureListener { error ->
                promise.reject("capability_error", error)
            }
    }

    @ReactMethod
    fun sendHUD(base64Payload: String, promise: Promise) {
        val context = reactApplicationContext
        val availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        if (availability != ConnectionResult.SUCCESS) {
            promise.resolve(false)
            return
        }
        val payload = try {
            Base64.decode(base64Payload, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            promise.reject("payload_decode_error", error)
            return
        }
        val request = PutDataRequest.create(DATA_PATH).setData(payload)
        Wearable.getDataClient(context)
            .putDataItem(request)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { error -> promise.reject("send_failure", error) }
    }

    companion object {
        const val NAME: String = "WatchConnector"
        private const val CAPABILITY = "golfiq_watch_hud"
        private const val DATA_PATH = "/golfiq/hud/v1"
    }
}
