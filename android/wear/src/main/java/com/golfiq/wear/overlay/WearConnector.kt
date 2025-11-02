package com.golfiq.wear.overlay

import android.util.Log
import androidx.annotation.VisibleForTesting
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.text.Charsets

private const val OVERLAY_PATH_PREFIX = "/golfiq/overlay/v1"
private const val TAG = "WearOverlay"

object OverlayRepository {
    private val _snapshot = MutableStateFlow<OverlaySnapshotV1DTO?>(null)
    val snapshot: StateFlow<OverlaySnapshotV1DTO?> = _snapshot.asStateFlow()

    fun updateFromBytes(bytes: ByteArray) {
        runCatching { OverlaySnapshotV1DTO.fromJsonBytes(bytes) }
            .onSuccess { snapshot ->
                if (snapshot != null) {
                    _snapshot.value = snapshot
                }
            }
            .onFailure { error ->
                Log.w(TAG, "Failed to decode overlay snapshot", error)
            }
    }

    @VisibleForTesting
    fun reset() {
        _snapshot.value = null
    }
}

class WearConnector : WearableListenerService() {
    private fun extractOverlayPayload(item: DataItem): ByteArray? {
        return runCatching {
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            extractOverlayPayload(dataMap)
        }.getOrNull()
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.use { buffer ->
            for (event in buffer) {
                if (event.type != DataEvent.TYPE_CHANGED) continue
                val item = event.dataItem
                val path = item.uri.path.orEmpty()
                if (!path.startsWith(OVERLAY_PATH_PREFIX)) continue

                val payload = extractOverlayPayload(item)

                if (payload != null) {
                    OverlayRepository.updateFromBytes(payload)
                } else {
                    Log.w(TAG, "Overlay payload missing for $path")
                }
            }
        }
    }
}

@VisibleForTesting
internal fun extractOverlayPayload(dataMap: DataMap): ByteArray? {
    return dataMap.getByteArray("payload")
        ?: dataMap.getString("payload")?.toByteArray(Charsets.UTF_8)
}
