package com.golfiq.wear.bridge

import android.content.Context
import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.golfiq.wear.model.HoleBoundingBox
import com.golfiq.wear.model.HoleModel
import com.golfiq.wear.model.HolePoint
import com.golfiq.wear.model.HolePolygon
import com.golfiq.wear.model.HoleUiState
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class WearConnector : ViewModel(), MessageClient.OnMessageReceivedListener {
  private var appContext: Context? = null
  private var messageClient: MessageClient? = null

  private val _uiState = MutableStateFlow(HoleUiState())
  val uiState: StateFlow<HoleUiState> = _uiState

  private val lastUpdateMillis = AtomicLong(0L)
  private var isMoving = false

  fun initialize(context: Context) {
    if (appContext == null) {
      appContext = context.applicationContext
      messageClient = Wearable.getMessageClient(context)
    }
  }

  fun onResume() {
    messageClient?.addListener(this)
  }

  fun onPause() {
    messageClient?.removeListener(this)
  }

  override fun onMessageReceived(messageEvent: MessageEvent) {
    val payload = messageEvent.data?.toString(StandardCharsets.UTF_8) ?: return
    when (messageEvent.path) {
      "/holeModel" -> applyHoleModel(payload)
      "/playerPos" -> updatePlayer(payload)
      "/targetPos" -> updateTarget(payload)
    }
  }

  private fun applyHoleModel(json: String) {
    val model = parseHoleModel(json) ?: return
    dispatchUpdate(force = true) { current -> current.copy(hole = model) }
  }

  private fun updatePlayer(json: String) {
    val point = parsePoint(JSONObject(json)) ?: return
    isMoving = true
    dispatchUpdate { current -> current.copy(player = point) }
  }

  private fun updateTarget(json: String) {
    val jsonObject = JSONObject(json)
    val point = parsePoint(jsonObject) ?: return
    val safe = jsonObject.optBoolean("tournamentSafe", _uiState.value.tournamentSafe)
    dispatchUpdate { current -> current.copy(target = point, tournamentSafe = safe) }
  }

  fun emitTargetMoved(point: HolePoint) {
    dispatchUpdate(force = true) { current -> current.copy(target = point) }
    val context = appContext ?: return
    Wearable.getNodeClient(context)
      .connectedNodes
      .addOnSuccessListener { nodes ->
        val data = JSONObject()
          .put("lat", point.lat)
          .put("lon", point.lon)
          .toString()
          .toByteArray(StandardCharsets.UTF_8)
        nodes.forEach { node ->
          messageClient?.sendMessage(node.id, "/targetMoved", data)
        }
      }
  }

  private fun dispatchUpdate(force: Boolean = false, block: (HoleUiState) -> HoleUiState) {
    val now = SystemClock.elapsedRealtime()
    val minInterval = if (isMoving) 1000L else 3000L
    if (!force && now - lastUpdateMillis.get() < minInterval) {
      return
    }
    if (!force) {
      lastUpdateMillis.set(now)
      isMoving = false
    }
    viewModelScope.launch {
      _uiState.value = block(_uiState.value)
    }
  }

  private fun parseHoleModel(json: String): HoleModel? {
    return try {
      val root = JSONObject(json)
      val bbox = root.getJSONObject("bbox")
      HoleModel(
        id = root.getString("id"),
        bbox = HoleBoundingBox(
          minLat = bbox.getDouble("minLat"),
          minLon = bbox.getDouble("minLon"),
          maxLat = bbox.getDouble("maxLat"),
          maxLon = bbox.getDouble("maxLon"),
        ),
        fairways = parsePolygons(root.getJSONArray("fairways")),
        greens = parsePolygons(root.getJSONArray("greens")),
        bunkers = parsePolygons(root.getJSONArray("bunkers")),
        pin = root.optJSONObject("pin")?.let { parsePoint(it) },
      )
    } catch (_: Exception) {
      null
    }
  }

  private fun parsePolygons(array: JSONArray): List<HolePolygon> {
    val polygons = mutableListOf<HolePolygon>()
    for (i in 0 until array.length()) {
      val ring = array.getJSONArray(i)
      val points = mutableListOf<HolePoint>()
      for (j in 0 until ring.length()) {
        parsePoint(ring.getJSONObject(j))?.let { points.add(it) }
      }
      if (points.size >= 3) {
        polygons.add(points)
      }
    }
    return polygons
  }

  private fun parsePoint(json: JSONObject): HolePoint? {
    return if (json.has("lat") && json.has("lon")) {
      HolePoint(json.getDouble("lat"), json.getDouble("lon"))
    } else {
      null
    }
  }
}
