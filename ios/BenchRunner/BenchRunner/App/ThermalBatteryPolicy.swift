import Foundation
import UIKit

protocol ThermalBatteryPolicyDelegate: AnyObject {
    func policyDidApply(action: ThermalBatteryPolicy.PolicyAction, trigger: ThermalBatteryPolicy.Trigger)
    func policyDidClearMitigations()
}

final class ThermalBatteryPolicy {
    struct Config {
        var sampleInterval: TimeInterval = 60
        var batteryWindow: TimeInterval = 15 * 60
        var batteryDropThresholdPercent: Double = 9
    }

    enum PolicyAction: String {
        case none = "none"
        case switchTo2D = "switch_to_2d"
        case reduceRefresh = "reduce_refresh"
        case pauseHeavyFeatures = "pause_heavy_features"
        case resumeRequested = "resume_requested"
    }

    enum Trigger: String {
        case thermal
        case battery
        case user
    }

    struct TelemetrySample {
        let timestamp: Date
        let thermalState: ProcessInfo.ThermalState
        let batteryPercent: Double?
        let batteryDeltaPercent: Double?
        let action: PolicyAction
        let trigger: Trigger
    }

    private struct BatterySample {
        let timestamp: Date
        let percent: Double
    }

    private let config: Config
    private let queue = DispatchQueue(label: "com.golfiq.policy.thermal-battery")
    private var timer: DispatchSourceTimer?
    private var batteryHistory: [BatterySample] = []
    private var latestBatteryDelta: Double?
    private var activeAction: PolicyAction = .none
    private var activeTrigger: Trigger?
    private var isRunning = false
    private var thermalObserver: NSObjectProtocol?
    private let telemetryHandler: (TelemetrySample) -> Void

    weak var delegate: ThermalBatteryPolicyDelegate?

    init(config: Config = Config(), telemetryHandler: @escaping (TelemetrySample) -> Void) {
        self.config = config
        self.telemetryHandler = telemetryHandler
    }

    deinit {
        stop()
    }

    func start() {
        queue.sync {
            guard !isRunning else { return }
            isRunning = true
            batteryHistory.removeAll()
            latestBatteryDelta = nil
            UIDevice.current.isBatteryMonitoringEnabled = true
            scheduleTimerLocked()
        }
        observeThermalState()
        queue.async { [weak self] in
            self?.emitTelemetry(trigger: .thermal)
        }
    }

    func stop() {
        var shouldClear = false
        queue.sync {
            guard isRunning else { return }
            isRunning = false
            timer?.cancel()
            timer = nil
            batteryHistory.removeAll()
            latestBatteryDelta = nil
            shouldClear = activeAction != .none
            activeAction = .none
            activeTrigger = nil
            UIDevice.current.isBatteryMonitoringEnabled = false
        }
        if let observer = thermalObserver {
            NotificationCenter.default.removeObserver(observer)
            thermalObserver = nil
        }
        if shouldClear {
            DispatchQueue.main.async { [weak self] in
                self?.delegate?.policyDidClearMitigations()
            }
        }
    }

    func requestResumeFromFallback() {
        queue.async { [weak self] in
            guard let self else { return }
            guard isRunning else { return }
            if activeAction == .none {
                DispatchQueue.main.async { [weak self] in
                    self?.delegate?.policyDidClearMitigations()
                }
                emitTelemetry(trigger: .user)
                return
            }
            activeAction = .resumeRequested
            activeTrigger = .user
            DispatchQueue.main.async { [weak self] in
                self?.delegate?.policyDidClearMitigations()
            }
            emitTelemetry(trigger: .user)
            activeAction = .none
            activeTrigger = nil
        }
    }

    private func scheduleTimerLocked() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        let intervalMs = max(Int(config.sampleInterval * 1000), 1)
        timer.schedule(deadline: .now(), repeating: .milliseconds(intervalMs))
        timer.setEventHandler { [weak self] in
            self?.sampleBattery()
        }
        timer.resume()
        self.timer = timer
    }

    private func observeThermalState() {
        let center = NotificationCenter.default
        thermalObserver = center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: nil) {
            [weak self] _ in
            let state = ProcessInfo.processInfo.thermalState
            self?.queue.async {
                self?.handleThermalState(state)
            }
        }
        queue.async { [weak self] in
            guard let self else { return }
            self.handleThermalState(ProcessInfo.processInfo.thermalState)
        }
    }

    private func handleThermalState(_ state: ProcessInfo.ThermalState) {
        if state.rawValue >= ProcessInfo.ThermalState.serious.rawValue {
            apply(action: .switchTo2D, trigger: .thermal)
        }
        emitTelemetry(trigger: .thermal)
    }

    private func sampleBattery() {
        let level = UIDevice.current.batteryLevel
        guard level >= 0 else { return }
        let percent = Double(level) * 100
        let now = Date()
        batteryHistory.append(BatterySample(timestamp: now, percent: percent))
        trimBatteryHistory(now: now)
        latestBatteryDelta = computeBatteryDelta()
        if let delta = latestBatteryDelta {
            if delta >= config.batteryDropThresholdPercent * 1.5 {
                apply(action: .pauseHeavyFeatures, trigger: .battery)
            } else if delta >= config.batteryDropThresholdPercent {
                if activeAction != .pauseHeavyFeatures {
                    apply(action: .reduceRefresh, trigger: .battery)
                }
            } else if activeTrigger == .battery && activeAction != .none {
                activeAction = .none
                activeTrigger = nil
                DispatchQueue.main.async { [weak self] in
                    self?.delegate?.policyDidClearMitigations()
                }
            }
        }
        emitTelemetry(trigger: .battery)
    }

    private func trimBatteryHistory(now: Date) {
        let cutoff = now.addingTimeInterval(-config.batteryWindow)
        batteryHistory.removeAll { sample in
            sample.timestamp < cutoff
        }
    }

    private func computeBatteryDelta() -> Double? {
        guard let oldest = batteryHistory.first, let newest = batteryHistory.last else {
            return nil
        }
        return max(0, oldest.percent - newest.percent)
    }

    private func apply(action: PolicyAction, trigger: Trigger) {
        if activeAction == action { return }
        activeAction = action
        activeTrigger = trigger
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.policyDidApply(action: action, trigger: trigger)
        }
    }

    private func emitTelemetry(trigger: Trigger) {
        guard isRunning else { return }
        let sample = TelemetrySample(
            timestamp: Date(),
            thermalState: ProcessInfo.processInfo.thermalState,
            batteryPercent: currentBatteryPercent(),
            batteryDeltaPercent: latestBatteryDelta,
            action: activeAction,
            trigger: trigger
        )
        telemetryHandler(sample)
    }

    private func currentBatteryPercent() -> Double? {
        let level = UIDevice.current.batteryLevel
        guard level >= 0 else { return nil }
        return Double(level) * 100
    }
}
