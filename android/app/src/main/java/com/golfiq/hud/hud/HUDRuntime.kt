package com.golfiq.hud.hud

import android.util.Log

object HUDRuntime {
    private const val TAG = "HUDRuntime"

    fun switchTo2DCompass() {
        Log.i(TAG, "Switching to 2D compass fallback due to thermal/battery constraints")
        // Actual implementation will swap heavy AR overlays for a lightweight compass mode.
    }
}
