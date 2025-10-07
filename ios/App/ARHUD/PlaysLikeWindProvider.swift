import Foundation

final class PlaysLikeWindProvider {
    struct WindSample {
        let speed: Double
        let directionDegrees: Double
    }

    typealias WeatherClient = (_ latitude: Double, _ longitude: Double) -> WindSample?

    private let client: WeatherClient?

    init(client: WeatherClient? = nil) {
        self.client = client
    }

    func current(latitude: Double, longitude: Double, bearingDegrees: Double?) -> (speed: Double, directionDegrees: Double, parallel: Double) {
        let sample = client?(latitude, longitude) ?? WindSample(speed: 0, directionDegrees: 0)
        guard let bearing = bearingDegrees else {
            return (sample.speed, sample.directionDegrees, 0)
        }
        let parallel = computeParallel(sample: sample, bearingDegrees: bearing)
        return (sample.speed, sample.directionDegrees, parallel)
    }

    private func computeParallel(sample: WindSample, bearingDegrees: Double) -> Double {
        let normalizedDir = fmod(fmod(sample.directionDegrees, 360) + 360, 360)
        let normalizedBearing = fmod(fmod(bearingDegrees, 360) + 360, 360)
        let diff = (normalizedDir - normalizedBearing) * Double.pi / 180
        return sample.speed * cos(diff)
    }
}
