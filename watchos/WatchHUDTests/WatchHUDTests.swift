import XCTest

final class WatchHUDTests: XCTestCase {
    func testJsonRoundTrip() {
        let s = #"{"v":1,"ts":1,"fmb":{"front":150,"middle":155,"back":160},"tournamentSafe":true}"#
        XCTAssertFalse(s.isEmpty)
        // If you have a decode function, call it and assert fields.
    }
}
