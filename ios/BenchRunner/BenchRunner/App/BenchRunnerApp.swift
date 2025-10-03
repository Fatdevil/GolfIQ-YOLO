import SwiftUI

@main
struct BenchRunnerApp: App {
    @StateObject private var runner = BenchmarkRunner()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(runner)
                .onAppear {
                    runner.start()
                }
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var runner: BenchmarkRunner

    var body: some View {
        VStack(spacing: 16) {
            Text("BenchRunner")
                .font(.largeTitle)
                .bold()
            Text(runner.statusMessage)
                .font(.body)
                .multilineTextAlignment(.center)
                .padding()
            ThermalProtectionBanner(
                isVisible: runner.protectionBannerVisible,
                message: runner.protectionBannerMessage,
                onResume: { runner.requestPolicyResume() }
            )
            if let result = runner.latestResult {
                MetricsView(result: result)
                    .padding()
            } else {
                ProgressView()
            }
        }
        .padding()
    }
}

struct MetricsView: View {
    let result: BenchmarkResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("FPS avg: \(result.fpsAverage, specifier: "%.2f")")
            Text("FPS min/max: \(result.fpsMin, specifier: "%.2f") / \(result.fpsMax, specifier: "%.2f")")
            Text("Latency p50/p95: \(result.latencyP50Ms, specifier: "%.1f") ms / \(result.latencyP95Ms, specifier: "%.1f") ms")
            Text("Cold start: \(result.coldStartMs, specifier: "%.1f") ms")
            if let battery = result.batteryDrop15MinPct {
                Text("Battery drop (15m): \(battery, specifier: "%.1f")%")
            }
            Text("Thermal state: \(result.thermalState)")
            Text("Model size: \(result.modelFileSizeMB, specifier: "%.2f") MB")
            if let endpoint = result.telemetryEndpoint?.absoluteString {
                Text("Telemetry uploaded to: \(endpoint)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
