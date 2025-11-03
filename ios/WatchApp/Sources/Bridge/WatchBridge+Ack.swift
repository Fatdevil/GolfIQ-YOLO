import Foundation

private extension ShotAck {
  init?(string: String) {
    switch string {
    case "pending":
      self = .pending
    case "confirmed":
      self = .confirmed
    default:
      return nil
    }
  }
}

extension WatchBridge {
  func handleShotSenseAck(_ message: [String: Any]) -> Bool {
    if let path = message["path"] as? String, path == "/shotsense/ack" {
      let payload = message["payload"] as? [String: Any]
      let raw = (payload?["kind"] as? String) ?? (message["kind"] as? String)
      guard let raw, let ack = ShotAck(string: raw) else { return true }
      WatchHaptics.play(ack)
      return true
    }
    if let type = message["type"] as? String, type == "shotsense_ack" {
      guard let raw = message["kind"] as? String, let ack = ShotAck(string: raw) else { return true }
      WatchHaptics.play(ack)
      return true
    }
    return false
  }
}
