import Foundation

final class TelemetryClient {
    struct MetricRecord: Codable {
        let name: String
        let value: Double
        let deviceClass: String
        let sampled: Bool
    }

    struct DeviceProfilePayload: Codable {
        let id: String
        let tier: String
        let estimatedFps: Double
        let defaultRuntime: String
        let activeRuntime: String
    }

    struct PolicySample: Codable {
        let timestamp: Date
        let thermalState: String
        let batteryPercent: Double?
        let batteryDeltaPercent: Double?
        let action: String
        let trigger: String
    }

    private(set) var metrics: [MetricRecord] = []
    private(set) var deviceProfiles: [DeviceProfilePayload] = []
    private(set) var impactTriggerCount: Int = 0
    private(set) var policySamples: [PolicySample] = []

    func emit(name: String, value: Double, deviceClass: String, sampled: Bool) {
        metrics.append(MetricRecord(name: name, value: value, deviceClass: deviceClass, sampled: sampled))
    }

    func postDeviceProfile(profile: DeviceProfile, activeRuntime: String) {
        deviceProfiles.append(
            DeviceProfilePayload(
                id: profile.id,
                tier: profile.tier.rawValue,
                estimatedFps: profile.estimatedFps,
                defaultRuntime: profile.defaultRuntime.rawValue,
                activeRuntime: activeRuntime
            )
        )
    }

    func logImpactTriggerEvent(magnitudeDb: Double) {
        impactTriggerCount += 1
        emit(name: "impact_trigger", value: magnitudeDb, deviceClass: "audio", sampled: true)
    }

    func postPolicySample(_ sample: PolicySample) {
        policySamples.append(sample)
    }
}
