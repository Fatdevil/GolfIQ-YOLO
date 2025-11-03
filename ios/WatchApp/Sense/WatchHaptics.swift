import WatchKit

enum ShotAck {
  case pending
  case confirmed
}

final class WatchHaptics {
  static func play(_ kind: ShotAck) {
    switch kind {
    case .pending:
      WKInterfaceDevice.current().play(.directionUp)
    case .confirmed:
      WKInterfaceDevice.current().play(.success)
    }
  }
}
