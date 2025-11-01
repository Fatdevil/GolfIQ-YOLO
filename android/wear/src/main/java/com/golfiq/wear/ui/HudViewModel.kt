package com.golfiq.wear.ui

import androidx.lifecycle.ViewModel
import com.golfiq.wear.HudState
import com.golfiq.wear.data.HudStateRepository
import kotlinx.coroutines.flow.StateFlow

class HudViewModel : ViewModel() {
    val hudState: StateFlow<HudState> = HudStateRepository.hudState

    fun onPayload(bytes: ByteArray) {
        HudStateRepository.updateFromBytes(bytes)
    }
}
