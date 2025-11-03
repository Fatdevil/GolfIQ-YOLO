package com.golfiq.watch.bridge

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

private const val IMU_PATH = "/golfiq/imu/v1"

class WearListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    if (messageEvent.path == IMU_PATH) {
      WearIMUBridge.emit(messageEvent.data)
      return
    }
    super.onMessageReceived(messageEvent)
  }
}
