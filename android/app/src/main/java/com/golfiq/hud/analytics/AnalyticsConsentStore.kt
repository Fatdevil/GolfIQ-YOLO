package com.golfiq.hud.analytics

import android.content.Context
import android.content.SharedPreferences

internal class AnalyticsConsentStore(context: Context) {
    companion object {
        private const val PREFS_NAME = "analytics_consent"
        private const val KEY_GRANTED = "consent_granted"
    }

    private val preferences: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isGranted(): Boolean = preferences.getBoolean(KEY_GRANTED, false)

    fun setGranted(granted: Boolean) {
        preferences.edit().putBoolean(KEY_GRANTED, granted).apply()
    }
}
