import Foundation

#if canImport(Sentry)
import Sentry
#endif

final class AnalyticsController {
    private let consentStore: AnalyticsConsentStore
    private let crashBridge: CrashTelemetryBridge
    private let envAnalyticsEnabled: Bool
    private let sentryDSN: String?
    private var remoteAnalyticsEnabled: Bool = true
    private var remoteCrashEnabled: Bool = true
    private var sentryInstalled = false
    private var uncaughtHandlerInstalled = false
    private var previousExceptionHandler: (@convention(c) (NSException) -> Void)?
    private let sampleRate: Double = 0.2

    init(baseURL: URL, consentStore: AnalyticsConsentStore = AnalyticsConsentStore()) {
        self.consentStore = consentStore
        self.crashBridge = CrashTelemetryBridge(baseURL: baseURL)
        let env = ProcessInfo.processInfo.environment
        self.envAnalyticsEnabled = env["ANALYTICS_ENABLED"]?.lowercased() != "false"
        self.sentryDSN = env["SENTRY_DSN_MOBILE"].flatMap { $0.isEmpty ? nil : $0 }
    }

    func update(flags: FeatureFlagConfig) {
        remoteAnalyticsEnabled = flags.analyticsEnabled
        remoteCrashEnabled = flags.crashEnabled
        if isAnalyticsAllowed {
            installSentry()
        } else {
            shutdownSentry()
        }
        installCrashHandler()
    }

    func setConsent(granted: Bool) {
        consentStore.setGranted(granted)
        if granted {
            if isAnalyticsAllowed {
                installSentry()
            }
        } else {
            shutdownSentry()
        }
    }

    var hasConsent: Bool { consentStore.isGranted }

    private var isAnalyticsAllowed: Bool {
        envAnalyticsEnabled && consentStore.isGranted && remoteAnalyticsEnabled
    }

    private func installCrashHandler() {
        guard !uncaughtHandlerInstalled else { return }
        previousExceptionHandler = NSGetUncaughtExceptionHandler()
        AnalyticsCrashProxy.controller = self
        NSSetUncaughtExceptionHandler { exception in
            AnalyticsCrashProxy.controller?.handle(exception: exception)
        }
        uncaughtHandlerInstalled = true
    }

    private func handle(exception: NSException) {
        crashBridge.postCrash(exception, analyticsEnabled: isAnalyticsAllowed, crashEnabled: remoteCrashEnabled)
        previousExceptionHandler?(exception)
    }

    #if canImport(Sentry)
    private func installSentry() {
        guard !sentryInstalled, let dsn = sentryDSN else { return }
        SentrySDK.start { [weak self] options in
            guard let self else { return }
            options.dsn = dsn
            options.enableAutoSessionTracking = false
            options.sendDefaultPii = false
            options.beforeSend = { event in
                guard self.isAnalyticsAllowed else { return nil }
                if Double.random(in: 0 ..< 1) > self.sampleRate { return nil }
                event.user?.email = nil
                event.user?.ipAddress = nil
                if var contexts = event.context, contexts["geo"] != nil {
                    contexts["geo"] = nil
                    event.context = contexts
                }
                if var exceptions = event.exceptions, !exceptions.isEmpty {
                    for index in exceptions.indices {
                        if var stacktrace = exceptions[index].stacktrace,
                           stacktrace.frames.count > self.maxFrames {
                            stacktrace.frames = Array(stacktrace.frames.suffix(self.maxFrames))
                            exceptions[index].stacktrace = stacktrace
                        }
                    }
                    event.exceptions = exceptions
                }
                return event
            }
        }
        sentryInstalled = true
    }
    #else
    private func installSentry() {
        // No-op when Sentry SDK is not linked.
    }
    #endif

    func shutdown() {
        shutdownSentry()
        if uncaughtHandlerInstalled {
            NSSetUncaughtExceptionHandler(previousExceptionHandler)
            AnalyticsCrashProxy.controller = nil
            uncaughtHandlerInstalled = false
        }
    }

    private func shutdownSentry() {
        #if canImport(Sentry)
        if sentryInstalled {
            SentrySDK.close()
            sentryInstalled = false
        }
        #endif
    }
}

private let maxFramesDefault = 50

extension AnalyticsController {
    fileprivate var maxFrames: Int { maxFramesDefault }
}

private final class AnalyticsCrashProxy {
    static weak var controller: AnalyticsController?
}

private extension CrashTelemetryBridge {
    func postCrash(_ exception: NSException, analyticsEnabled: Bool, crashEnabled: Bool) {
        let error = NSError(domain: exception.name.rawValue, code: 0, userInfo: [NSLocalizedDescriptionKey: exception.reason ?? exception.name.rawValue])
        postCrash(
            error,
            analyticsEnabled: analyticsEnabled,
            crashEnabled: crashEnabled,
            stackSymbols: exception.callStackSymbols
        )
    }
}
