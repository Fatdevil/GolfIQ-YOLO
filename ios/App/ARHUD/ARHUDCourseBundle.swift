import Foundation
import CoreLocation

struct ARHUDCourseCoordinate: Codable {
    let latitude: Double
    let longitude: Double

    var location: CLLocation {
        CLLocation(latitude: latitude, longitude: longitude)
    }
}

struct ARHUDCourseBundle: Codable {
    let id: String
    let name: String
    let pin: ARHUDCourseCoordinate
    let greenFront: ARHUDCourseCoordinate
    let greenCenter: ARHUDCourseCoordinate
    let greenBack: ARHUDCourseCoordinate

    func distances(from location: CLLocation) -> ARHUDGreenDistances {
        let front = location.distance(from: greenFront.location)
        let center = location.distance(from: greenCenter.location)
        let back = location.distance(from: greenBack.location)
        return ARHUDGreenDistances(front: front, center: center, back: back)
    }
}

struct ARHUDGreenDistances {
    let front: CLLocationDistance
    let center: CLLocationDistance
    let back: CLLocationDistance

    func formattedYards() -> (front: String, center: String, back: String) {
        func yardsString(from meters: CLLocationDistance) -> String {
            let yards = meters * 1.09361
            return String(format: "%.0f yd", yards)
        }

        return (yardsString(from: front), yardsString(from: center), yardsString(from: back))
    }
}

final class ARHUDCourseBundleLoader {
    enum LoaderError: Error {
        case transport(Error)
        case decoding(Error)
        case unexpectedResponse
        case noCachedData
    }

    private let baseURL: URL
    private let session: URLSession
    private let telemetry: TelemetryClient

    init(baseURL: URL, telemetry: TelemetryClient, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.telemetry = telemetry
    }

    func load(
        courseId: String,
        forceRefresh: Bool = false,
        completion: @escaping (Result<ARHUDCourseBundle, Error>) -> Void
    ) {
        var requestURL = baseURL
        if requestURL.lastPathComponent != "course" {
            requestURL.appendPathComponent("course")
        }
        requestURL.appendPathComponent(courseId)

        let cache = RemoteBundleCache(courseId: courseId)
        let metadata = cache.metadata
        let cachedData = cache.cachedData()
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        var deliveredCached = false
        var cachedBundle: ARHUDCourseBundle?
        if let cachedData, let bundle = try? decoder.decode(ARHUDCourseBundle.self, from: cachedData) {
            cachedBundle = bundle
            completion(.success(bundle))
            deliveredCached = true
        }

        if !forceRefresh,
           let metadata,
           metadata.isFresh(),
           let cachedBundle {
            let age = cache.ageInDays()
            telemetry.logBundleRefresh(status: "304", etag: metadata.etag, ageDays: age)
            return
        }

        if forceRefresh {
            performGet(
                url: requestURL,
                cache: cache,
                decoder: decoder,
                ifNoneMatch: nil,
                cacheControlTTL: nil,
                deliveredCached: deliveredCached,
                completion: completion
            )
            return
        }

        performHead(
            url: requestURL,
            cache: cache,
            decoder: decoder,
            deliveredCached: deliveredCached,
            completion: completion
        )
    }

    private func performHead(
        url: URL,
        cache: RemoteBundleCache,
        decoder: JSONDecoder,
        deliveredCached: Bool,
        completion: @escaping (Result<ARHUDCourseBundle, Error>) -> Void
    ) {
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let etag = cache.metadata?.etag {
            request.setValue(etag, forHTTPHeaderField: "If-None-Match")
        }

        let task = session.dataTask(with: request) { [weak self] _, response, error in
            guard let self else { return }

            if let error = error {
                self.handleOffline(
                    cache: cache,
                    decoder: decoder,
                    deliveredCached: deliveredCached,
                    completion: completion,
                    underlying: error
                )
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                self.handleOffline(
                    cache: cache,
                    decoder: decoder,
                    deliveredCached: deliveredCached,
                    completion: completion,
                    underlying: nil
                )
                return
            }

            let ttl = Self.parseTTL(from: httpResponse.value(forHTTPHeaderField: "Cache-Control"))
            switch httpResponse.statusCode {
            case 304:
                cache.updateMetadata(etag: cache.metadata?.etag, ttl: ttl)
                let age = cache.ageInDays()
                self.telemetry.logBundleRefresh(status: "304", etag: cache.metadata?.etag, ageDays: age)
                if !deliveredCached {
                    self.deliverCached(cache: cache, decoder: decoder, completion: completion)
                }
            case 200:
                let etag = httpResponse.value(forHTTPHeaderField: "ETag")
                self.performGet(
                    url: url,
                    cache: cache,
                    decoder: decoder,
                    ifNoneMatch: etag ?? cache.metadata?.etag,
                    cacheControlTTL: ttl,
                    deliveredCached: deliveredCached,
                    completion: completion
                )
            default:
                self.handleOffline(
                    cache: cache,
                    decoder: decoder,
                    deliveredCached: deliveredCached,
                    completion: completion,
                    underlying: nil
                )
            }
        }

        task.resume()
    }

