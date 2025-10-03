import Foundation
import Combine
import CoreML
import Vision
import UIKit

final class BenchmarkRunner: ObservableObject {
    @Published var statusMessage: String = "Idle"
    @Published var latestResult: BenchmarkResult?
    @Published var protectionBannerVisible: Bool = false
    @Published var protectionBannerMessage: String = "Battery/thermal protection: switched to 2D."

    private let config = BenchmarkConfig()
    private let telemetryClient = TelemetryClient()
    private let modelProvider = ModelProvider()
    private lazy var frameProvider = FrameProvider(frameBudget: config.runLoopFrameBudget)
    private let queue = DispatchQueue(label: "com.golfiq.benchrunner")
    private var isRunning = false
    private var statusBeforeMitigation: String?
    private lazy var thermalPolicy: ThermalBatteryPolicy = {
        let policy = ThermalBatteryPolicy { [weak self] sample in
            self?.handlePolicyTelemetry(sample)
        }
        policy.delegate = self
        return policy
    }()

    func start() {
        guard !isRunning else { return }
        isRunning = true
        statusMessage = "Preparing benchmark…"
        statusBeforeMitigation = nil
        protectionBannerVisible = false
        thermalPolicy.start()
        queue.async { [weak self] in
            self?.runBenchmark()
        }
    }

    private func runBenchmark() {
        defer { thermalPolicy.stop() }
        do {
            if config.useTFLite, let tflite = TFLiteRunner() {
                try run(using: tflite)
            } else {
                try runCoreML()
            }
        } catch {
            DispatchQueue.main.async { [weak self] in
                self?.statusMessage = "Benchmark failed: \(error.localizedDescription)"
            }
        }
    }

    private func runCoreML() throws {
        guard !frameProvider.frames.isEmpty else {
            throw NSError(domain: "BenchRunner", code: -1, userInfo: [NSLocalizedDescriptionKey: "No frames available"])
        }
        updateStatus("Loading CoreML model…")
        let coldStartStart = CFAbsoluteTimeGetCurrent()
        let model = try modelProvider.loadModel()
        let vnModel = try VNCoreMLModel(for: model)
        let coldStartEnd = CFAbsoluteTimeGetCurrent()
        let coldStartMs = (coldStartEnd - coldStartStart) * 1000

        let request = VNCoreMLRequest(model: vnModel)
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let batteryStart = device.batteryLevel

        updateStatus("Warming up…")
        try performWarmup(request: request)
        updateStatus("Running measurement loop…")
        let measurement = runLoop(duration: config.measurementDuration, request: request, recordLatencies: true)

        var batteryDrop: Double?
        if let extended = config.extendedDuration {
            updateStatus("Extended run (\(Int(extended/60)) min) in progress…")
            _ = runLoop(duration: extended, request: request, recordLatencies: false)
        }
        let batteryEnd = device.batteryLevel
        if batteryStart >= 0, batteryEnd >= 0, let extended = config.extendedDuration {
            let drop = max(0, (batteryStart - batteryEnd) * 100)
            batteryDrop = extended > 0 ? drop : nil
        }

        let fpsAverage = measurement.frames > 0 && measurement.elapsed > 0 ? Double(measurement.frames) / measurement.elapsed : 0
        let latencyMsValues = measurement.latencies.map { $0 * 1000 }
        let result = BenchmarkResult(
            modelIdentifier: modelProvider.identifier(),
            runIdentifier: UUID().uuidString,
            timestamp: Date(),
            framesProcessed: measurement.frames,
            warmupFrames: config.warmupIterations,
            fpsAverage: fpsAverage,
            fpsMin: measurement.fpsMin,
            fpsMax: measurement.fpsMax,
            latencyP50Ms: latencyMsValues.percentile(50),
            latencyP95Ms: latencyMsValues.percentile(95),
            coldStartMs: coldStartMs,
            modelFileSizeMB: modelProvider.modelFileSizeMB(),
            batteryDrop15MinPct: batteryDrop,
            thermalState: ProcessInfo.processInfo.thermalState.description,
            deviceModel: UIDevice.current.modelIdentifier,
            osVersion: UIDevice.current.systemVersion,
            backend: "coreml",
            telemetryEndpoint: config.telemetryURL
        )

        telemetryClient.send(result: result, to: config.telemetryURL)
        DispatchQueue.main.async { [weak self] in
            self?.latestResult = result
            self?.statusMessage = "Completed (CoreML)"
        }
        logSummary(result: result, latencies: latencyMsValues)
    }

