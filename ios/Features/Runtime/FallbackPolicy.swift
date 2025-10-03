import Foundation

enum FallbackAction: String {
    case none
    case reduceHUD = "reduce_hud"
    case switchTo2D = "switch_to_2d"
}

enum FallbackPolicy {
    static let thermalOrder: [String] = ["nominal", "fair", "serious", "critical"]
    static let THERMAL_MAX = "serious"
    static let BATTERY_DROP_15M_MAX = 9.0

    static func evaluate(thermal: String, drop15m: Double) -> FallbackAction {
        let normalizedThermal = thermal.lowercased()
        let severityIndex = thermalOrder.firstIndex(of: normalizedThermal) ?? 0
        let thresholdIndex = thermalOrder.firstIndex(of: THERMAL_MAX) ?? (thermalOrder.count - 1)

        if severityIndex >= thresholdIndex {
            return .switchTo2D
        }

        if drop15m > BATTERY_DROP_15M_MAX {
            return .reduceHUD
        }

        return .none
    }
}
