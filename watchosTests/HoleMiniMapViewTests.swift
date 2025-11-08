import XCTest
import CoreGraphics
@testable import WatchHUD

final class CrownZoomRangeTests: XCTestCase {
    func testClampZoomEnforcesRange() {
        XCTAssertEqual(HoleMiniMapView.clampZoom(0.1), HoleMiniMapView.minZoom, accuracy: 0.0001)
        XCTAssertEqual(HoleMiniMapView.clampZoom(10), HoleMiniMapView.maxZoom, accuracy: 0.0001)
        let midpoint = (HoleMiniMapView.minZoom + HoleMiniMapView.maxZoom) / 2
        XCTAssertEqual(HoleMiniMapView.clampZoom(midpoint), midpoint, accuracy: 0.0001)
    }

    func testClampPanRespectsExtent() {
        let size = CGSize(width: 160, height: 120)
        let zoom: CGFloat = 1.5
        let maxOffset = min(size.width, size.height) * (zoom - 1) / 2
        let clamped = HoleMiniMapView.clampPan(CGSize(width: 500, height: -500), canvasSize: size, zoom: zoom)
        XCTAssertEqual(clamped.width, maxOffset, accuracy: 0.001)
        XCTAssertEqual(clamped.height, -maxOffset, accuracy: 0.001)
        let zero = HoleMiniMapView.clampPan(CGSize(width: 10, height: -10), canvasSize: size, zoom: 0.9)
        XCTAssertEqual(zero, .zero)
    }
}

final class OverlayPresenceTests: XCTestCase {
    func testMiniMapViewInstantiates() {
        let overlay = HUD.OverlayMini(
            fmb: .init(f: 120, m: 132, b: 144),
            pin: .init(section: .middle)
        )
        let configuration = OverlayMiniBridge.configuration(from: overlay)
        let view = HoleMiniMapView(configuration: configuration, tournamentSafe: false)
        XCTAssertNotNil(view.body)
    }
}
