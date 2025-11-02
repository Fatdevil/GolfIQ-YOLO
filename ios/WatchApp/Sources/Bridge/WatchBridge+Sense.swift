final class WatchSenseController {
  static let shared = WatchSenseController()
  private var running = false

  private init() {}

  func startIfNeeded() {
    guard !running else { return }
    running = true
    IMUStreamer.shared.start()
  }

  func stop() {
    guard running else { return }
    running = false
    IMUStreamer.shared.stop()
  }
}