    private func run<T: InferencePerformer>(using performer: T) throws {
        guard !frameProvider.frames.isEmpty else {
            throw NSError(domain: "BenchRunner", code: -1, userInfo: [NSLocalizedDescriptionKey: "No frames available"])
        }
        updateStatus("Loading TFLite runner…")
        let coldStartStart = CFAbsoluteTimeGetCurrent()
        try performer.prepare()
        let coldStartMs = (CFAbsoluteTimeGetCurrent() - coldStartStart) * 1000
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let batteryStart = device.batteryLevel

        updateStatus("Warming up TFLite…")
        for frame in frameProvider.frames.prefix(config.warmupIterations) {
            _ = try performer.perform(on: frame)
        }
        updateStatus("Running measurement loop…")
        var latencies: [Double] = []
        var fpsMin = Double.greatestFiniteMagnitude
        var fpsMax = 0.0
        var framesProcessed = 0
        let measurementStart = CFAbsoluteTimeGetCurrent()
        var elapsed = 0.0
        repeat {
            for frame in frameProvider.frames {
                let latency = try performer.perform(on: frame)
                latencies.append(latency * 1000)
                framesProcessed += 1
                let fps = 1.0 / latency
                fpsMin = min(fpsMin, fps)
                fpsMax = max(fpsMax, fps)
                elapsed = CFAbsoluteTimeGetCurrent() - measurementStart
                if elapsed >= config.measurementDuration { break }
            }
        } while elapsed < config.measurementDuration
        if fpsMin == Double.greatestFiniteMagnitude { fpsMin = 0 }
        let fpsAverage = framesProcessed > 0 ? Double(framesProcessed) / elapsed : 0

        var batteryDrop: Double?
        if let extended = config.extendedDuration {
            let extendedStart = CFAbsoluteTimeGetCurrent()
            repeat {
                for frame in frameProvider.frames {
                    _ = try performer.perform(on: frame)
                    elapsed = CFAbsoluteTimeGetCurrent() - extendedStart
                    if elapsed >= extended { break }
                }
            } while elapsed < extended
        }
        let batteryEnd = device.batteryLevel
        if batteryStart >= 0, batteryEnd >= 0, let extended = config.extendedDuration {
            batteryDrop = max(0, (batteryStart - batteryEnd) * 100)
        }

        let result = BenchmarkResult(
            modelIdentifier: performer.identifier,
            runIdentifier: UUID().uuidString,
            timestamp: Date(),
            framesProcessed: framesProcessed,
            warmupFrames: config.warmupIterations,
            fpsAverage: fpsAverage,
            fpsMin: fpsMin,
            fpsMax: fpsMax,
            latencyP50Ms: latencies.percentile(50),
            latencyP95Ms: latencies.percentile(95),
            coldStartMs: coldStartMs,
            modelFileSizeMB: performer.modelSizeMB,
            batteryDrop15MinPct: batteryDrop,
            thermalState: ProcessInfo.processInfo.thermalState.description,
            deviceModel: UIDevice.current.modelIdentifier,
            osVersion: UIDevice.current.systemVersion,
            backend: performer.backendIdentifier,
            telemetryEndpoint: config.telemetryURL
        )
        telemetryClient.send(result: result, to: config.telemetryURL)
        DispatchQueue.main.async { [weak self] in
            self?.latestResult = result
            self?.statusMessage = "Completed (TFLite)"
        }
        logSummary(result: result, latencies: latencies)
    }

    private func performWarmup(request: VNCoreMLRequest) throws {
        if frameProvider.frames.isEmpty { return }
        for index in 0..<config.warmupIterations {
            let frame = frameProvider.frames[index % frameProvider.frames.count]
            let handler = VNImageRequestHandler(cgImage: frame, options: [:])
            try handler.perform([request])
        }
    }

