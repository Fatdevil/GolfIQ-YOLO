import Foundation
import React
import WatchConnectivity

@objc(WatchConnectorIOS)
class WatchConnectorIOS: NSObject, RCTBridgeModule, WCSessionDelegate {
  static func moduleName() -> String! { "WatchConnectorIOS" }

  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  private let session = WCSession.isSupported() ? WCSession.default : nil
  private var activationBlocks: [(() -> Void)] = []
  private var activationReady = false

  override init() {
    super.init()
    if let s = session {
      s.delegate = self
      if s.activationState == .notActivated {
        DispatchQueue.main.async { s.activate() }
      }
    }
  }

  private func withSession(_ block: @escaping (WCSession) -> Void) {
    guard let s = session else { return }
    if Thread.isMainThread {
      block(s)
    } else {
      DispatchQueue.main.async { block(s) }
    }
  }

  private func whenActivated(_ block: @escaping () -> Void) {
    withSession { s in
      if s.activationState == .activated || self.activationReady {
        block()
      } else {
        self.activationBlocks.append(block)
        if s.activationState == .notActivated {
          s.activate()
        }
      }
    }
  }

  @objc
  func isCapable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    whenActivated { [weak self] in
      guard let s = self?.session else {
        resolve(false)
        return
      }
      resolve(s.isPaired && s.isWatchAppInstalled)
    }
  }

  @objc
  func sendHUDB64(
    _ base64: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let data = Data(base64Encoded: base64 as String) else {
      resolve(false)
      return
    }

    whenActivated { [weak self] in
      guard let s = self?.session else {
        resolve(false)
        return
      }

      do {
        var context = s.applicationContext
        context["golfiq_hud_v1"] = data
        try s.updateApplicationContext(context)
        resolve(true)
      } catch {
        resolve(false)
      }
    }
  }

  @objc
  func sendOverlayJSON(
    _ json: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let data = (json as String).data(using: .utf8) else {
      resolve(false)
      return
    }

    whenActivated { [weak self] in
      guard let s = self?.session else {
        resolve(false)
        return
      }

      do {
        var context = s.applicationContext
        context["golfiq_overlay_v1"] = data
        try s.updateApplicationContext(context)
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
  ) {
    activationReady = activationState == .activated
    if activationReady {
      let blocks = activationBlocks
      activationBlocks.removeAll()
      blocks.forEach { $0() }
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    DispatchQueue.main.async {
      session.activate()
    }
  }
}
