import XCTest
@testable import WatchHUD

final class WatchHUDModelTests: XCTestCase {
    func testDecodesHUDPayload() throws {
        let json = """
        {"v":1,"ts":1716400000000,"fmb":{"front":128,"middle":134,"back":140},"playsLikePct":6.5,"wind":{"mps":3.2,"deg":270},"strategy":{"profile":"neutral","offset_m":-4,"carry_m":136},"tournamentSafe":false}
        """
        guard let data = json.data(using: .utf8) else {
            XCTFail("Failed to encode JSON payload")
            return
        }

        let model = WatchHUDModel()
        model.update(with: data)

        let snapshot = try XCTUnwrap(model.hud)
        XCTAssertEqual(snapshot.version, 1)
        XCTAssertEqual(snapshot.fmb.front, 128)
        XCTAssertEqual(snapshot.playsLikePct, 6.5)
        XCTAssertEqual(snapshot.tournamentSafe, false)
        let strategy = try XCTUnwrap(snapshot.strategy)
        XCTAssertEqual(strategy.profile, .neutral)
        XCTAssertEqual(strategy.offsetM, -4)
        XCTAssertEqual(strategy.carryM, 136)
    }
}
