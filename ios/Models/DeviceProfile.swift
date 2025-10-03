import Foundation

struct DeviceProfile: Codable, Identifiable {
    enum Tier: String, Codable {
        case a = "A"
        case b = "B"
        case c = "C"
    }

    enum RuntimePreference: String, Codable {
        case coreml
        case tfliteIos
    }

    let id: String
    let osVersion: String
    let chipset: String
    let thermalThresholds: [String: Double]
    let batteryCapacityMah: Int
    let tier: Tier
    let estimatedFps: Double
    let defaultRuntime: RuntimePreference
    let lastEvaluatedAtMillis: Int64
}
