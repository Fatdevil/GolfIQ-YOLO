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

    func update(with snapshot: HUD) {
        publish(snapshot)
    }

    private func publish(_ snapshot: HUD?) {
        if Thread.isMainThread {
            hud = snapshot
            advice = snapshot?.caddie
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.hud = snapshot
                self?.advice = snapshot?.caddie
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

    // MARK: - Presentation helpers

    var holeNumber: Int? { hud?.hole?.number }

    var par: Int? { hud?.hole?.par }

    var toFront_m: Double? { hud?.fmb.front }

    var toMiddle_m: Double? { hud?.fmb.middle }

    var toBack_m: Double? { hud?.fmb.back }

    var playsLikePct: Double? { hud?.playsLikePct }

    var playsLikeAdjustment_m: Double? {
        guard let pct = playsLikePct, let middle = toMiddle_m else { return nil }
        return middle * pct / 100.0
    }

    var currentAdvice: HUD.CaddieHint? { advice ?? hud?.caddie }

    var isSilent: Bool { hud != nil && currentAdvice == nil }
}

struct HUD: Decodable, Equatable {
    struct Hole: Decodable, Equatable {
        let number: Int
        let par: Int?
    }

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

    struct OverlayMini: Decodable, Equatable {
        struct Distances: Decodable, Equatable {
            let f: Double
            let m: Double
            let b: Double
        }

        enum PinSection: String, Decodable {
            case front
            case middle
            case back

            var shortLabel: String {
                switch self {
                case .front: return "front"
                case .middle: return "mid"
                case .back: return "back"
                }
            }
        }

        struct Pin: Decodable, Equatable {
            let section: PinSection
        }

        let fmb: Distances
        let pin: Pin?
    }

    let version: Int
    let timestamp: TimeInterval
    let fmb: Distances
    let playsLikePct: Double
    let wind: Wind
    let strategy: Strategy?
    let tournamentSafe: Bool
    let caddie: CaddieHint?
    let overlayMini: OverlayMini?
    let hole: Hole?

    private enum CodingKeys: String, CodingKey {
        case version = "v"
        case timestamp = "ts"
        case fmb
        case playsLikePct
        case wind
        case strategy
        case tournamentSafe
        case caddie
        case overlayMini
        case hole
    }
}

extension WatchHUDModel {
    static func previewModel() -> WatchHUDModel {
        let model = WatchHUDModel()
        let hint = HUD.CaddieHint(
            club: "8i",
            carryM: 142,
            totalM: 152,
            aim: .init(dir: .L, offsetM: 4),
            risk: .neutral,
            confidence: 0.72
        )
        let overlay = HUD.OverlayMini(
            fmb: .init(f: 128, m: 136, b: 144),
            pin: .init(section: .middle)
        )
        let snapshot = HUD(
            version: 1,
            timestamp: Date().timeIntervalSince1970,
            fmb: .init(front: 134, middle: 141, back: 148),
            playsLikePct: 5.2,
            wind: .init(mps: 3.4, deg: 215),
            strategy: .init(profile: .neutral, offsetM: -3, carryM: 140),
            tournamentSafe: false,
            caddie: hint,
            overlayMini: overlay,
            hole: .init(number: 7, par: 4)
        )
        model.update(with: snapshot)
        return model
    }
}
