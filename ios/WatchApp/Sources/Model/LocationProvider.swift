import CoreLocation
import Combine

final class LocationProvider: NSObject, ObservableObject {
  @Published private(set) var latestLocation: HolePoint?
  private let manager = CLLocationManager()

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    manager.distanceFilter = 5
    manager.requestWhenInUseAuthorization()
    manager.startUpdatingLocation()
  }
}

extension LocationProvider: CLLocationManagerDelegate {
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let coordinate = locations.last?.coordinate else { return }
    latestLocation = HolePoint(lat: coordinate.latitude, lon: coordinate.longitude)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    NSLog("[LocationProvider] location error: %@", error.localizedDescription)
  }
}
