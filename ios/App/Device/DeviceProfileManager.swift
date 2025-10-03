import Foundation
import UIKit

protocol InferenceMicrobench {
    func sampleLatency(duration: TimeInterval) -> [Double]
}

final class DeviceProfileManager: DeviceProfileProviding {
    private let microbench: InferenceMicrobench
    private let telemetry: TelemetryClient
    private let defaults: UserDefaults
    private let clock: () -> Date

    private let profileKey = "device_profile_payload"
    private let profileVersionKey = "device_profile_version"
    private let currentVersion = 1
    private let benchWindow: TimeInterval = 8.0

    init(
        microbench: InferenceMicrobench,
        telemetry: TelemetryClient,
        defaults: UserDefaults = .standard,
        clock: @escaping () -> Date = Date.init
    ) {
        self.microbench = microbench
        self.telemetry = telemetry
        self.defaults = defaults
        self.clock = clock
    }

    func deviceProfile() -> DeviceProfile {
        ensureProfile()
    }

    @discardableResult
    func ensureProfile() -> DeviceProfile {
        if let cached = load() {
            return cached
        }

        let latencies = microbench.sampleLatency(duration: benchWindow)
        let p95 = percentile(latencies, percentile: 95)
        let fps = p95 == 0 ? 0 : 1000.0 / p95
        let tier = resolveTier(fps: fps)
        let runtime = defaultRuntime(for: tier)
        let profile = DeviceProfile(
            id: UIDevice.current.name,
            osVersion: UIDevice.current.systemVersion,
            chipset: DeviceProfileManager.hardwareIdentifier(),
            thermalThresholds: [:],
            batteryCapacityMah: -1,
            tier: tier,
            estimatedFps: fps,
            defaultRuntime: runtime,
            lastEvaluatedAtMillis: Int64(clock().timeIntervalSince1970 * 1000)
        )
        persist(profile)
        telemetry.postDeviceProfile(profile: profile, activeRuntime: runtime.rawValue)
        return profile
    }

    func clear() {
        defaults.removeObject(forKey: profileKey)
        defaults.removeObject(forKey: profileVersionKey)
    }

    private func resolveTier(fps: Double) -> DeviceProfile.Tier {
        if fps >= 30 {
            return .a
        } else if fps >= 15 {
            return .b
        } else {
            return .c
        }
    }

    private func defaultRuntime(for tier: DeviceProfile.Tier) -> DeviceProfile.RuntimePreference {
        switch tier {
        case .a, .b:
            return .coreml
        case .c:
            return .tfliteIos
        }
    }

    private func percentile(_ values: [Double], percentile: Int) -> Double {
        guard !values.isEmpty else { return Double.infinity }
        let sorted = values.sorted()
        let rank = Double(percentile) / 100.0 * Double(sorted.count - 1)
        let lowerIndex = Int(floor(rank))
        let upperIndex = min(lowerIndex + 1, sorted.count - 1)
        let weight = rank - Double(lowerIndex)
        return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
    }

    private func persist(_ profile: DeviceProfile) {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(profile) else { return }
        defaults.set(data, forKey: profileKey)
        defaults.set(currentVersion, forKey: profileVersionKey)
    }

    private func load() -> DeviceProfile? {
        guard defaults.integer(forKey: profileVersionKey) == currentVersion,
              let data = defaults.data(forKey: profileKey) else {
            return nil
        }
        return try? JSONDecoder().decode(DeviceProfile.self, from: data)
    }

    private static func hardwareIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        return machineMirror.children.reduce(into: "") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return }
            identifier.append(Character(UnicodeScalar(UInt8(value))))
        }
    }
}
