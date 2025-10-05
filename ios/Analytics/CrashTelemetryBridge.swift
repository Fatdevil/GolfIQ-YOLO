import Foundation

final class CrashTelemetryBridge {
    private static var activeBridge: CrashTelemetryBridge?

    private let telemetryURL: URL
    private var crashEnabled = false
    private var previousHandler: (@convention(c) (NSException) -> Void)?

    init(endpoint: URL) {
        telemetryURL = endpoint
    }

    func update(flags: FeatureFlagConfig) {
        crashEnabled = flags.crashEnabled
        if crashEnabled {
            install()
        } else {
            uninstall()
        }
    }

    private func install() {
        guard CrashTelemetryBridge.activeBridge !== self else { return }
        previousHandler = NSGetUncaughtExceptionHandler()
        CrashTelemetryBridge.activeBridge = self
        NSSetUncaughtExceptionHandler { exception in
            CrashTelemetryBridge.activeBridge?.handle(exception: exception)
        }
    }

    private func uninstall() {
        guard CrashTelemetryBridge.activeBridge === self else { return }
        NSSetUncaughtExceptionHandler(previousHandler)
        CrashTelemetryBridge.activeBridge = nil
    }

    private func handle(exception: NSException) {
        postCrashEvent()
        previousHandler?(exception)
    }

    private func postCrashEvent() {
        var request = URLRequest(url: telemetryURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = [
            "event": "app_crash",
            "platform": "ios",
            "sampled": true,
            "ts": Int(Date().timeIntervalSince1970 * 1000),
            "thermal": "unknown",
            "batteryPct": -1
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        let session = URLSession(configuration: .ephemeral)
        let task = session.dataTask(with: request)
        task.resume()
    }
}
