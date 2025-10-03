import Foundation
import UIKit

final class TelemetryClient {
    private let session: URLSession
    private let encoder: JSONEncoder

    init(session: URLSession = .shared) {
        self.session = session
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    func send(result: BenchmarkResult, to endpoint: URL?, completion: ((Result<Void, Error>) -> Void)? = nil) {
        guard let endpoint else {
            completion?(.success(()))
            return
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            let payload = TelemetryPayload(platform: "ios", metrics: result)
            request.httpBody = try encoder.encode(payload)
        } catch {
            completion?(.failure(error))
            return
        }
        let task = session.dataTask(with: request) { data, response, error in
            if let error {
                print("[Telemetry] Failed: \(error)")
                completion?(.failure(error))
                return
            }
            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                let err = NSError(domain: "Telemetry", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Non-success status \(httpResponse.statusCode)"])
                print("[Telemetry] HTTP \(httpResponse.statusCode)")
                completion?(.failure(err))
                return
            }
            if let data, let responseBody = String(data: data, encoding: .utf8), !responseBody.isEmpty {
                print("[Telemetry] Response: \(responseBody)")
            }
            completion?(.success(()))
        }
        task.resume()
    }

    func sendPolicySamples(
        _ samples: [ThermalBatteryPolicy.TelemetrySample],
        to endpoint: URL?,
        completion: ((Result<Void, Error>) -> Void)? = nil
    ) {
        guard let endpoint, !samples.isEmpty else {
            completion?(.success(()))
            return
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        struct PolicyPayload: Codable {
            let type: String = "thermal_battery_sample"
            let timestampMs: Int64
            let thermalState: String
            let batteryPercent: Double?
            let batteryDeltaPercent: Double?
            let policyAction: String
            let trigger: String
            let device: String
            let osVersion: String

            enum CodingKeys: String, CodingKey {
                case type
                case timestampMs = "timestamp_ms"
                case thermalState = "thermal_state"
                case batteryPercent = "battery_percent"
                case batteryDeltaPercent = "battery_delta_percent"
                case policyAction = "policy_action"
                case trigger
                case device
                case osVersion = "os_version"
            }
        }

        let payloads = samples.map { sample in
            PolicyPayload(
                timestampMs: Int64(sample.timestamp.timeIntervalSince1970 * 1000),
                thermalState: sample.thermalState.description,
                batteryPercent: sample.batteryPercent,
                batteryDeltaPercent: sample.batteryDeltaPercent,
                policyAction: sample.action.rawValue,
                trigger: sample.trigger.rawValue,
                device: UIDevice.current.model,
                osVersion: UIDevice.current.systemVersion
            )
        }

        do {
            request.httpBody = try encoder.encode(payloads)
        } catch {
            completion?(.failure(error))
            return
        }

        let task = session.dataTask(with: request) { data, response, error in
            if let error {
                print("[Telemetry] Policy POST failed: \(error)")
                completion?(.failure(error))
                return
            }
            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                let err = NSError(
                    domain: "Telemetry",
                    code: httpResponse.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: "Non-success status \(httpResponse.statusCode)"]
                )
                print("[Telemetry] Policy HTTP \(httpResponse.statusCode)")
                completion?(.failure(err))
                return
            }
            if let data, let responseBody = String(data: data, encoding: .utf8), !responseBody.isEmpty {
                print("[Telemetry] Policy response: \(responseBody)")
            }
            completion?(.success(()))
        }
        task.resume()
    }
}
