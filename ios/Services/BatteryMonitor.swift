import Foundation
import UIKit

final class BatteryMonitor {
    struct Sample {
        let timestamp: Date
        let level: Double
    }

    private let device: UIDevice
    private let queue = DispatchQueue(label: "com.golfiq.telemetry.battery", qos: .utility)
    private var samples: [Sample] = []
    private var levelObserver: NSObjectProtocol?
    private var stateObserver: NSObjectProtocol?
    private var isMonitoring = false

    private let window: TimeInterval = 15 * 60

    init(device: UIDevice = .current) {
        self.device = device
    }

    deinit {
        stop()
    }

    func start() {
        guard !isMonitoring else { return }
        isMonitoring = true
        device.isBatteryMonitoringEnabled = true

        queue.async { [weak self] in
            guard let self else { return }
            self.recordSampleLocked(level: self.currentLevel())
        }

        levelObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryLevelDidChangeNotification,
            object: device,
            queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            self.queue.async {
                self.recordSampleLocked(level: self.currentLevel())
            }
        }

        stateObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryStateDidChangeNotification,
            object: device,
            queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            self.queue.async {
                self.recordSampleLocked(level: self.currentLevel())
            }
        }
    }

    func stop() {
        guard isMonitoring else { return }
        isMonitoring = false

        if let levelObserver {
            NotificationCenter.default.removeObserver(levelObserver)
        }
        if let stateObserver {
            NotificationCenter.default.removeObserver(stateObserver)
        }

        levelObserver = nil
        stateObserver = nil
        device.isBatteryMonitoringEnabled = false
    }

    func currentLevel() -> Double {
        let rawLevel = device.batteryLevel
        guard rawLevel >= 0 else { return 0 }
        return Double(rawLevel) * 100.0
    }

    func dropLast15Minutes() -> Double {
        queue.sync {
            pruneSamplesLocked(reference: Date())
            guard let first = samples.first, let last = samples.last else { return 0 }
            return max(0, first.level - last.level)
        }
    }

    private func recordSampleLocked(level: Double) {
        let sample = Sample(timestamp: Date(), level: level)
        pruneSamplesLocked(reference: sample.timestamp)
        samples.append(sample)
    }

    private func pruneSamplesLocked(reference: Date) {
        let cutoff = reference.addingTimeInterval(-window)
        samples.removeAll { $0.timestamp < cutoff }
        if samples.isEmpty, isMonitoring {
            samples.append(Sample(timestamp: reference, level: currentLevel()))
        }
    }
}
