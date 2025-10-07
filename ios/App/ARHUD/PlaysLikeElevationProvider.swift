import Foundation

final class PlaysLikeElevationProvider {
    typealias DEMClient = (_ latitude: Double, _ longitude: Double) -> Double?

    private struct TileKey: Hashable {
        let latBucket: Int
        let lonBucket: Int
    }

    private let demClient: DEMClient?
    private var cache: [TileKey: Double] = [:]
    private var barometerDelta: Double = 0

    init(demClient: DEMClient? = nil) {
        self.demClient = demClient
    }

    func updateBarometerDelta(_ delta: Double?) {
        barometerDelta = delta ?? 0
    }

    func elevationMeters(latitude: Double, longitude: Double, fallback: Double?) -> Double {
        let key = tileKey(latitude: latitude, longitude: longitude)
        let base: Double
        if let cached = cache[key] {
            base = cached
        } else if let sample = demClient?(latitude, longitude) {
            cache[key] = sample
            base = sample
        } else if let fallback = fallback {
            cache[key] = fallback
            base = fallback
        } else {
            cache[key] = 0
            base = 0
        }
        return base + barometerDelta
    }

    func clearCache() {
        cache.removeAll()
    }

    private func tileKey(latitude: Double, longitude: Double) -> TileKey {
        let scale = 100.0
        return TileKey(
            latBucket: Int((latitude * scale).rounded()),
            lonBucket: Int((longitude * scale).rounded())
        )
    }
}
