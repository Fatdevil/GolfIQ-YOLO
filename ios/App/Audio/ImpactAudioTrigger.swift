import AVFoundation
import Foundation

final class ImpactAudioTrigger {
    private let engine = AVAudioEngine()
    private let telemetry: TelemetryClient
    private let onStart: () -> Void
    private let onStop: () -> Void
    private let thresholdDb: Float
    private let debounce: TimeInterval

    private var capturing = false
    private var lastAboveThreshold: Date?

    init(
        telemetry: TelemetryClient,
        thresholdDb: Float = -18,
        debounce: TimeInterval = 1.2,
        onStart: @escaping () -> Void,
        onStop: @escaping () -> Void
    ) {
        self.telemetry = telemetry
        self.thresholdDb = thresholdDb
        self.debounce = debounce
        self.onStart = onStart
        self.onStop = onStop
    }

    func start() throws {
        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            self?.process(buffer: buffer)
        }
        try engine.start()
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        capturing = false
        lastAboveThreshold = nil
    }

    private func process(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?.pointee else { return }
        let frameLength = Int(buffer.frameLength)
        if frameLength == 0 { return }

        var sum: Float = 0
        for index in 0..<frameLength {
            let sample = channelData[index]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float(frameLength))
        let dbValue = Float(20.0 * log10(Double(max(rms, 0.000_000_1))))
        let now = Date()

        if dbValue >= thresholdDb {
            lastAboveThreshold = now
            telemetry.logImpactTriggerEvent(magnitudeDb: Double(dbValue))
            if !capturing {
                capturing = true
                DispatchQueue.main.async { [onStart] in onStart() }
            }
        } else if capturing {
            if let last = lastAboveThreshold, now.timeIntervalSince(last) > debounce {
                capturing = false
                DispatchQueue.main.async { [onStop] in onStop() }
            }
        }
    }
}
