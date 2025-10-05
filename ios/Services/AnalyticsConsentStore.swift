import Foundation

final class AnalyticsConsentStore {
    private let defaults: UserDefaults
    private let key = "analytics.consent.granted"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isGranted: Bool {
        defaults.bool(forKey: key)
    }

    func setGranted(_ granted: Bool) {
        defaults.set(granted, forKey: key)
    }
}
