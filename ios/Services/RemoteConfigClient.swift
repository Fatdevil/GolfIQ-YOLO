import Foundation

struct RemoteTierConfig: Codable {
    let hudEnabled: Bool?
    let fieldTestMode: Bool?
    let inputSize: Int?
    let reducedRate: Bool?
    let analyticsEnabled: Bool?
    let crashEnabled: Bool?
}

struct RemoteConfigEnvelope: Codable {
    let config: [String: RemoteTierConfig]
    let etag: String
    let updatedAt: String?
}

final class RemoteConfigClient {
    private let baseURL: URL
    private let session: URLSession
    private let profileProvider: DeviceProfileProviding
    private let featureFlags: FeatureFlagsService
    private let telemetry: TelemetryClient
    private let runtimeDescriptor: () -> [String: Any]
    private let analyticsObserver: ((FeatureFlagConfig) -> Void)?
    private let refreshInterval: TimeInterval = 12 * 60 * 60
    private let queue = DispatchQueue(label: "com.golfiq.remote-config")

    private var etag: String?
    private var timer: Timer?
    private var lastAppliedAt: Date?
    private var lastAppliedHash: String?

    init(
        baseURL: URL,
        session: URLSession = .shared,
        profileProvider: DeviceProfileProviding,
        featureFlags: FeatureFlagsService,
        telemetry: TelemetryClient,
        runtimeDescriptor: @escaping () -> [String: Any],
        analyticsObserver: ((FeatureFlagConfig) -> Void)? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        self.profileProvider = profileProvider
        self.featureFlags = featureFlags
        self.telemetry = telemetry
        self.runtimeDescriptor = runtimeDescriptor
        self.analyticsObserver = analyticsObserver
    }

    deinit {
        timer?.invalidate()
    }

    func start() {
        queue.async { [weak self] in
            self?.fetch()
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.timer?.invalidate()
            self.timer = Timer.scheduledTimer(withTimeInterval: self.refreshInterval, repeats: true) { [weak self] _ in
                self?.queue.async { self?.fetch() }
            }
        }
    }

    private func fetch() {
        let requestURL = baseURL.appendingPathComponent("config/remote")

        var request = URLRequest(url: requestURL)
        request.httpMethod = "GET"
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        if let etag = etag {
            request.addValue(etag, forHTTPHeaderField: "If-None-Match")
        }

        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            if let error = error {
                print("RemoteConfigClient fetch error: \(error)")
                return
            }
            guard let httpResponse = response as? HTTPURLResponse else {
                return
            }
            if httpResponse.statusCode == 304 {
                return
            }
            guard
                httpResponse.statusCode == 200,
                let data = data
            else {
                print("RemoteConfigClient unexpected status: \(httpResponse.statusCode)")
                return
            }

            do {
                let decoder = JSONDecoder()
                let envelope = try decoder.decode(RemoteConfigEnvelope.self, from: data)
                let headerEtag = (httpResponse.allHeaderFields["ETag"] as? String) ?? envelope.etag
                self.apply(envelope: envelope, etag: headerEtag)
            } catch {
                print("RemoteConfigClient decode error: \(error)")
            }
        }
        task.resume()
    }

    private func apply(envelope: RemoteConfigEnvelope, etag: String) {
        let profile = profileProvider.deviceProfile()
        let tierKey = "tier" + profile.tier.rawValue.uppercased()
        guard let tierConfig = envelope.config[tierKey] else {
            return
        }
        self.etag = etag

        let current = featureFlags.current()
        let overrides = FeatureFlagConfig(
            hudEnabled: tierConfig.hudEnabled ?? current.hudEnabled,
            hudTracerEnabled: current.hudTracerEnabled,
            fieldTestModeEnabled: tierConfig.fieldTestMode ?? current.fieldTestModeEnabled,
            hudWindHintEnabled: current.hudWindHintEnabled,
            hudTargetLineEnabled: current.hudTargetLineEnabled,
            hudBatterySaverEnabled: current.hudBatterySaverEnabled,
            handsFreeImpactEnabled: current.handsFreeImpactEnabled,
            analyticsEnabled: tierConfig.analyticsEnabled ?? current.analyticsEnabled,
            crashEnabled: tierConfig.crashEnabled ?? current.crashEnabled,
            inputSize: tierConfig.inputSize ?? current.inputSize,
            reducedRate: tierConfig.reducedRate ?? current.reducedRate,
            source: .remoteConfig
        )
        featureFlags.applyRemote(overrides: overrides)
        analyticsObserver?(overrides)

        let runtime = runtimeDescriptor()
        let normalized = etag.replacingOccurrences(of: "\"", with: "")
        telemetry.logRemoteConfigActive(
            hash: normalized,
            profile: profile,
            runtime: runtime,
            inputSize: overrides.inputSize,
            reducedRate: overrides.reducedRate,
            analyticsEnabled: overrides.analyticsEnabled,
            crashEnabled: overrides.crashEnabled
        )
        lastAppliedHash = normalized
        lastAppliedAt = Date()
    }

    func etagAgeDays(now: Date = Date()) -> Int? {
        guard let appliedAt = lastAppliedAt else {
            return nil
        }
        let interval = now.timeIntervalSince(appliedAt)
        if interval < 0 {
            return 0
        }
        return Int(interval / (24 * 60 * 60))
    }

    func activeEtagHash() -> String? {
        lastAppliedHash
    }
}
