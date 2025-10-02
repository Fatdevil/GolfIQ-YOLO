import Foundation

struct BenchmarkResult: Codable {
    let modelIdentifier: String
    let runIdentifier: String
    let timestamp: Date
    let framesProcessed: Int
    let warmupFrames: Int
    let fpsAverage: Double
    let fpsMin: Double
    let fpsMax: Double
    let latencyP50Ms: Double
    let latencyP95Ms: Double
    let coldStartMs: Double
    let modelFileSizeMB: Double
    let batteryDrop15MinPct: Double?
    let thermalState: String
    let deviceModel: String
    let osVersion: String
    let backend: String
    let telemetryEndpoint: URL?

    enum CodingKeys: String, CodingKey {
        case modelIdentifier = "model_id"
        case runIdentifier = "run_id"
        case timestamp
        case framesProcessed = "frames_processed"
        case warmupFrames = "warmup_frames"
        case fpsAverage = "fps_avg"
        case fpsMin = "fps_min"
        case fpsMax = "fps_max"
        case latencyP50Ms = "latency_p50_ms"
        case latencyP95Ms = "latency_p95_ms"
        case coldStartMs = "cold_start_ms"
        case modelFileSizeMB = "model_file_mb"
        case batteryDrop15MinPct = "battery_drop_pct_15m"
        case thermalState = "thermal_state"
        case deviceModel = "device_model"
        case osVersion = "os_version"
        case backend
        case telemetryEndpoint = "telemetry_post_url"
    }
}

struct TelemetryPayload: Codable {
    let platform: String
    let metrics: BenchmarkResult
}

extension Array where Element == Double {
    func percentile(_ percent: Double) -> Double {
        guard !isEmpty else { return 0 }
        let sortedValues = sorted()
        let position = (percent / 100.0) * Double(sortedValues.count - 1)
        let lower = Int(floor(position))
        let upper = Int(ceil(position))
        if lower == upper {
            return sortedValues[lower]
        }
        let lowerValue = sortedValues[lower]
        let upperValue = sortedValues[upper]
        let weight = position - Double(lower)
        return lowerValue + (upperValue - lowerValue) * weight
    }
}
