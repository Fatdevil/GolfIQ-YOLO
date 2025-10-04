import Foundation

struct RemoteBundleCacheMetadata: Codable {
    let etag: String?
    let fetchedAt: Date
    let ttl: TimeInterval?

    func isFresh(now: Date = Date()) -> Bool {
        guard let ttl, ttl > 0 else { return false }
        return fetchedAt.addingTimeInterval(ttl) > now
    }
}

final class RemoteBundleCache {
    private let courseId: String
    private let fileManager: FileManager
    private let directoryURL: URL
    private let dataURL: URL
    private let metadataURL: URL
    private let queue = DispatchQueue(label: "com.golfiq.arhud.bundlecache")

    init(courseId: String, fileManager: FileManager = .default) {
        self.courseId = courseId
        self.fileManager = fileManager
        let baseDirectory = (try? fileManager.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? URL(fileURLWithPath: NSTemporaryDirectory())
        directoryURL = baseDirectory.appendingPathComponent("arhud_bundles", isDirectory: true)
        dataURL = directoryURL.appendingPathComponent("\(courseId).json")
        metadataURL = directoryURL.appendingPathComponent("\(courseId).meta")
        ensureDirectoryExists()
    }

    var metadata: RemoteBundleCacheMetadata? {
        queue.sync {
            guard fileManager.fileExists(atPath: metadataURL.path) else { return nil }
            guard let data = try? Data(contentsOf: metadataURL) else { return nil }
            let decoder = JSONDecoder()
            return try? decoder.decode(RemoteBundleCacheMetadata.self, from: data)
        }
    }

    func cachedData() -> Data? {
        queue.sync {
            guard fileManager.fileExists(atPath: dataURL.path) else { return nil }
            return try? Data(contentsOf: dataURL)
        }
    }

    func save(data: Data, etag: String?, ttl: TimeInterval?, now: Date = Date()) {
        queue.async {
            do {
                try data.write(to: self.dataURL, options: .atomic)
                let metadata = RemoteBundleCacheMetadata(etag: etag, fetchedAt: now, ttl: ttl)
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted]
                let metadataData = try encoder.encode(metadata)
                try metadataData.write(to: self.metadataURL, options: .atomic)
            } catch {
                // Best-effort cache persistence; ignore failures.
            }
        }
    }

    func updateMetadata(etag: String?, ttl: TimeInterval?, now: Date = Date()) {
        let existing = metadata
        queue.async {
            let metadata = RemoteBundleCacheMetadata(
                etag: etag ?? existing?.etag,
                fetchedAt: now,
                ttl: ttl ?? existing?.ttl
            )
            self.persist(metadata: metadata)
        }
    }

    func ageInDays(referenceDate: Date = Date()) -> Int {
        guard let fetchedAt = metadata?.fetchedAt else { return 0 }
        let interval = referenceDate.timeIntervalSince(fetchedAt)
        return max(0, Int(interval / 86_400))
    }

    private func ensureDirectoryExists() {
        queue.async {
            if !self.fileManager.fileExists(atPath: self.directoryURL.path) {
                try? self.fileManager.createDirectory(at: self.directoryURL, withIntermediateDirectories: true)
            }
        }
    }

    private func persist(metadata: RemoteBundleCacheMetadata) {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted]
            let data = try encoder.encode(metadata)
            try data.write(to: metadataURL, options: .atomic)
        } catch {
            // Ignore persistence errors; cache is best-effort.
        }
    }
}
