import Foundation

final class ThermalWatcher {
    static let shared = ThermalWatcher()

    private let processInfo: ProcessInfo
    private var observer: NSObjectProtocol?
    private let queue = DispatchQueue(label: "com.golfiq.telemetry.thermal", qos: .utility)

    private var currentState: ProcessInfo.ThermalState
    var onUpdate: ((String) -> Void)?

    init(processInfo: ProcessInfo = .processInfo) {
        self.processInfo = processInfo
        currentState = processInfo.thermalState
    }

    deinit {
        stop()
    }

    func start() {
        guard observer == nil else { return }

        observer = NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            self.queue.async {
                let newState = self.processInfo.thermalState
                guard newState != self.currentState else { return }
                self.currentState = newState
                let mapped = self.map(state: newState)
                DispatchQueue.main.async {
                    self.onUpdate?(mapped)
                }
            }
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onUpdate?(self.currentStateString())
        }
    }

    func stop() {
        if let observer {
            NotificationCenter.default.removeObserver(observer)
            self.observer = nil
        }
    }

    func currentStateString() -> String {
        map(state: currentState)
    }

    private func map(state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal:
            return "nominal"
        case .fair:
            return "fair"
        case .serious:
            return "serious"
        case .critical:
            return "critical"
        @unknown default:
            return "nominal"
        }
    }
}
