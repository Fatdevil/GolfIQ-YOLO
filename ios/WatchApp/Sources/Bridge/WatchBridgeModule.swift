import Foundation
import React
import WatchConnectivity

@objc(WatchBridgeModule)
final class WatchBridgeModule: RCTEventEmitter, WCSessionDelegate {
  private let session = WCSession.isSupported() ? WCSession.default : nil

  override init() {
    super.init()
    session?.delegate = self
    session?.activate()
  }

  override static func moduleName() -> String! { "WatchBridgeModule" }
  override class func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue { DispatchQueue.main }

  override func supportedEvents() -> [String]! { ["WatchTargetMoved"] }

  @objc
  func sendHoleModel(_ json: NSString, tournamentSafe: Bool) {
    guard let session else { return }
    session.sendMessage(
      [
        "type": "holeModel",
        "json": json,
        "tournamentSafe": tournamentSafe,
      ],
      replyHandler: nil,
      errorHandler: nil
    )
  }

  @objc
  func sendPlayerPosition(_ lat: NSNumber, lon: NSNumber) {
    guard let session else { return }
    session.sendMessage(
      [
        "type": "playerPos",
        "lat": lat.doubleValue,
        "lon": lon.doubleValue,
      ],
      replyHandler: nil,
      errorHandler: nil
    )
  }

  @objc
  func sendTargetPosition(_ lat: NSNumber, lon: NSNumber) {
    guard let session else { return }
    session.sendMessage(
      [
        "type": "targetPos",
        "lat": lat.doubleValue,
        "lon": lon.doubleValue,
      ],
      replyHandler: nil,
      errorHandler: nil
    )
  }

  @objc
  func notifyRoundSaved() {
    guard let session else { return }
    session.sendMessage([
      "type": "roundSaved",
    ], replyHandler: nil, errorHandler: nil)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard message["type"] as? String == "targetMoved" else { return }
    sendEvent(withName: "WatchTargetMoved", body: [
      "lat": message["lat"] ?? 0,
      "lon": message["lon"] ?? 0,
    ])
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) {
    DispatchQueue.main.async { session.activate() }
  }
}
