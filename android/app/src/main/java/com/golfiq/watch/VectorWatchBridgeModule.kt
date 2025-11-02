package com.golfiq.watch

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import org.json.JSONObject

@ReactModule(name = VectorWatchBridgeModule.NAME)
class VectorWatchBridgeModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context),
  MessageClient.OnMessageReceivedListener {

  private val messageClient: MessageClient = Wearable.getMessageClient(context)

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    messageClient.addListener(this)
  }

  override fun invalidate() {
    messageClient.removeListener(this)
    super.invalidate()
  }

  @ReactMethod
  fun sendHoleModel(json: String, tournamentSafe: Boolean) {
    val payload = JSONObject()
      .put("type", "holeModel")
      .put("json", json)
      .put("tournamentSafe", tournamentSafe)
    broadcast("/holeModel", payload)
  }

  @ReactMethod
  fun sendPlayerPosition(lat: Double, lon: Double) {
    val payload = JSONObject()
      .put("type", "playerPos")
      .put("lat", lat)
      .put("lon", lon)
    broadcast("/playerPos", payload)
  }

  @ReactMethod
  fun sendTargetPosition(lat: Double, lon: Double) {
    val payload = JSONObject()
      .put("type", "targetPos")
      .put("lat", lat)
      .put("lon", lon)
    broadcast("/targetPos", payload)
  }

  @ReactMethod
  fun notifyRoundSaved() {
    val payload = JSONObject().put("type", "roundSaved")
    broadcast("/roundSaved", payload)
  }

  override fun onMessageReceived(messageEvent: MessageEvent) {
    if (messageEvent.path != "/targetMoved") return
    val body = Arguments.createMap()
    val json = JSONObject(String(messageEvent.data, StandardCharsets.UTF_8))
    body.putDouble("lat", json.optDouble("lat"))
    body.putDouble("lon", json.optDouble("lon"))
    emitEvent("WatchTargetMoved", body)
  }

  private fun emitEvent(event: String, params: WritableMap) {
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, params)
  }

  private fun broadcast(path: String, payload: JSONObject) {
    val nodesTask = Wearable.getNodeClient(context).connectedNodes
    nodesTask.addOnSuccessListener { nodes ->
      val data = payload.toString().toByteArray(StandardCharsets.UTF_8)
      nodes.forEach { node ->
        messageClient.sendMessage(node.id, path, data)
      }
    }
  }

  companion object {
    const val NAME = "VectorWatchBridge"
  }
}
