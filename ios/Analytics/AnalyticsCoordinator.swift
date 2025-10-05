import Foundation

final class AnalyticsCoordinator {
    private let telemetry: TelemetryClient
    private let crashBridge: CrashTelemetryBridge
    private let dsnProvider: () -> String?
    private var lastSignature: String?

    init(telemetry: TelemetryClient, baseURL: URL, dsnProvider: @escaping () -> String?) {
        self.telemetry = telemetry
        self.crashBridge = CrashTelemetryBridge(endpoint: baseURL.appendingPathComponent("telemetry"))
        self.dsnProvider = dsnProvider
    }

    func apply(flags: FeatureFlagConfig, configHash: String?) {
        let dsn = dsnProvider()?.trimmingCharacters(in: .whitespacesAndNewlines)
        AnalyticsInit.initIfEnabled(flags: flags, dsn: dsn)
        crashBridge.update(flags: flags)
        let signature = "\(configHash ?? "local"):\(flags.analyticsEnabled):\(flags.crashEnabled):\(!(dsn?.isEmpty ?? true))"
        if signature != lastSignature {
            telemetry.logAnalyticsConfig(
                analyticsEnabled: flags.analyticsEnabled,
                crashEnabled: flags.crashEnabled,
                dsnPresent: !(dsn?.isEmpty ?? true),
                configHash: configHash ?? "local"
            )
            lastSignature = signature
        }
    }
}
