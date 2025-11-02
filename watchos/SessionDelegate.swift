import Foundation
import WatchConnectivity

final class SessionDelegate: NSObject, WCSessionDelegate {
    private let model: WatchHUDModel
    private let session: WCSession?

    init(model: WatchHUDModel) {
        self.model = model
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        super.init()
        configureSession()
    }

    private func configureSession() {
        guard let session else { return }
        session.delegate = self
        activate(session)
        applyLatestContext(from: session)
    }

    private func activate(_ session: WCSession) {
        if Thread.isMainThread {
            session.activate()
        } else {
            DispatchQueue.main.async {
                session.activate()
            }
        }
    }

    private func applyLatestContext(from session: WCSession) {
        let contexts: [[String: Any]] = [session.receivedApplicationContext, session.applicationContext]
        for context in contexts {
            if let data = context["golfiq_hud_v1"] as? Data {
                model.update(with: data)
                break
            }
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        applyLatestContext(from: session)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let data = applicationContext["golfiq_hud_v1"] as? Data else { return }
        model.update(with: data)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        guard let type = message["type"] as? String else { return }
        if type == "roundSaved" {
            model.showToast("Round saved")
        }
    }
}
