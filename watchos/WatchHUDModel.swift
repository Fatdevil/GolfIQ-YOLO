import Combine
import Foundation

final class WatchHUDModel: ObservableObject {
    @Published private(set) var hud: HUD?
    @Published private(set) var toast: String?

    private let decoder: JSONDecoder
    private var toastWorkItem: DispatchWorkItem?

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
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.hud = snapshot
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
