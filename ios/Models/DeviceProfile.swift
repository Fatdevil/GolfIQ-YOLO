import Foundation

struct DeviceProfile: Codable, Identifiable {
    let id: String
    let osVersion: String
    let chipset: String
    let thermalThresholds: [String: Double]
    let batteryCapacityMah: Int
}