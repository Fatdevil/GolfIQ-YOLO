import Foundation
import Sentry

enum AnalyticsInit {
    private static var initializedDsn: String?

    static func initIfEnabled(flags: FeatureFlagConfig, dsn: String?) {
        guard (flags.analyticsEnabled || flags.crashEnabled),
              let trimmed = dsn?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return
        }
        if initializedDsn == trimmed {
            return
        }
        SentrySDK.start { options in
            options.dsn = trimmed
            options.enableAutoSessionTracking = false
            options.tracesSampleRate = 0.2
            options.beforeSend = { event in
                Scrubber.scrub(event: event)
            }
        }
        initializedDsn = trimmed
    }
}
