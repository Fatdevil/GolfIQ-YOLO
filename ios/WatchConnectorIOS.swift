import Foundation
import React
import WatchConnectivity

@objc(WatchConnectorIOS)
class WatchConnectorIOS: NSObject, WCSessionDelegate {
  private let session: WCSession? = {
    guard WCSession.isSupported() else { return nil }
    return WCSession.default
  }()

  override init() {
    super.init()
    if let session = session {
      session.delegate = self
      if session.activationState == .notActivated {
        DispatchQueue.main.async {
          session.activate()
        }
      }
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(isCapable:rejecter:)
  func isCapable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    guard let session = session else {
      resolve(false)
      return
    }
    let capable = session.isPaired && session.isWatchAppInstalled
    resolve(capable)
  }

  @objc(sendHUDB64:resolver:rejecter:)
  func sendHUDB64(
    _ base64: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let session = session,
      session.isReachable,
      let payload = Data(base64Encoded: base64 as String)
    else {
      resolve(false)
      return
    }

    DispatchQueue.main.async {
      do {
        try session.updateApplicationContext(["golfiq_hud_v1": payload])
        resolve(true)
      } catch {
        resolve(false)
      }
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    DispatchQueue.main.async {
      session.activate()
    }
  }
}
