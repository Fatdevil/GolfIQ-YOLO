import Foundation

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
}
