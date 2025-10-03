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
    }

    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func load(courseId: String, completion: @escaping (Result<ARHUDCourseBundle, Error>) -> Void) {
        var requestURL = baseURL
        if requestURL.lastPathComponent != "course" {
            requestURL.appendPathComponent("course")
        }
        requestURL.appendPathComponent(courseId)

        var request = URLRequest(url: requestURL)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadRevalidatingCacheData

        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(LoaderError.transport(error)))
                return
            }

            guard
                let httpResponse = response as? HTTPURLResponse,
                200..<300 ~= httpResponse.statusCode,
                let data = data
            else {
                completion(.failure(LoaderError.unexpectedResponse))
                return
            }

            do {
                let decoder = JSONDecoder()
                decoder.keyDecodingStrategy = .convertFromSnakeCase
                let bundle = try decoder.decode(ARHUDCourseBundle.self, from: data)
                completion(.success(bundle))
            } catch {
                completion(.failure(LoaderError.decoding(error)))
            }
        }

        task.resume()
    }
}
