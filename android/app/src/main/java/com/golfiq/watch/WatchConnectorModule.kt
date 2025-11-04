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
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.tasks.Tasks
import kotlin.text.Charsets
import org.json.JSONObject

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

    @ReactMethod
    fun sendOverlayJSON(jsonPayload: String, promise: Promise) {
        val context = reactApplicationContext
        val availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        if (availability != ConnectionResult.SUCCESS) {
            promise.resolve(false)
            return
        }
        val payload = jsonPayload.toByteArray(Charsets.UTF_8)
        val request = PutDataMapRequest.create(OVERLAY_PATH).apply {
            dataMap.putByteArray("payload", payload)
            dataMap.putLong("ts", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context)
            .putDataItem(request)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { error -> promise.reject("overlay_send_failure", error) }
    }

    @ReactMethod
    fun setSenseStreamingEnabled(enabled: Boolean, promise: Promise) {
        val context = reactApplicationContext
        val availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        if (availability != ConnectionResult.SUCCESS) {
            promise.resolve(false)
            return
        }

        val payload = JSONObject()
            .put("type", "shotsense_control")
            .put("enabled", enabled)
            .toString()
            .toByteArray(Charsets.UTF_8)

        Wearable.getNodeClient(context)
            .connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    promise.resolve(false)
                    return@addOnSuccessListener
                }
                val messageClient = Wearable.getMessageClient(context)
                val tasks = nodes.map { node ->
                    messageClient.sendMessage(node.id, SHOTSENSE_CONTROL_PATH, payload)
                }
                Tasks.whenAllComplete(tasks)
                    .addOnSuccessListener { results ->
                        val ok = results.any { it.isSuccessful }
                        promise.resolve(ok)
                    }
                    .addOnFailureListener { error ->
                        promise.reject("shotsense_control_failure", error)
                    }
            }
            .addOnFailureListener { error ->
                promise.reject("shotsense_nodes_failure", error)
            }
    }

    @ReactMethod
    fun sendMessage(jsonPayload: String, promise: Promise) {
        val context = reactApplicationContext
        val availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        if (availability != ConnectionResult.SUCCESS) {
            promise.resolve(false)
            return
        }

        val payload = jsonPayload.toByteArray(Charsets.UTF_8)

        Wearable.getNodeClient(context)
            .connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    promise.resolve(false)
                    return@addOnSuccessListener
                }
                val messageClient = Wearable.getMessageClient(context)
                val tasks = nodes.map { node ->
                    messageClient.sendMessage(node.id, WATCH_MESSAGE_PATH, payload)
                }
                Tasks.whenAllComplete(tasks)
                    .addOnSuccessListener { results ->
                        val ok = results.any { it.isSuccessful }
                        promise.resolve(ok)
                    }
                    .addOnFailureListener { error ->
                        promise.reject("watch_message_failure", error)
                    }
            }
            .addOnFailureListener { error ->
                promise.reject("watch_message_nodes_failure", error)
            }
    }

    companion object {
        const val NAME: String = "WatchConnector"
        private const val CAPABILITY = "golfiq_watch_hud"
        private const val DATA_PATH = "/golfiq/hud/v1"
        private const val OVERLAY_PATH = "/golfiq/overlay/v1"
        private const val SHOTSENSE_CONTROL_PATH = "/golfiq/shotsense/control"
        private const val WATCH_MESSAGE_PATH = "/golfiq/watch/msg"
    }
}
