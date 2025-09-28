import Foundation

final class TelemetryClient {
    struct MetricRecord: Codable {
        let name: String
        let value: Double
        let deviceClass: String
        let sampled: Bool
    }

    private(set) var metrics: [MetricRecord] = []

    func emit(name: String, value: Double, deviceClass: String, sampled: Bool) {
        metrics.append(MetricRecord(name: name, value: value, deviceClass: deviceClass, sampled: sampled))
    }
}