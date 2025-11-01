package com.golfiq.wear.data

import android.util.Log
import androidx.annotation.VisibleForTesting
import com.golfiq.wear.HudCodec
import com.golfiq.wear.HudState
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val HUD_DATA_PATH = "/golfiq/hud/v1"
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
                if (dataItem.uri.path != HUD_DATA_PATH) continue
                val bytes = dataItem.data
                if (bytes != null) {
                    HudStateRepository.updateFromBytes(bytes)
                } else {
                    Log.w(TAG, "HUD payload missing data bytes")
                }
            }
        }
    }
}
