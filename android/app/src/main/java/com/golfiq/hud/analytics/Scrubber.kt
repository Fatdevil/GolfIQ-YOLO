package com.golfiq.hud.analytics

import io.sentry.Breadcrumb
import io.sentry.SentryEvent
import io.sentry.protocol.SentryException
import io.sentry.protocol.SentryStackTrace

object Scrubber {
    private const val MAX_STACK_FRAMES = 20

    fun scrub(event: SentryEvent?): SentryEvent? {
        if (event == null) {
            return null
        }
        event.user = null
        event.request = null
        event.serverName = null
        event.contexts.remove("device")
        event.contexts.remove("app")
        event.contexts.remove("trace")
        event.breadcrumbs = event.breadcrumbs
            ?.filterNot { containsPii(it) }
            ?.take(30)
        event.exceptions?.forEach { exception: SentryException ->
            val stackTrace = exception.stacktrace ?: return@forEach
            trimStackTrace(stackTrace)
        }
        event.extra.clear()
        return event
    }

    private fun containsPii(breadcrumb: Breadcrumb): Boolean {
        val message = buildString {
            append(breadcrumb.message ?: "")
            if (!breadcrumb.data.isNullOrEmpty()) {
                append(' ')
                append(breadcrumb.data.values.joinToString(separator = " "))
            }
        }
        val lowered = message.lowercase()
        return lowered.contains("@") || lowered.contains("email") || lowered.contains("ssn")
    }

    private fun trimStackTrace(stackTrace: SentryStackTrace) {
        val frames = stackTrace.frames ?: return
        if (frames.size > MAX_STACK_FRAMES) {
            stackTrace.frames = frames.takeLast(MAX_STACK_FRAMES)
        }
    }
}
