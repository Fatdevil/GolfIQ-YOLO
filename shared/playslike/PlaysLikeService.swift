import Foundation

public struct ElevationProviderData {
    public let elevationM: Double
    public let ttlSeconds: Int
    public let etag: String?

    public init(elevationM: Double, ttlSeconds: Int, etag: String?) {
        self.elevationM = elevationM
        self.ttlSeconds = max(0, ttlSeconds)
        self.etag = etag
    }
}

public struct WindProviderData {
    public let speedMps: Double
    public let dirFromDeg: Double
    public let wParallel: Double?
    public let wPerp: Double?
    public let ttlSeconds: Int
    public let etag: String?

    public init(speedMps: Double, dirFromDeg: Double, wParallel: Double?, wPerp: Double?, ttlSeconds: Int, etag: String?) {
        self.speedMps = speedMps
        self.dirFromDeg = dirFromDeg
        self.wParallel = wParallel
        self.wPerp = wPerp
        self.ttlSeconds = max(0, ttlSeconds)
        self.etag = etag
    }
}

public enum PlaysLikeQuality: String {
    case good
    case warn
    case low
}

public struct PlaysLikeComponents {
    public let slopeM: Double
    public let windM: Double
    public let tempM: Double
    public let altM: Double
}

public struct PlaysLikeResult {
    public let distanceEff: Double
    public let components: PlaysLikeComponents
    public let quality: PlaysLikeQuality
}

public struct PlaysLikeOptions {
    public let kS: Double
    public let kHW: Double
    public let warnThresholdRatio: Double
    public let lowThresholdRatio: Double
    public let config: PlaysLikeConfig?
    public let temperatureC: Double?
    public let altitudeAslM: Double?

    public init(
        kS: Double = 1.0,
        kHW: Double = 2.5,
        warnThresholdRatio: Double = 0.05,
        lowThresholdRatio: Double = 0.12,
        config: PlaysLikeConfig? = nil,
        temperatureC: Double? = nil,
        altitudeAslM: Double? = nil
    ) {
        self.kS = max(0.2, min(kS, 3.0))
        self.kHW = max(0.5, min(kHW, 6.0))
        self.warnThresholdRatio = warnThresholdRatio
        self.lowThresholdRatio = max(lowThresholdRatio, warnThresholdRatio)
        self.config = config
        self.temperatureC = temperatureC
        self.altitudeAslM = altitudeAslM
    }
}

public struct PlaysLikeConfig {
    public var windModel: String
    public var alphaHeadPerMph: Double
    public var alphaTailPerMph: Double
    public var slopeFactor: Double
    public var windCapPctOfD: Double
    public var taperStartMph: Double
    public var sidewindDistanceAdjust: Bool
    public var temperatureEnabled: Bool
    public var betaTempPerC: Double
    public var altitudeEnabled: Bool
    public var gammaAltPer100m: Double

    public init(
        windModel: String = "percent_v1",
        alphaHeadPerMph: Double = 0.01,
        alphaTailPerMph: Double = 0.005,
        slopeFactor: Double = 1.0,
        windCapPctOfD: Double = 0.20,
        taperStartMph: Double = 20,
        sidewindDistanceAdjust: Bool = false,
        temperatureEnabled: Bool = false,
        betaTempPerC: Double = 0.0018,
        altitudeEnabled: Bool = false,
        gammaAltPer100m: Double = 0.0065
    ) {
        self.windModel = windModel
        self.alphaHeadPerMph = alphaHeadPerMph
        self.alphaTailPerMph = alphaTailPerMph
        self.slopeFactor = slopeFactor
        self.windCapPctOfD = windCapPctOfD
        self.taperStartMph = taperStartMph
        self.sidewindDistanceAdjust = sidewindDistanceAdjust
        self.temperatureEnabled = temperatureEnabled
        self.betaTempPerC = betaTempPerC
        self.altitudeEnabled = altitudeEnabled
        self.gammaAltPer100m = gammaAltPer100m
    }

    public static let `default` = PlaysLikeConfig()
}

public enum PlaysLikeService {
    private struct ElevationCacheValue {
        var elevationM: Double
        var ttlSeconds: Int
    }

