import SwiftUI
import XCTest
@testable import WatchHUD

final class HUDMainViewTests: XCTestCase {
    func testPreviewModelProvidesHole() {
        let model = WatchHUDModel.previewModel()
        XCTAssertNotNil(model.hud)
        XCTAssertEqual(model.holeNumber, 7)

        let view = HUDMainView().environmentObject(model)
        XCTAssertNotNil(view.body)
    }
}
