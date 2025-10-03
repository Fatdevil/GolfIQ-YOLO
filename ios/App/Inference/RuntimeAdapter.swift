import Foundation

protocol DeviceProfileProviding {
    func deviceProfile() -> DeviceProfile
}

final class RuntimeAdapter {
    enum Mode: String, CaseIterable {
        case coreml
        case tfliteIos
    }

    private let profileProvider: DeviceProfileProviding
    private let defaults: UserDefaults
    private let overrideKey = "runtime_adapter_override"

    init(profileProvider: DeviceProfileProviding, defaults: UserDefaults = .standard) {
        self.profileProvider = profileProvider
        self.defaults = defaults
    }

    func availableModes() -> [Mode] {
        Mode.allCases
    }

    func activeMode() -> Mode {
        if let overrideValue = defaults.string(forKey: overrideKey),
           let override = Mode(rawValue: overrideValue) {
            return override
        }
        let profile = profileProvider.deviceProfile()
        return Mode(rawValue: profile.defaultRuntime.rawValue) ?? .coreml
    }

    func overrideMode(_ mode: Mode?) {
        if let mode {
            defaults.set(mode.rawValue, forKey: overrideKey)
        } else {
            defaults.removeObject(forKey: overrideKey)
        }
    }

    func describe() -> [String: Any] {
        let profile = profileProvider.deviceProfile()
        return [
            "tier": profile.tier.rawValue,
            "estimatedFps": profile.estimatedFps,
            "defaultRuntime": profile.defaultRuntime.rawValue,
            "activeRuntime": activeMode().rawValue,
        ]
    }
}
