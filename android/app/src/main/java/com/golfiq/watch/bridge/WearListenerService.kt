package com.golfiq.watch.bridge

import android.content.Intent
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.nio.charset.StandardCharsets
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class WearListenerService : WearableListenerService() {

    companion object {
        const val ACTION_IMU = "com.golfiq.WEAR_IMU_V1"
        const val EXTRA_BYTES = "bytes"
        const val PATH_IMU = "/golfiq/imu/v1"
        const val ACTION_MESSAGE = "com.golfiq.WEAR_MESSAGE_V1"
        const val EXTRA_JSON = "json"
        const val PATH_MESSAGE = "/golfiq/watch/msg"
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == PATH_IMU) {
            val intent = Intent(ACTION_IMU).putExtra(EXTRA_BYTES, event.data)
            LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
        } else if (event.path == PATH_MESSAGE) {
            val json = try {
                String(event.data, StandardCharsets.UTF_8)
            } catch (_: Exception) {
                null
            }
            if (json != null) {
                val intent = Intent(ACTION_MESSAGE).putExtra(EXTRA_JSON, json)
                LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
            }
        } else {
            super.onMessageReceived(event)
        }
    }
}
