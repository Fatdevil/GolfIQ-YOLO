package com.golfiq.watch.bridge

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = WearShotSenseModule.NAME)
class WearShotSenseModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    WearIMUBridge.attach(reactApplicationContext)
  }

  override fun invalidate() {
    WearIMUBridge.detach(reactApplicationContext)
    super.invalidate()
  }

  @ReactMethod
  fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
    // Required by React Native event emitter contract
  }

  @ReactMethod
  fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
    // Required by React Native event emitter contract
  }

  companion object {
    const val NAME = "WearShotSenseBridge"
  }
}
