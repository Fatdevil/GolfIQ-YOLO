import Combine
import Foundation

final class WatchHUDModel: ObservableObject {
    @Published private(set) var hud: HUD?
    @Published private(set) var toast: String?
    @Published private(set) var advice: HUD.CaddieHint?

    private let decoder: JSONDecoder
    private var toastWorkItem: DispatchWorkItem?
    private var sendMessageHandler: (([String: Any]) -> Void)?

    init(decoder: JSONDecoder = JSONDecoder()) {
        self.decoder = decoder
    }

    func update(with data: Data) {
        do {
            let snapshot = try decoder.decode(HUD.self, from: data)
            publish(snapshot)
        } catch {
            #if DEBUG
            print("Failed to decode HUD payload: \(error)")
            #endif
        }
    }

    private func publish(_ snapshot: HUD?) {
        if Thread.isMainThread {
            hud = snapshot
            if let hint = snapshot?.caddie {
                advice = hint
            }
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.hud = snapshot
                if let hint = snapshot?.caddie {
                    self?.advice = hint
                }
            }
        }
    }

    func showToast(_ message: String) {
        let workItem = DispatchWorkItem { [weak self] in
            self?.toast = nil
        }
        toastWorkItem?.cancel()
        toastWorkItem = workItem
        let setMessage = { [weak self] in
            self?.toast = message
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5, execute: workItem)
        }
        if Thread.isMainThread {
            setMessage()
        } else {
            DispatchQueue.main.async(execute: setMessage)
        }
    }

    func registerMessageSender(_ handler: @escaping ([String: Any]) -> Void) {
        sendMessageHandler = handler
    }

    func updateAdvice(with hint: HUD.CaddieHint) {
        if Thread.isMainThread {
            advice = hint
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.advice = hint
            }
        }
    }

    func applyAdvicePayload(_ payload: [String: Any]) {
        guard let club = payload["club"] as? String, !club.trimmingCharacters(in: .whitespaces).isEmpty else {
            return
        }
        let carryValue = payload["carry_m"]
        let carry = (carryValue as? NSNumber)?.doubleValue ?? (carryValue as? Double)
        guard let carryMeters = carry, carryMeters.isFinite else {
            return
        }
        var aim: HUD.CaddieHint.Aim?
        if let aimRaw = payload["aim"] as? [String: Any], let dirRaw = aimRaw["dir"] as? String,
           let dir = HUD.CaddieHint.Aim.Direction(rawValue: dirRaw.uppercased()) {
            let offsetValue = aimRaw["offset_m"]
            let offset = (offsetValue as? NSNumber)?.doubleValue ?? (offsetValue as? Double)
            aim = HUD.CaddieHint.Aim(dir: dir, offsetM: offset)
        }
        let riskRaw = (payload["risk"] as? String)?.lowercased()
        let risk = riskRaw.flatMap { HUD.CaddieHint.Risk(rawValue: $0) } ?? .neutral
        let hint = HUD.CaddieHint(
            club: club,
            carryM: carryMeters,
            totalM: nil,
            aim: aim,
            risk: risk,
            confidence: nil
        )
        updateAdvice(with: hint)
    }

    func acceptAdvice() {
        guard let current = advice else { return }
        sendMessageHandler?(["type": "CADDIE_ACCEPTED_V1", "club": current.club])
    }
}

struct HUD: Decodable, Equatable {
    struct Distances: Decodable, Equatable {
        let front: Double
        let middle: Double
        let back: Double
    }

    struct Wind: Decodable, Equatable {
        let mps: Double
        let deg: Double
    }

    struct Strategy: Decodable, Equatable {
        enum Profile: String, Decodable {
            case conservative
            case neutral
            case aggressive
        }

        let profile: Profile
        let offsetM: Double
        let carryM: Double

        private enum CodingKeys: String, CodingKey {
            case profile
            case offsetM = "offset_m"
            case carryM = "carry_m"
        }
    }

    struct CaddieHint: Decodable, Equatable {
        struct Aim: Decodable, Equatable {
            enum Direction: String, Decodable {
                case L
                case C
                case R
            }

            let dir: Direction
            let offsetM: Double?

            private enum CodingKeys: String, CodingKey {
                case dir
                case offsetM = "offset_m"
            }
        }

        enum Risk: String, Decodable {
            case safe
            case neutral
            case aggressive
        }

        let club: String
        let carryM: Double
        let totalM: Double?
        let aim: Aim?
        let risk: Risk
        let confidence: Double?

        private enum CodingKeys: String, CodingKey {
            case club
            case carryM = "carry_m"
            case totalM = "total_m"
            case aim
            case risk
            case confidence
        }
    }

    let version: Int
    let timestamp: TimeInterval
    let fmb: Distances
    let playsLikePct: Double
    let wind: Wind
    let strategy: Strategy?
    let tournamentSafe: Bool
    let caddie: CaddieHint?

    private enum CodingKeys: String, CodingKey {
        case version = "v"
        case timestamp = "ts"
        case fmb
        case playsLikePct
        case wind
        case strategy
        case tournamentSafe
        case caddie
    }
}
