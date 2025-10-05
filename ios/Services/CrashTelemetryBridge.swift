import Foundation

final class CrashTelemetryBridge {
    private let baseURL: URL
    private let session: URLSession
    private let queue = DispatchQueue(label: "com.golfiq.analytics.crash")
    private let maxFrames = 50

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func postCrash(
        _ error: Error,
        analyticsEnabled: Bool,
        crashEnabled: Bool,
        stackSymbols overrideSymbols: [String]? = nil
    ) {
        guard analyticsEnabled, crashEnabled else { return }
        let endpoint = baseURL.appendingPathComponent("telemetry")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 2.5

        let symbols = (overrideSymbols ?? Thread.callStackSymbols)
        let stackSymbols = symbols.prefix(maxFrames).joined(separator: "\n")
        let payload: [String: Any] = [
            "event": "app_crash",
            "message": String(describing: error),
            "exception": String(describing: type(of: error)),
            "stack": stackSymbols,
            "frames": min(symbols.count, maxFrames),
            "timestamp": Date().timeIntervalSince1970 * 1_000,
            "thread": Thread.isMainThread ? "main" : (Thread.current.name ?? "background")
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            return
        }

        queue.async {
            let task = self.session.uploadTask(with: request, from: data)
            task.resume()
        }
    }
}
