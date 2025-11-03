package com.golfiq.watch.bridge

import android.content.Intent
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class WearListenerService : WearableListenerService() {

    companion object {
        const val ACTION_IMU = "com.golfiq.WEAR_IMU_V1"
        const val EXTRA_BYTES = "bytes"
        const val PATH_IMU = "/golfiq/imu/v1"
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == PATH_IMU) {
            val intent = Intent(ACTION_IMU).putExtra(EXTRA_BYTES, event.data)
            LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
        } else {
            super.onMessageReceived(event)
        }
    }
}
