import Foundation

public enum PlaysLikeQuality: String {
    case good
    case warn
    case low
}

public struct PlaysLikeComponents {
    public let slopeM: Double
    public let windM: Double
}

public struct PlaysLikeResult {
    public let distanceEff: Double
    public let components: PlaysLikeComponents
    public let quality: PlaysLikeQuality
}

public struct PlaysLikeOptions {
    public let kS: Double
    public let kHW: Double
    public let warnThresholdRatio: Double
    public let lowThresholdRatio: Double

    public init(kS: Double = 1.0, kHW: Double = 2.5, warnThresholdRatio: Double = 0.05, lowThresholdRatio: Double = 0.12) {
        self.kS = max(0.2, min(kS, 3.0))
        self.kHW = max(0.5, min(kHW, 6.0))
        self.warnThresholdRatio = warnThresholdRatio
        self.lowThresholdRatio = max(lowThresholdRatio, warnThresholdRatio)
    }
}

public enum PlaysLikeService {
    public static func computeSlopeAdjust(D: Double, deltaH: Double, kS: Double = 1.0) -> Double {
        guard D.isFinite, D > 0, deltaH.isFinite else { return 0 }
        let clamped = max(0.2, min(kS, 3.0))
        return deltaH * clamped
    }

    public static func computeWindAdjust(D: Double, wParallel: Double, kHW: Double = 2.5) -> Double {
        guard D.isFinite, D > 0, wParallel.isFinite else { return 0 }
        let clamped = max(0.5, min(kHW, 6.0))
        return wParallel * clamped
    }

    public static func compute(D: Double, deltaH: Double, wParallel: Double, opts: PlaysLikeOptions = PlaysLikeOptions()) -> PlaysLikeResult {
        let distance = D.isFinite ? max(D, 0) : 0
        let slope = computeSlopeAdjust(D: distance, deltaH: deltaH, kS: opts.kS)
        let wind = computeWindAdjust(D: distance, wParallel: wParallel, kHW: opts.kHW)
        let eff = distance + slope + wind
        let total = abs(slope) + abs(wind)
        let ratio = distance > 0 ? total / distance : Double.infinity
        let quality: PlaysLikeQuality
        if ratio <= opts.warnThresholdRatio {
            quality = .good
        } else if ratio <= opts.lowThresholdRatio {
            quality = .warn
        } else {
            quality = .low
        }
        return PlaysLikeResult(
            distanceEff: eff,
            components: PlaysLikeComponents(slopeM: slope, windM: wind),
            quality: quality
        )
    }
}
