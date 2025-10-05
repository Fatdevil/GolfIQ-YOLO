package com.golfiq.hud.analytics

import android.content.Context
import com.golfiq.hud.model.FeatureFlagConfig
import io.sentry.SentryEvent
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.SentryException
import io.sentry.protocol.User
import java.net.URL
import java.util.Locale
import kotlin.random.Random

class AnalyticsController(
    context: Context,
    baseUrl: URL,
) {
    private val consentStore = AnalyticsConsentStore(context)
    private val crashBridge = CrashTelemetryBridge(baseUrl)
    private val envAnalyticsEnabled = System.getenv("ANALYTICS_ENABLED")?.lowercase(Locale.US) != "false"
    private val sentryDsn = System.getenv("SENTRY_DSN_MOBILE")?.takeIf { it.isNotBlank() }
    private val random = Random(System.currentTimeMillis())
    private val appContext = context.applicationContext

    @Volatile
    private var remoteAnalyticsEnabled: Boolean = true

    @Volatile
    private var remoteCrashEnabled: Boolean = true

    @Volatile
    private var sentryInstalled: Boolean = false

    @Volatile
    private var crashHandlerInstalled: Boolean = false

    private var upstreamHandler: Thread.UncaughtExceptionHandler? = null

    fun update(featureFlags: FeatureFlagConfig) {
        remoteAnalyticsEnabled = featureFlags.analyticsEnabled
        remoteCrashEnabled = featureFlags.crashEnabled
        if (isAnalyticsAllowed()) {
            installSentry()
        } else {
            clearSentry()
        }
        installCrashHandler()
    }

    fun setUserConsent(granted: Boolean) {
        consentStore.setGranted(granted)
        if (!granted) {
            clearSentry()
        } else if (isAnalyticsAllowed()) {
            installSentry()
        }
    }

    fun hasUserConsent(): Boolean = consentStore.isGranted()

    private fun isAnalyticsAllowed(): Boolean {
        return envAnalyticsEnabled && consentStore.isGranted() && remoteAnalyticsEnabled
    }

    private fun isCrashAllowed(): Boolean {
        return isAnalyticsAllowed() && remoteCrashEnabled
    }

    private fun installSentry() {
        if (sentryInstalled || sentryDsn.isNullOrBlank()) {
            return
        }
        runCatching {
            SentryAndroid.init(appContext) { options ->
                configureOptions(options)
            }
            sentryInstalled = true
        }.onFailure {
            sentryInstalled = false
        }
    }

    private fun configureOptions(options: SentryOptions) {
        options.dsn = sentryDsn
        options.isEnableAutoSessionTracking = false
        options.isEnableUserInteractionBreadcrumbs = false
        options.isSendDefaultPii = false
        options.beforeSend = SentryOptions.BeforeSendCallback { event: SentryEvent, _ ->
            if (!isAnalyticsAllowed() || random.nextDouble() > SAMPLE_RATE) {
                return@BeforeSendCallback null
            }
            event.user = event.user?.scrubbed() ?: User()
            event.contexts.remove("geo")
            event.exceptions?.forEach { exception ->
                scrubStack(exception)
            }
            event
        }
    }

    private fun scrubStack(exception: SentryException) {
        val stacktrace = exception.stacktrace ?: return
        val frames = stacktrace.frames ?: return
        if (frames.size > MAX_STACK_FRAMES) {
            stacktrace.frames = frames.takeLast(MAX_STACK_FRAMES)
        }
    }

    private fun clearSentry() {
        if (!sentryInstalled) {
            return
        }
        runCatching {
            io.sentry.Sentry.close()
        }
        sentryInstalled = false
    }

    private fun installCrashHandler() {
        if (crashHandlerInstalled) {
            return
        }
        upstreamHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            crashBridge.postCrash(throwable, isAnalyticsAllowed(), isCrashAllowed())
            upstreamHandler?.uncaughtException(thread, throwable)
        }
        crashHandlerInstalled = true
    }

    fun shutdown() {
        if (crashHandlerInstalled) {
            Thread.setDefaultUncaughtExceptionHandler(upstreamHandler)
            crashHandlerInstalled = false
        }
        clearSentry()
        crashBridge.shutdown()
    }

    private fun User.scrubbed(): User {
        this.email = null
        this.ipAddress = null
        return this
    }

    private companion object {
        private const val SAMPLE_RATE = 0.2
        private const val MAX_STACK_FRAMES = 50
    }
}