    private func performGet(
        url: URL,
        cache: RemoteBundleCache,
        decoder: JSONDecoder,
        ifNoneMatch: String?,
        cacheControlTTL: TimeInterval?,
        deliveredCached: Bool,
        completion: @escaping (Result<ARHUDCourseBundle, Error>) -> Void
    ) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadRevalidatingCacheData
        if let ifNoneMatch = ifNoneMatch {
            request.setValue(ifNoneMatch, forHTTPHeaderField: "If-None-Match")
        }

        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }

            if let error = error {
                self.handleOffline(
                    cache: cache,
                    decoder: decoder,
                    deliveredCached: deliveredCached,
                    completion: completion,
                    underlying: error
                )
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                self.handleOffline(
                    cache: cache,
                    decoder: decoder,
                    deliveredCached: deliveredCached,
                    completion: completion,
                    underlying: nil
                )
                return
            }

            let ttl = cacheControlTTL ?? Self.parseTTL(from: httpResponse.value(forHTTPHeaderField: "Cache-Control"))
            switch httpResponse.statusCode {
            case 304:
                cache.updateMetadata(etag: cache.metadata?.etag, ttl: ttl)
                let age = cache.ageInDays()
                self.telemetry.logBundleRefresh(status: "304", etag: cache.metadata?.etag, ageDays: age)
                if !deliveredCached {
                    self.deliverCached(cache: cache, decoder: decoder, completion: completion)
                }
            case 200:
                guard let data else {
                    completion(.failure(LoaderError.unexpectedResponse))
                    return
                }

                do {
                    let bundle = try decoder.decode(ARHUDCourseBundle.self, from: data)
                    cache.save(data: data, etag: httpResponse.value(forHTTPHeaderField: "ETag"), ttl: ttl)
                    self.telemetry.logBundleRefresh(status: "200", etag: httpResponse.value(forHTTPHeaderField: "ETag"), ageDays: 0)
                    completion(.success(bundle))
                } catch {
                    completion(.failure(LoaderError.decoding(error)))
                }
            default:
                self.handleOffline(
                    cache: cache,
                    decoder: decoder,
                    deliveredCached: deliveredCached,
                    completion: completion,
                    underlying: nil
                )
            }
        }

        task.resume()
    }

    private func handleOffline(
        cache: RemoteBundleCache,
        decoder: JSONDecoder,
        deliveredCached: Bool,
        completion: @escaping (Result<ARHUDCourseBundle, Error>) -> Void,
        underlying: Error?
    ) {
        let age = cache.ageInDays()
        self.telemetry.logBundleRefresh(status: "offline", etag: cache.metadata?.etag, ageDays: age)
        if deliveredCached == false &&
            deliverCached(cache: cache, decoder: decoder, completion: completion) == false {
            if let underlying {
                completion(.failure(LoaderError.transport(underlying)))
            } else {
                completion(.failure(LoaderError.noCachedData))
            }
        }
    }

    @discardableResult
    private func deliverCached(
        cache: RemoteBundleCache,
        decoder: JSONDecoder,
        completion: @escaping (Result<ARHUDCourseBundle, Error>) -> Void
    ) -> Bool {
        guard let data = cache.cachedData() else { return false }
        do {
            let bundle = try decoder.decode(ARHUDCourseBundle.self, from: data)
            completion(.success(bundle))
            return true
        } catch {
            completion(.failure(LoaderError.decoding(error)))
            return false
        }
    }

    private static func parseTTL(from cacheControl: String?) -> TimeInterval? {
        guard let cacheControl else { return nil }
        let directives = cacheControl.split(separator: ",")
        for directive in directives {
            let trimmed = directive.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("max-age") {
                let parts = trimmed.split(separator: "=")
                if parts.count == 2, let value = TimeInterval(parts[1]) {
                    return value
                }
            }
        }
        return nil
    }
}
