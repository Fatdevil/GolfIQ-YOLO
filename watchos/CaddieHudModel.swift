import Foundation
import SwiftUI

struct CaddieHudPayload: Equatable {
    var roundId: String?
    var holeNumber: Int?
    var par: Int?
    var rawDistanceM: Double
    var playsLikeDistanceM: Double
    var slopeAdjustM: Double?
    var windAdjustM: Double?
    var club: String
    var intent: String
    var riskProfile: String
    var coreCarryMinM: Double?
    var coreCarryMaxM: Double?
    var coreSideMinM: Double?
    var coreSideMaxM: Double?
    var tailLeftProb: Double?
    var tailRightProb: Double?

    init?(_ dictionary: [String: Any]) {
        guard let rawDistanceM = Self.double(from: dictionary["rawDistanceM"]),
              let playsLikeDistanceM = Self.double(from: dictionary["playsLikeDistanceM"]),
              let club = dictionary["club"] as? String,
              let intent = dictionary["intent"] as? String,
              let riskProfile = dictionary["riskProfile"] as? String else {
            return nil
        }

        self.roundId = dictionary["roundId"] as? String
        self.holeNumber = dictionary["holeNumber"] as? Int
        self.par = dictionary["par"] as? Int
        self.rawDistanceM = rawDistanceM
        self.playsLikeDistanceM = playsLikeDistanceM
        self.slopeAdjustM = Self.double(from: dictionary["slopeAdjustM"])
        self.windAdjustM = Self.double(from: dictionary["windAdjustM"])
        self.club = club
        self.intent = intent
        self.riskProfile = riskProfile
        self.coreCarryMinM = Self.double(from: dictionary["coreCarryMinM"])
        self.coreCarryMaxM = Self.double(from: dictionary["coreCarryMaxM"])
        self.coreSideMinM = Self.double(from: dictionary["coreSideMinM"])
        self.coreSideMaxM = Self.double(from: dictionary["coreSideMaxM"])
        self.tailLeftProb = Self.double(from: dictionary["tailLeftProb"])
        self.tailRightProb = Self.double(from: dictionary["tailRightProb"])
    }

    private static func double(from value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue
        }
        return value as? Double
    }
}

final class CaddieHudModel: ObservableObject {
    @Published private(set) var payload: CaddieHudPayload?

    func handle(envelope: [String: Any]) {
        guard let type = envelope["type"] as? String else { return }
        switch type {
        case "hud.clear":
            publish(nil)
        case "hud.update":
            if let rawPayload = envelope["payload"] as? [String: Any], let parsed = CaddieHudPayload(rawPayload) {
                publish(parsed)
            }
        default:
            break
        }
    }

    func publish(_ payload: CaddieHudPayload?) {
        let apply = { [weak self] in
            self?.payload = payload
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    var holeLabel: String? {
        guard let hole = payload?.holeNumber else { return nil }
        var label = "Hole \(hole)"
        if let par = payload?.par {
            label += " · Par \(par)"
        }
        return label
    }

    var primaryDistanceText: String? {
        guard let distance = payload?.playsLikeDistanceM else { return nil }
        return "\(Int(distance.rounded())) m (Plays-like)"
    }

    var secondaryDistanceText: String? {
        guard let payload else { return nil }
        var parts: [String] = []
        parts.append("Raw: \(Int(payload.rawDistanceM.rounded())) m")
        if let slope = payload.slopeAdjustM, let wind = payload.windAdjustM {
            parts.append("Δ slope \(signedMeters(from: slope)), wind \(signedMeters(from: wind))")
        } else {
            parts.append("Plays like: \(Int(payload.playsLikeDistanceM.rounded())) m")
        }

        return parts.joined(separator: " · ")
    }

    var clubLine: String? {
        guard let payload else { return nil }
        let shape: String
        switch payload.intent.lowercased() {
        case "fade": shape = "fade"
        case "draw": shape = "draw"
        default: shape = "straight"
        }
        return "\(payload.club) · \(shape)"
    }

    var riskProfileLabel: String? {
        guard let payload else { return nil }
        return "Profile: \(payload.riskProfile.capitalized)"
    }

    var riskHint: String? {
        guard payload?.tailLeftProb != nil || payload?.tailRightProb != nil else { return nil }
        var parts: [String] = []
        if let left = payload?.tailLeftProb, left > 0 {
            parts.append("L ~\(percentage(from: left))%")
        }
        if let right = payload?.tailRightProb, right > 0 {
            parts.append("R ~\(percentage(from: right))%")
        }
        guard !parts.isEmpty else { return nil }
        return "Rare big miss " + parts.joined(separator: " / ")
    }

    private func percentage(from value: Double) -> Int {
        Int((value * 100).rounded())
    }

    private func signedMeters(from value: Double) -> String {
        let rounded = Int(value.rounded())
        return rounded >= 0 ? "+\(rounded) m" : "\(rounded) m"
    }
}
