import Foundation
import CoreLocation

struct HolePoint: Codable, Equatable {
  let lat: Double
  let lon: Double

  var coordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: lat, longitude: lon)
  }
}

struct HoleBoundingBox: Codable, Equatable {
  let minLat: Double
  let minLon: Double
  let maxLat: Double
  let maxLon: Double
}

typealias HolePolygon = [HolePoint]

struct HoleModel: Codable, Equatable, Identifiable {
  let id: String
  let bbox: HoleBoundingBox
  let fairways: [HolePolygon]
  let greens: [HolePolygon]
  let bunkers: [HolePolygon]
  let pin: HolePoint?
}

final class HoleModelStore: ObservableObject {
  @Published private(set) var model: HoleModel?

  func apply(json: String) {
    guard let data = json.data(using: .utf8) else { return }
    do {
      let decoded = try JSONDecoder().decode(HoleModel.self, from: data)
      DispatchQueue.main.async {
        self.model = decoded
      }
    } catch {
      NSLog("[WatchBridge] Failed to decode hole model: %@", error.localizedDescription)
    }
  }
}
