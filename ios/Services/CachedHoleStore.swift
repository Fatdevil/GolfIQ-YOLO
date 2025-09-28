import Foundation

final class CachedHoleStore {
    private var cache: [String: CachedHole] = [:]

    func set(_ hole: CachedHole) {
        cache[hole.holeId] = hole
    }

    func get(holeId: String) -> CachedHole? {
        cache[holeId]
    }

    func clearStale(hours: Double) {
        let cutoff = Date().addingTimeInterval(-hours * 3600)
        cache = cache.filter { _, hole in
            guard let date = ISO8601DateFormatter().date(from: hole.lastSyncedAt) else { return true }
            return date >= cutoff
        }
    }
}

struct CachedHole: Codable {
    let holeId: String
    let pinLat: Double
    let pinLon: Double
    let layups: [LayupTarget]
    let lastSyncedAt: String
    let caddieRecommendation: [String: AnyCodable]?
}

struct LayupTarget: Codable {
    let id: String
    let name: String
    let distanceMeters: Double
    let hazardDistanceMeters: Double?
}

struct AnyCodable: Codable {}