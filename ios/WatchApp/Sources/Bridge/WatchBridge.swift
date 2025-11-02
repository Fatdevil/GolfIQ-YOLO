import Combine
import SwiftUI
import WatchConnectivity

final class WatchBridge: NSObject, ObservableObject {
  static let shared = WatchBridge()

  @Published private(set) var currentHole: HoleModel?
  @Published private(set) var playerLocation: HolePoint?
  @Published private(set) var targetLocation: HolePoint?
  @Published var tournamentSafe: Bool = true
  @Published var scenePhase: ScenePhase = .active

  private let holeStore = HoleModelStore()
  private let session = WCSession.isSupported() ? WCSession.default : nil
  private let redrawSubject = PassthroughSubject<Date, Never>()
  private let overlaySubject = CurrentValueSubject<OverlaySnapshotV1DTO?, Never>(nil)
  private let overlayDecoder = JSONDecoder()

  private var lastUpdate = Date.distantPast
  private var isMoving = false

  var redrawPublisher: AnyPublisher<Date, Never> { redrawSubject.eraseToAnyPublisher() }
  var overlayPublisher: AnyPublisher<OverlaySnapshotV1DTO?, Never> { overlaySubject.eraseToAnyPublisher() }

  override private init() {
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

  private func applyOverlay(data: Data?) {
    guard let data else {
      overlaySubject.send(nil)
      return
    }
    do {
      let snapshot = try overlayDecoder.decode(OverlaySnapshotV1DTO.self, from: data)
      overlaySubject.send(snapshot)
    } catch {
      NSLog("[WatchBridge] Failed to decode overlay snapshot: %@", error.localizedDescription)
    }
  }

  private func handleApplicationContext(_ context: [String: Any]) {
    let payload = context["golfiq_overlay_v1"]
    if let data = payload as? Data {
      applyOverlay(data: data)
    } else if let json = payload as? String {
      applyOverlay(data: json.data(using: .utf8))
    }
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
  ) {
    if activationState == .activated {
      handleApplicationContext(session.receivedApplicationContext)
    }
  }

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
    case "shotsense_control":
      let enabled = (message["enabled"] as? Bool) ?? false
      if enabled {
        WatchSenseController.shared.startIfNeeded()
      } else {
        WatchSenseController.shared.stop()
      }
    default:
      break
    }
  }

  func session(
    _ session: WCSession,
    didReceiveApplicationContext applicationContext: [String: Any]
  ) {
    handleApplicationContext(applicationContext)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {}
}