    private func runLoop(duration: TimeInterval,
                         request: VNCoreMLRequest,
                         recordLatencies: Bool) -> LoopSummary {
        let start = CFAbsoluteTimeGetCurrent()
        var latencies: [Double] = []
        var fpsMin = Double.greatestFiniteMagnitude
        var fpsMax = 0.0
        var framesProcessed = 0
        var elapsed: TimeInterval = 0
        repeat {
            for frame in frameProvider.frames {
                let iterationStart = CFAbsoluteTimeGetCurrent()
                let handler = VNImageRequestHandler(cgImage: frame, options: [:])
                do {
                    try handler.perform([request])
                } catch {
                    print("[Benchmark] Inference failed: \(error)")
                    continue
                }
                let latency = CFAbsoluteTimeGetCurrent() - iterationStart
                framesProcessed += 1
                let fps = 1.0 / max(latency, 0.0001)
                fpsMin = min(fpsMin, fps)
                fpsMax = max(fpsMax, fps)
                if recordLatencies {
                    latencies.append(latency)
                }
                elapsed = CFAbsoluteTimeGetCurrent() - start
                if elapsed >= duration { break }
            }
        } while elapsed < duration
        return LoopSummary(
            elapsed: elapsed,
            frames: framesProcessed,
            fpsMin: fpsMin == Double.greatestFiniteMagnitude ? 0 : fpsMin,
            fpsMax: fpsMax,
            latencies: recordLatencies ? latencies : []
        )
    }

    private func updateStatus(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            self?.statusBeforeMitigation = nil
            self?.statusMessage = message
        }
    }

    private func logSummary(result: BenchmarkResult, latencies: [Double]) {
        print("--- Benchmark Summary ---")
        print("Model: \(result.modelIdentifier)")
        print("Backend: \(result.backend)")
        print("Frames processed: \(result.framesProcessed)")
        print(String(format: "FPS avg %.2f (min %.2f / max %.2f)", result.fpsAverage, result.fpsMin, result.fpsMax))
        print(String(format: "Latency p50 %.1f ms, p95 %.1f ms", result.latencyP50Ms, result.latencyP95Ms))
        print(String(format: "Cold start %.1f ms", result.coldStartMs))
        if let drop = result.batteryDrop15MinPct {
            print(String(format: "Battery drop over extended run: %.1f%%", drop))
        }
        print("Thermal state: \(result.thermalState)")
        print("Telemetry endpoint: \(result.telemetryEndpoint?.absoluteString ?? "n/a")")
        print("Latency samples: \(latencies.count)")
    }

    private func handlePolicyTelemetry(_ sample: ThermalBatteryPolicy.TelemetrySample) {
        telemetryClient.sendPolicySamples([sample], to: config.telemetryURL)
    }

    func requestPolicyResume() {
        thermalPolicy.requestResumeFromFallback()
    }
}

extension BenchmarkRunner: ThermalBatteryPolicyDelegate {
    func policyDidApply(action: ThermalBatteryPolicy.PolicyAction, trigger: ThermalBatteryPolicy.Trigger) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            switch action {
            case .switchTo2D:
                self.protectionBannerVisible = true
                self.protectionBannerMessage = "Battery/thermal protection: switched to 2D."
            case .reduceRefresh:
                if self.statusBeforeMitigation == nil {
                    self.statusBeforeMitigation = self.statusMessage
                }
                self.statusMessage = "Battery protection active — reducing HUD refresh rate."
            case .pauseHeavyFeatures:
                if self.statusBeforeMitigation == nil {
                    self.statusBeforeMitigation = self.statusMessage
                }
                self.statusMessage = "Battery protection active — heavy HUD features paused."
            case .resumeRequested, .none:
                break
            }
        }
    }

    func policyDidClearMitigations() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.protectionBannerVisible = false
            if let previous = self.statusBeforeMitigation {
                self.statusMessage = previous
            } else if self.latestResult == nil {
                self.statusMessage = "Running measurement…"
            }
            self.statusBeforeMitigation = nil
        }
    }
}

extension ProcessInfo.ThermalState {
    var description: String {
        switch self {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }
}

private extension UIDevice {
    var modelIdentifier: String {
        #if targetEnvironment(simulator)
        if let simIdentifier = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return simIdentifier
        }
        #endif
        var systemInfo = utsname()
        uname(&systemInfo)
        let mirror = Mirror(reflecting: systemInfo.machine)
        let identifier = mirror.children.reduce(into: "") { result, element in
            guard let value = element.value as? Int8, value != 0 else { return }
            result.append(String(UnicodeScalar(UInt8(value))))
        }
        return identifier
    }
}

private struct LoopSummary {
    let elapsed: TimeInterval
    let frames: Int
    let fpsMin: Double
    let fpsMax: Double
    let latencies: [Double]
}
