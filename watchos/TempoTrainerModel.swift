import Combine
import Foundation
import WatchKit

struct TempoTrainerTarget: Equatable {
    let targetRatio: Double
    let tolerance: Double
    let targetBackswingMs: Int
    let targetDownswingMs: Int
}

struct TempoTrainerResult: Equatable {
    let backswingMs: Int
    let downswingMs: Int
    let ratio: Double
    let withinBand: Bool
}

final class TempoTrainerModel: ObservableObject {
    @Published private(set) var target: TempoTrainerTarget?
    @Published private(set) var lastResult: TempoTrainerResult?

    private var sendMessageHandler: (([String: Any]) -> Void)?

    func registerMessageSender(_ handler: @escaping ([String: Any]) -> Void) {
        sendMessageHandler = handler
    }

    func activate(_ target: TempoTrainerTarget) {
        DispatchQueue.main.async { [weak self] in
            self?.target = target
        }
    }

    func deactivate() {
        DispatchQueue.main.async { [weak self] in
            self?.target = nil
            self?.lastResult = nil
        }
    }

    func handleIncoming(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        if type == "tempoTrainer.activate" {
            guard let ratio = message["targetRatio"] as? Double,
                  let tolerance = message["tolerance"] as? Double,
                  let backswing = message["targetBackswingMs"] as? Int,
                  let downswing = message["targetDownswingMs"] as? Int else { return }
            let target = TempoTrainerTarget(
                targetRatio: ratio,
                tolerance: tolerance,
                targetBackswingMs: backswing,
                targetDownswingMs: downswing
            )
            activate(target)
        } else if type == "tempoTrainer.deactivate" {
            deactivate()
        }
    }

    func startCue() {
        guard let target else { return }
        let device = WKInterfaceDevice.current()
        device.play(.start)
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(target.targetBackswingMs)) {
            device.play(.directionUp)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(target.targetBackswingMs + target.targetDownswingMs)) {
            device.play(.success)
        }
    }

    func recordSwing(backswingMs: Int, downswingMs: Int) {
        guard let target else { return }
        guard backswingMs > 0, downswingMs > 0 else { return }
        let ratio = Double(backswingMs) / Double(downswingMs)
        let withinBand = abs(ratio - target.targetRatio) <= target.tolerance
        let result = TempoTrainerResult(
            backswingMs: backswingMs,
            downswingMs: downswingMs,
            ratio: ratio,
            withinBand: withinBand
        )
        DispatchQueue.main.async { [weak self] in
            self?.lastResult = result
        }
        var payload: [String: Any] = [
            "type": "tempoTrainer.result",
            "backswingMs": backswingMs,
            "downswingMs": downswingMs,
            "ratio": ratio,
            "withinBand": withinBand,
        ]
        sendMessageHandler?(payload)
    }

    func simulateAndRecordSwing() {
        guard let target else { return }
        let backswing = max(100, target.targetBackswingMs + Int.random(in: -40...40))
        let downswing = max(80, target.targetDownswingMs + Int.random(in: -20...20))
        recordSwing(backswingMs: backswing, downswingMs: downswing)
    }
}

