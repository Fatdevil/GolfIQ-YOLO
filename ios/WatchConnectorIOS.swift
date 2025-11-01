import Foundation
import React
import WatchConnectivity

@objc(WatchConnectorIOS)
class WatchConnectorIOS: NSObject, WCSessionDelegate {
  private let session: WCSession?

  override init() {
    if WCSession.isSupported() {
      session = WCSession.default
    } else {
      session = nil
    }
    super.init()
    session?.delegate = self
    if session?.activationState == .notActivated {
      session?.activate()
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func isCapable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let session = session else {
      resolve(false)
      return
    }
    let ok = session.isPaired && session.isWatchAppInstalled
    resolve(ok)
  }

  @objc
  func sendHUDB64(
    _ base64: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let session = session,
      session.isReachable,
      let data = Data(base64Encoded: base64 as String)
    else {
      resolve(false)
      return
    }

    do {
      try session.updateApplicationContext(["golfiq_hud_v1": data])
      resolve(true)
    } catch {
      resolve(false)
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}
