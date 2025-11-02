package com.golfiq.wear.ui

import androidx.lifecycle.ViewModel
import com.golfiq.wear.HudState
import com.golfiq.wear.data.HudStateRepository
import com.golfiq.wear.overlay.OverlayRepository
import com.golfiq.wear.overlay.OverlaySnapshotV1DTO
import kotlinx.coroutines.flow.StateFlow

class HudViewModel : ViewModel() {
  val hudState: StateFlow<HudState> = HudStateRepository.hudState
  val overlayState: StateFlow<OverlaySnapshotV1DTO?> = OverlayRepository.snapshot

  fun onPayload(bytes: ByteArray) {
    HudStateRepository.updateFromBytes(bytes)
  }
}
