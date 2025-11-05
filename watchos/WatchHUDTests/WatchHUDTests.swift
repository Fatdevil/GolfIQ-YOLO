import XCTest
@testable import WatchHUD

final class WatchHUDTests: XCTestCase {
    func testJsonRoundTrip() {
        let s = #"{"v":1,"ts":1,"fmb":{"front":150,"middle":155,"back":160},"tournamentSafe":true}"#
        XCTAssertFalse(s.isEmpty)
        // If you have a decode function, call it and assert fields.
    }

    func testClearsAdviceWhenCaddieMissing() {
        let model = WatchHUDModel()

        let payloadWithCaddie = #"{"v":1,"ts":1,"fmb":{"front":150,"middle":155,"back":160},"playsLikePct":1.0,"wind":{"mps":3.0,"deg":90.0},"tournamentSafe":true,"caddie":{"club":"8I","carry_m":140.0,"total_m":150.0,"aim":{"dir":"C"},"risk":"neutral"}}"#
        let payloadWithoutCaddie = #"{"v":1,"ts":2,"fmb":{"front":150,"middle":155,"back":160},"playsLikePct":1.0,"wind":{"mps":3.0,"deg":90.0},"tournamentSafe":true}"#

        model.update(with: Data(payloadWithCaddie.utf8))
        flushMainQueue()
        XCTAssertEqual(model.advice?.club, "8I")

        model.update(with: Data(payloadWithoutCaddie.utf8))
        flushMainQueue()
        XCTAssertNil(model.advice)
    }

    func testOverlayMiniDecode() {
        let model = WatchHUDModel()
        let payload = #"{"v":1,"ts":3,"fmb":{"front":150,"middle":155,"back":160},"playsLikePct":1.0,"wind":{"mps":3.0,"deg":90.0},"tournamentSafe":true,"overlayMini":{"fmb":{"f":148,"m":156,"b":164},"pin":{"section":"back"}}}"#
        model.update(with: Data(payload.utf8))
        flushMainQueue()
        XCTAssertEqual(model.hud?.overlayMini?.fmb.f, 148)
        XCTAssertEqual(model.hud?.overlayMini?.pin?.section, .back)
    }

    private func flushMainQueue() {
        let mainQueueExpectation = expectation(description: "flush main queue")
        DispatchQueue.main.async {
            mainQueueExpectation.fulfill()
        }
        wait(for: [mainQueueExpectation], timeout: 0.1)
    }
}
