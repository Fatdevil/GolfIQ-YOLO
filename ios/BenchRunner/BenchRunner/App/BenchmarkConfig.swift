import Foundation

struct BenchmarkConfig {
    let warmupIterations: Int
    let measurementDuration: TimeInterval
    let extendedDuration: TimeInterval?
    let telemetryURL: URL?
    let runLoopFrameBudget: Int
    let useTFLite: Bool

    init(processInfo: ProcessInfo = .processInfo) {
        let env = processInfo.environment
        warmupIterations = Int(env["BENCH_WARMUP_FRAMES"] ?? "45") ?? 45
        measurementDuration = TimeInterval(Double(env["BENCH_MEASURE_SECONDS"] ?? "60") ?? 60)
        if let extended = env["BENCH_EXTENDED_MINUTES"], let minutes = Double(extended), minutes > 0 {
            extendedDuration = minutes * 60
        } else if env["BENCH_ENABLE_EXTENDED"] == "1" {
            extendedDuration = 15 * 60
        } else {
            extendedDuration = nil
        }
        telemetryURL = URL(string: env["BENCH_TELEMETRY_URL"] ?? "http://localhost:8000/telemetry")
        runLoopFrameBudget = Int(env["BENCH_FRAME_COUNT"] ?? "150") ?? 150
        useTFLite = env["BENCH_USE_TFLITE"] == "1" || processInfo.arguments.contains("--use-tflite")
    }
}