    private struct WindCacheValue {
        var speedMps: Double
        var dirFromDeg: Double
        var wParallel: Double?
        var wPerp: Double?
        var ttlSeconds: Int
    }

    private struct CacheEntry<T> {
        var value: T
        var etag: String?
        var expiresAt: Date
    }

    private static var baseURLString: String?
    private static let cacheQueue = DispatchQueue(label: "com.golfiq.playslike.providers", attributes: .concurrent)
    private static var elevationCache: [String: CacheEntry<ElevationCacheValue>] = [:]
    private static var windCache: [String: CacheEntry<WindCacheValue>] = [:]
    private static let mpsToMph: Double = 2.237
    private static let mphToMps: Double = 1.0 / 2.237

    public static func setProvidersBaseURL(_ url: URL?) {
        baseURLString = url.map { sanitizeBaseURL($0) }
    }

    public static func getProvidersBaseURL() -> URL? {
        guard let base = baseURLString else { return nil }
        return URL(string: base)
    }

    public static func fetchElevation(lat: Double, lon: Double) async throws -> ElevationProviderData {
        guard let base = baseURLString else {
            return ElevationProviderData(elevationM: 0, ttlSeconds: 0, etag: nil)
        }
        let key = cacheKey(lat: lat, lon: lon)
        let now = Date()
        let cachedEntry = readElevationCache(key: key)
        if let cached = cachedEntry, cached.expiresAt > now {
            return ElevationProviderData(
                elevationM: cached.value.elevationM,
                ttlSeconds: cached.value.ttlSeconds,
                etag: cached.etag
            )
        }

        guard let url = buildURL(base: base, path: "/providers/elevation", queryItems: [
            URLQueryItem(name: "lat", value: formatCoord(lat)),
            URLQueryItem(name: "lon", value: formatCoord(lon)),
        ]) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if let etag = cachedEntry?.etag {
            request.addValue(etag, forHTTPHeaderField: "If-None-Match")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        if http.statusCode == 304 {
            guard var entry = cachedEntry ?? readElevationCache(key: key) else {
                throw URLError(.badServerResponse)
            }
            let ttl = parseMaxAge(http.value(forHTTPHeaderField: "Cache-Control")) ?? entry.value.ttlSeconds
            entry.value.ttlSeconds = max(0, ttl)
            if let header = stripWeakEtag(http.value(forHTTPHeaderField: "ETag")) {
                entry.etag = header
            }
            entry.expiresAt = now.addingTimeInterval(TimeInterval(entry.value.ttlSeconds))
            writeElevationCache(key: key, entry: entry)
            return ElevationProviderData(
                elevationM: entry.value.elevationM,
                ttlSeconds: entry.value.ttlSeconds,
                etag: entry.etag
            )
        }

        guard (200 ... 299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let jsonObject = try JSONSerialization.jsonObject(with: data, options: [])
        guard let json = jsonObject as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }

        let ttl = max(0, (json["ttl_s"] as? Int) ?? parseMaxAge(http.value(forHTTPHeaderField: "Cache-Control")) ?? 0)
        let etag = (json["etag"] as? String) ?? stripWeakEtag(http.value(forHTTPHeaderField: "ETag"))
        let elevation = (json["elevation_m"] as? NSNumber)?.doubleValue ?? 0
        let value = ElevationCacheValue(elevationM: elevation, ttlSeconds: ttl)
        let entry = CacheEntry(value: value, etag: etag, expiresAt: now.addingTimeInterval(TimeInterval(ttl)))
        writeElevationCache(key: key, entry: entry)
        return ElevationProviderData(elevationM: elevation, ttlSeconds: ttl, etag: etag)
    }

    public static func fetchWind(lat: Double, lon: Double, bearing: Double? = nil) async throws -> WindProviderData {
        guard let base = baseURLString else {
            return WindProviderData(speedMps: 0, dirFromDeg: 0, wParallel: 0, wPerp: 0, ttlSeconds: 0, etag: nil)
        }
        var key = cacheKey(lat: lat, lon: lon)
        if let bearing = bearing {
            key += String(format: "@%.2f", bearing)
        }
        let now = Date()
        let cachedEntry = readWindCache(key: key)
        if let cached = cachedEntry, cached.expiresAt > now {
            return WindProviderData(
                speedMps: cached.value.speedMps,
                dirFromDeg: cached.value.dirFromDeg,
                wParallel: cached.value.wParallel,
                wPerp: cached.value.wPerp,
                ttlSeconds: cached.value.ttlSeconds,
                etag: cached.etag
            )
        }

        var items = [
            URLQueryItem(name: "lat", value: formatCoord(lat)),
            URLQueryItem(name: "lon", value: formatCoord(lon)),
        ]
        if let bearing = bearing {
            items.append(URLQueryItem(name: "bearing", value: String(format: "%.2f", bearing)))
        }

        guard let url = buildURL(base: base, path: "/providers/wind", queryItems: items) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if let etag = cachedEntry?.etag {
            request.addValue(etag, forHTTPHeaderField: "If-None-Match")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        if http.statusCode == 304 {
            guard var entry = cachedEntry ?? readWindCache(key: key) else {
                throw URLError(.badServerResponse)
            }
            let ttl = parseMaxAge(http.value(forHTTPHeaderField: "Cache-Control")) ?? entry.value.ttlSeconds
            entry.value.ttlSeconds = max(0, ttl)
            if let header = stripWeakEtag(http.value(forHTTPHeaderField: "ETag")) {
                entry.etag = header
            }
            entry.expiresAt = now.addingTimeInterval(TimeInterval(entry.value.ttlSeconds))
            writeWindCache(key: key, entry: entry)
            return WindProviderData(
                speedMps: entry.value.speedMps,
                dirFromDeg: entry.value.dirFromDeg,
                wParallel: entry.value.wParallel,
                wPerp: entry.value.wPerp,
                ttlSeconds: entry.value.ttlSeconds,
                etag: entry.etag
            )
        }

        guard (200 ... 299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let jsonObject = try JSONSerialization.jsonObject(with: data, options: [])
        guard let json = jsonObject as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }

        let ttl = max(0, (json["ttl_s"] as? Int) ?? parseMaxAge(http.value(forHTTPHeaderField: "Cache-Control")) ?? 0)
        let etag = (json["etag"] as? String) ?? stripWeakEtag(http.value(forHTTPHeaderField: "ETag"))
        let speed = (json["speed_mps"] as? NSNumber)?.doubleValue ?? 0
        let direction = (json["dir_from_deg"] as? NSNumber)?.doubleValue ?? 0
        let parallel = (json["w_parallel"] is NSNull) ? nil : (json["w_parallel"] as? NSNumber)?.doubleValue
        let perp = (json["w_perp"] is NSNull) ? nil : (json["w_perp"] as? NSNumber)?.doubleValue
        let value = WindCacheValue(
            speedMps: speed,
            dirFromDeg: direction,
            wParallel: parallel,
            wPerp: perp,
            ttlSeconds: ttl
        )
        let entry = CacheEntry(value: value, etag: etag, expiresAt: now.addingTimeInterval(TimeInterval(ttl)))
        writeWindCache(key: key, entry: entry)
        return WindProviderData(
            speedMps: speed,
            dirFromDeg: direction,
            wParallel: parallel,
            wPerp: perp,
            ttlSeconds: ttl,
            etag: etag
        )
    }

    private static func sanitizeBaseURL(_ url: URL) -> String {
        var absolute = url.absoluteString
        while absolute.count > 1, absolute.hasSuffix("/") {
            absolute.removeLast()
        }
        return absolute
    }

    private static func cacheKey(lat: Double, lon: Double) -> String {
        String(format: "%.5f,%.5f", lat, lon)
    }

    private static func formatCoord(_ value: Double) -> String {
        String(format: "%.5f", value)
    }

    private static func buildURL(base: String, path: String, queryItems: [URLQueryItem]) -> URL? {
        guard let baseURL = URL(string: base) else { return nil }
        let resolved = URL(string: path, relativeTo: baseURL) ?? baseURL
        guard var components = URLComponents(url: resolved, resolvingAgainstBaseURL: true) else { return nil }
        components.queryItems = queryItems
        return components.url
    }

    private static func parseMaxAge(_ header: String?) -> Int? {
        guard let header = header, !header.isEmpty else { return nil }
        for token in header.split(separator: ",") {
            let trimmed = token.trimmingCharacters(in: .whitespaces)
            if trimmed.lowercased().hasPrefix("max-age=") {
                let value = String(trimmed.dropFirst(8))
                if let parsed = Int(value), parsed >= 0 {
                    return parsed
                }
            }
        }
        return nil
    }

    private static func stripWeakEtag(_ value: String?) -> String? {
        guard var candidate = value?.trimmingCharacters(in: .whitespacesAndNewlines), !candidate.isEmpty else {
            return nil
        }
        if candidate.uppercased().hasPrefix("W/") {
            candidate = String(candidate.dropFirst(2)).trimmingCharacters(in: .whitespaces)
        }
        return candidate.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
    }

    private static func readElevationCache(key: String) -> CacheEntry<ElevationCacheValue>? {
        var entry: CacheEntry<ElevationCacheValue>?
        cacheQueue.sync {
            entry = elevationCache[key]
        }
        if let entry = entry, entry.expiresAt <= Date() {
            cacheQueue.async(flags: .barrier) {
                elevationCache.removeValue(forKey: key)
            }
            return nil
        }
        return entry
    }

    private static func writeElevationCache(key: String, entry: CacheEntry<ElevationCacheValue>) {
        cacheQueue.async(flags: .barrier) {
            elevationCache[key] = entry
        }
    }

    private static func readWindCache(key: String) -> CacheEntry<WindCacheValue>? {
        var entry: CacheEntry<WindCacheValue>?
        cacheQueue.sync {
            entry = windCache[key]
        }
        if let entry = entry, entry.expiresAt <= Date() {
            cacheQueue.async(flags: .barrier) {
                windCache.removeValue(forKey: key)
            }
            return nil
        }
        return entry
    }

    private static func writeWindCache(key: String, entry: CacheEntry<WindCacheValue>) {
        cacheQueue.async(flags: .barrier) {
            windCache[key] = entry
        }
    }

    public static func mpsToMph(_ value: Double) -> Double {
        return value * mpsToMph
    }

    public static func mphToMps(_ value: Double) -> Double {
        return value * mphToMps
    }

    private static func sanitizeDistance(_ value: Double) -> Double {
        guard value.isFinite, value > 0 else { return 0 }
        return value
    }

    private static func round(_ value: Double, decimals: Int) -> Double {
        guard value.isFinite else { return 0 }
        let factor = pow(10.0, Double(max(0, decimals)))
        return (value * factor).rounded() / factor
    }

    public static func computeSlopeAdjust(
        D: Double,
        deltaH: Double,
        kS slopeFactor: Double = 1.0
    ) -> Double {
        guard D.isFinite, D > 0, deltaH.isFinite else { return 0 }
        let clamped = max(0.2, min(slopeFactor, 3.0))
        return deltaH * clamped
    }

    public static func computeWindAdjust(D: Double, wParallel: Double, kHW: Double = 2.5) -> Double {
        guard D.isFinite, D > 0, wParallel.isFinite else { return 0 }
        let clamped = max(0.5, min(kHW, 6.0))
        return wParallel * clamped
    }

    public static func computeWindAdjustPercentV1(
        D: Double,
        wParallel: Double,
        config: PlaysLikeConfig = .default
    ) -> Double {
        let distance = sanitizeDistance(D)
        guard distance > 0, wParallel.isFinite, wParallel != 0 else { return 0 }
        let windMph = abs(wParallel) * mpsToMph
        guard windMph > 0 else { return 0 }
        let taperStart = max(config.taperStartMph, 0)
        let isHeadwind = wParallel >= 0
        let alpha = max(isHeadwind ? config.alphaHeadPerMph : config.alphaTailPerMph, 0)
        let below = min(windMph, taperStart) * alpha
        let above = max(windMph - taperStart, 0) * alpha * 0.8
        var pct = below + above
        if !isHeadwind {
            pct = -pct
        }
        let cap = max(config.windCapPctOfD, 0)
        pct = max(-cap, min(pct, cap))
        return distance * pct
    }

    public static func computeTempAdjust(
        D: Double,
        temperatureC: Double,
        beta: Double = 0.0018
    ) -> Double {
        let distance = sanitizeDistance(D)
        guard distance > 0, temperatureC.isFinite else { return 0 }
        let betaEffective = beta.isFinite ? beta : 0.0018
        let delta = distance * betaEffective * (20 - temperatureC)
        let cap = distance * 0.05
        return max(-cap, min(delta, cap))
    }

    public static func computeAltitudeAdjust(
        D: Double,
        altitudeAslM: Double,
        gammaPer100m: Double = 0.0065
    ) -> Double {
        let distance = sanitizeDistance(D)
        guard distance > 0, altitudeAslM.isFinite else { return 0 }
        let gamma = gammaPer100m.isFinite ? gammaPer100m : 0.0065
        let delta = distance * gamma * (altitudeAslM / 100)
        let cap = distance * 0.15
        return max(-cap, min(delta, cap))
    }

    private static func computeQuality(distance: Double, deltaH: Double, wParallel: Double) -> PlaysLikeQuality {
        guard distance > 0 else { return .low }
        let hasSlope = deltaH.isFinite
        let hasWind = wParallel.isFinite
        if !hasSlope && !hasWind { return .low }
        let windMph = hasWind ? abs(wParallel) * mpsToMph : 0
        if (hasSlope && abs(deltaH) > 15) || windMph > 12 {
            return .warn
        }
        return .good
    }

    public static func computePlaysLike(
        D: Double,
        deltaH: Double,
        wParallel: Double,
        temperatureC: Double? = nil,
        altitudeAslM: Double? = nil,
        cfg: PlaysLikeConfig = .default
    ) -> PlaysLikeResult {
        let distance = sanitizeDistance(D)
        let slope = computeSlopeAdjust(D: distance, deltaH: deltaH, kS: cfg.slopeFactor)
        let wind: Double
        if cfg.windModel == "percent_v1" {
            wind = computeWindAdjustPercentV1(D: distance, wParallel: wParallel, config: cfg)
        } else {
            wind = 0
        }
        let tempAdjust: Double
        if cfg.temperatureEnabled, let temp = temperatureC, temp.isFinite {
            tempAdjust = computeTempAdjust(D: distance, temperatureC: temp, beta: cfg.betaTempPerC)
        } else {
            tempAdjust = 0
        }
        let altAdjust: Double
        if cfg.altitudeEnabled, let altitude = altitudeAslM, altitude.isFinite {
            altAdjust = computeAltitudeAdjust(D: distance, altitudeAslM: altitude, gammaPer100m: cfg.gammaAltPer100m)
        } else {
            altAdjust = 0
        }
        let eff = distance + slope + wind + tempAdjust + altAdjust
        let quality = computeQuality(distance: distance, deltaH: deltaH, wParallel: wParallel)
        return PlaysLikeResult(
            distanceEff: round(eff, decimals: 1),
            components: PlaysLikeComponents(
                slopeM: round(slope, decimals: 1),
                windM: round(wind, decimals: 1),
                tempM: round(tempAdjust, decimals: 1),
                altM: round(altAdjust, decimals: 1)
            ),
            quality: quality
        )
    }

    public static func compute(D: Double, deltaH: Double, wParallel: Double, opts: PlaysLikeOptions = PlaysLikeOptions()) -> PlaysLikeResult {
        var overrides = opts.config ?? PlaysLikeConfig.default
        overrides.slopeFactor = opts.kS
        let result = computePlaysLike(
            D: D,
            deltaH: deltaH,
            wParallel: wParallel,
            temperatureC: opts.temperatureC,
            altitudeAslM: opts.altitudeAslM,
            cfg: overrides
        )
        let distance = sanitizeDistance(D)
        let total =
            abs(result.components.slopeM) +
            abs(result.components.windM) +
            abs(result.components.tempM) +
            abs(result.components.altM)
        let ratio = distance > 0 ? total / distance : Double.infinity
        if opts.warnThresholdRatio != 0.05 || opts.lowThresholdRatio != 0.12 {
            let warn = opts.warnThresholdRatio
            let low = opts.lowThresholdRatio
            let quality: PlaysLikeQuality
            if !ratio.isFinite {
                quality = .low
            } else if ratio <= warn {
                quality = .good
            } else if ratio <= low {
                quality = .warn
            } else {
                quality = .low
            }
            return PlaysLikeResult(
                distanceEff: result.distanceEff,
                components: result.components,
                quality: quality
            )
        }
        return result
    }
}
