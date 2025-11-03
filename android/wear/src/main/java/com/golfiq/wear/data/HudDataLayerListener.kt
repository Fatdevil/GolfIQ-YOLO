package com.golfiq.wear.data

import android.util.Log
import androidx.annotation.VisibleForTesting
import com.golfiq.wear.HudCodec
import com.golfiq.wear.HudState
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.nio.charset.StandardCharsets

private const val HUD_DATA_PATH_PREFIX = "/golfiq/hud/v1"
private const val WATCH_MESSAGE_PATH = "/golfiq/watch/msg"
private const val TAG = "HudDataLayer"

object HudStateRepository {
    private val _hudState = MutableStateFlow(HudState.EMPTY)
    val hudState: StateFlow<HudState> = _hudState.asStateFlow()

    fun latest(): HudState = _hudState.value

    fun updateFromBytes(bytes: ByteArray) {
        runCatching { HudCodec.decode(bytes) }
            .onSuccess { _hudState.value = it }
            .onFailure { error ->
                Log.w(TAG, "Failed to decode HUD payload", error)
            }
    }

    fun updateCaddieAdvice(raw: Any?) {
        val hint = HudCodec.parseAdvice(raw)
        if (hint != null) {
            _hudState.value = _hudState.value.copy(caddie = hint)
        }
    }

    @VisibleForTesting
    fun reset() {
        _hudState.value = HudState.EMPTY
    }
}

class HudDataLayerListener : WearableListenerService() {
    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.use { buffer ->
            for (event in buffer) {
                if (event.type != DataEvent.TYPE_CHANGED) continue
                val dataItem = event.dataItem
                val path = dataItem.uri.path.orEmpty()
                if (!path.startsWith(HUD_DATA_PATH_PREFIX)) continue

                val payload = runCatching {
                    DataMapItem.fromDataItem(dataItem)
                        .dataMap
                        .getByteArray("payload")
                }.getOrNull()

                if (payload != null) {
                    HudStateRepository.updateFromBytes(payload)
                } else {
                    Log.w(TAG, "HUD payload missing byte payload for $path")
                }
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path == WATCH_MESSAGE_PATH) {
            val payload = try {
                String(messageEvent.data, StandardCharsets.UTF_8)
            } catch (_: Exception) {
                null
            }
            if (payload != null) {
                runCatching { JSONObject(payload) }
                    .onSuccess { json ->
                        val type = json.optString("type")
                        if (type == "CADDIE_ADVICE_V1") {
                            val adviceRaw = json.opt("advice")
                            val payload = if (adviceRaw == null || adviceRaw == JSONObject.NULL) json else adviceRaw
                            HudStateRepository.updateCaddieAdvice(payload)
                        }
                    }
                    .onFailure { error -> Log.w(TAG, "Failed to parse watch message", error) }
            }
        } else {
            super.onMessageReceived(messageEvent)
        }
    }
}
