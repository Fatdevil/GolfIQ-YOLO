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

    func testAppliesAdvicePayload() {
        let model = WatchHUDModel()
        model.applyAdvicePayload([
            "club": "9i",
            "carry_m": 135.0,
            "risk": "safe",
            "aim": ["dir": "L", "offset_m": 3.5],
        ])
        let advice = try XCTUnwrap(model.advice)
        XCTAssertEqual(advice.club, "9i")
        XCTAssertEqual(advice.carryM, 135.0)
        XCTAssertEqual(advice.risk, .safe)
        XCTAssertEqual(advice.aim?.dir, .L)
        XCTAssertEqual(advice.aim?.offsetM, 3.5)
    }

    func testAcceptAdviceSendsMessage() {
        let model = WatchHUDModel()
        model.applyAdvicePayload(["club": "8i", "carry_m": 142.0])
        var captured: [String: Any]?
        model.registerMessageSender { payload in
            captured = payload
        }
        model.acceptAdvice()
        XCTAssertEqual(captured?["type"] as? String, "CADDIE_ACCEPTED_V1")
        XCTAssertEqual(captured?["club"] as? String, "8i")
    }
}
