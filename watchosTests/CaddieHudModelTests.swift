import XCTest
@testable import WatchHUD

final class CaddieHudModelTests: XCTestCase {
    func testAppliesUpdateEnvelope() {
        let model = CaddieHudModel()
        model.handle(envelope: [
            "type": "hud.update",
            "payload": [
                "roundId": "r1",
                "holeNumber": 7,
                "par": 4,
                "rawDistanceM": 146.0,
                "playsLikeDistanceM": 152.0,
                "club": "7i",
                "intent": "fade",
                "riskProfile": "safe",
                "tailLeftProb": 0.03,
            ],
        ])

        XCTAssertEqual(model.payload?.roundId, "r1")
        XCTAssertEqual(model.payload?.holeNumber, 7)
        XCTAssertEqual(model.payload?.par, 4)
        XCTAssertEqual(model.primaryDistanceText, "152 m")
        XCTAssertEqual(model.riskProfileLabel, "Profile: Safe")
        XCTAssertEqual(model.riskHint, "Rare big miss L ~3%")
    }

    func testClearEnvelopeRemovesPayload() {
        let model = CaddieHudModel()
        model.publish(CaddieHudPayload([
            "rawDistanceM": 120.0,
            "playsLikeDistanceM": 125.0,
            "club": "8i",
            "intent": "straight",
            "riskProfile": "normal",
        ]))

        model.handle(envelope: ["type": "hud.clear"])

        XCTAssertNil(model.payload)
    }
}
