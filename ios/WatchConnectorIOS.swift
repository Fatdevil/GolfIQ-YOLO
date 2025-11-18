import Foundation
import React
import WatchConnectivity

@objc(WatchConnectorIOS)
class WatchConnectorIOS: RCTEventEmitter, WCSessionDelegate {
  private let session = WCSession.isSupported() ? WCSession.default : nil
  private var activationBlocks: [(() -> Void)] = []
  private var activationReady = false
  private var hasListeners = false
  private let imuEventName = "watch.imu.v1"
  private let messageEventName = "watch.message.v1"

  override class func requiresMainQueueSetup() -> Bool { true }

  override func methodQueue() -> DispatchQueue! { DispatchQueue.main }

  override init() {
    super.init()
    if let s = session {
      s.delegate = self
      if s.activationState == .notActivated {
        DispatchQueue.main.async { s.activate() }
      }
    }
  }

  override func supportedEvents() -> [String]! {
    [imuEventName, messageEventName]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
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

  func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
    guard hasListeners else { return }
    let base64 = messageData.base64EncodedString()
    let emit = {
      guard self.hasListeners else { return }
      self.sendEvent(withName: self.imuEventName, body: ["b64": base64])
    }
    if Thread.isMainThread {
      emit()
    } else {
      DispatchQueue.main.async(execute: emit)
    }
  }

  @objc
  func setSenseStreamingEnabled(
    _ enabled: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    whenActivated { [weak self] in
      guard let s = self?.session else {
        resolve(false)
        return
      }
      s.sendMessage(
        [
          "type": "shotsense_control",
          "enabled": enabled.boolValue,
        ],
        replyHandler: { _ in resolve(true) },
        errorHandler: { _ in resolve(false) }
      )
    }
  }

  @objc
  func sendMessage(
    _ json: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let data = (json as String).data(using: .utf8) else {
      resolve(false)
      return
    }
    guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      resolve(false)
      return
    }
    whenActivated { [weak self] in
      guard let s = self?.session else {
        resolve(false)
        return
      }
      s.sendMessage(payload, replyHandler: { _ in resolve(true) }, errorHandler: { _ in resolve(false) })
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
    guard hasListeners else { return }
    guard let type = message["type"] as? String,
          type == "CADDIE_ACCEPTED_V1" || type == "CADDIE_ADVICE_SHOWN_V1" else { return }
    if let data = try? JSONSerialization.data(withJSONObject: message),
       let json = String(data: data, encoding: .utf8) {
      sendEvent(withName: messageEventName, body: ["json": json])
    } else {
      sendEvent(withName: messageEventName, body: ["json": ""])
    }
  }
}
