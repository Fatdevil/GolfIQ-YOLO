package com.golfiq.hud.analytics

import android.content.Context
import com.golfiq.hud.model.FeatureFlagConfig
import io.sentry.SentryEvent
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import java.util.concurrent.atomic.AtomicReference

object AnalyticsInit {
    private val initializedDsn = AtomicReference<String?>()

    fun initIfEnabled(context: Context, flags: FeatureFlagConfig, dsn: String?) {
        if (!(flags.analyticsEnabled || flags.crashEnabled)) {
            return
        }
        val trimmed = dsn?.trim()
        if (trimmed.isNullOrEmpty()) {
            return
        }
        if (initializedDsn.get() == trimmed) {
            return
        }
        SentryAndroid.init(context) { options: SentryOptions ->
            options.dsn = trimmed
            options.isSendDefaultPii = false
            options.tracesSampleRate = 0.2
            options.beforeSend = SentryOptions.BeforeSendCallback { event: SentryEvent?, _ ->
                Scrubber.scrub(event)
            }
        }
        initializedDsn.set(trimmed)
    }
}
