import SwiftUI

@main
struct WatchHUDApp: App {
    @StateObject private var model: WatchHUDModel
    private let sessionDelegate: SessionDelegate

    init() {
        let model = WatchHUDModel()
        _model = StateObject(wrappedValue: model)
        sessionDelegate = SessionDelegate(model: model)
    }

    var body: some Scene {
        WindowGroup {
            HUDMainView()
                .environmentObject(model)
        }
    }
}
