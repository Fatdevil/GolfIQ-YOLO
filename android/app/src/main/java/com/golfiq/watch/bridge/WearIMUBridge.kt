package com.golfiq.watch.bridge

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

private const val EVENT_NAME = "watch.imu.v1"

object WearIMUBridge {
  @Volatile private var reactContext: ReactApplicationContext? = null

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun detach(context: ReactApplicationContext) {
    if (reactContext == context) {
      reactContext = null
    }
  }

  fun emit(bytes: ByteArray?) {
    if (bytes == null || bytes.isEmpty()) {
      return
    }
    val context = reactContext ?: return
    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
    val body = Arguments.createMap().apply { putString("b64", base64) }
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, body)
  }
}
