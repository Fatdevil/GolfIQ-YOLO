import Combine
import SwiftUI
import WatchConnectivity

final class WatchBridge: NSObject, ObservableObject {
  @Published private(set) var currentHole: HoleModel?
  @Published private(set) var playerLocation: HolePoint?
  @Published private(set) var targetLocation: HolePoint?
  @Published var tournamentSafe: Bool = true
  @Published var scenePhase: ScenePhase = .active

  private let holeStore = HoleModelStore()
  private let session = WCSession.isSupported() ? WCSession.default : nil
  private let redrawSubject = PassthroughSubject<Date, Never>()

  private var lastUpdate = Date.distantPast
  private var isMoving = false

  var redrawPublisher: AnyPublisher<Date, Never> { redrawSubject.eraseToAnyPublisher() }

  override init() {
    super.init()
    holeStore.$model.assign(to: &$currentHole)
    session?.delegate = self
    session?.activate()
  }

  func applyHoleModel(json: String) {
    holeStore.apply(json: json)
    redrawSubject.send(Date())
  }

  func updatePlayer(lat: Double, lon: Double) {
    guard shouldUpdate(isMovement: true) else { return }
    playerLocation = HolePoint(lat: lat, lon: lon)
    redrawSubject.send(Date())
  }

  func updateTarget(lat: Double, lon: Double) {
    guard shouldUpdate(isMovement: false) else { return }
    targetLocation = HolePoint(lat: lat, lon: lon)
    redrawSubject.send(Date())
  }

  func emitTargetMoved(_ point: HolePoint) {
    targetLocation = point
    guard let session else { return }
    let payload: [String: Any] = [
      "type": "targetMoved",
      "lat": point.lat,
      "lon": point.lon,
    ]
    session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
  }

  func requestIdleUpdate() {
    guard scenePhase == .active else { return }
    redrawSubject.send(Date())
  }

  private func shouldUpdate(isMovement: Bool) -> Bool {
    let now = Date()
    let interval: TimeInterval = isMovement ? 1 : 3
    if now.timeIntervalSince(lastUpdate) >= interval {
      lastUpdate = now
      isMoving = isMovement
      return true
    }
    if isMovement {
      isMoving = true
    }
    return false
  }
}

extension WatchBridge: WCSessionDelegate {
  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let type = message["type"] as? String else { return }
    switch type {
    case "holeModel":
      if let json = message["json"] as? String { applyHoleModel(json: json) }
      tournamentSafe = (message["tournamentSafe"] as? Bool) ?? tournamentSafe
    case "playerPos":
      guard let lat = message["lat"] as? Double, let lon = message["lon"] as? Double else { return }
      updatePlayer(lat: lat, lon: lon)
    case "targetPos":
      guard let lat = message["lat"] as? Double, let lon = message["lon"] as? Double else { return }
      updateTarget(lat: lat, lon: lon)
    default:
      break
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {}
}
