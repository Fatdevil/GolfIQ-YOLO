import Foundation
import SwiftUI

struct OverlayMiniBridge {
    static func configuration(from mini: HUD.OverlayMini) -> HoleMiniMapConfiguration {
        let markers: [HoleMiniMapConfiguration.Marker] = [
            .init(label: "F", distance: mini.fmb.f, normalizedY: 0.2),
            .init(label: "M", distance: mini.fmb.m, normalizedY: 0.5),
            .init(label: "B", distance: mini.fmb.b, normalizedY: 0.8),
        ]
        let pin = mini.pin.map { pin -> HoleMiniMapConfiguration.Pin in
            let normalizedY: CGFloat
            switch pin.section {
            case .front:
                normalizedY = 0.2
            case .middle:
                normalizedY = 0.5
            case .back:
                normalizedY = 0.8
            }
            return .init(label: pin.section.shortLabel.uppercased(), normalizedY: normalizedY)
        }
        return HoleMiniMapConfiguration(markers: markers, pin: pin)
    }
}
