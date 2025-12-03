import SwiftUI

@main
struct WatchHUDApp: App {
    @StateObject private var model: WatchHUDModel
    @StateObject private var tempoTrainerModel: TempoTrainerModel
    private let sessionDelegate: SessionDelegate

    init() {
        let model = WatchHUDModel()
        _model = StateObject(wrappedValue: model)
        let tempoModel = TempoTrainerModel()
        _tempoTrainerModel = StateObject(wrappedValue: tempoModel)
        sessionDelegate = SessionDelegate(model: model, tempoModel: tempoModel)
    }

    var body: some Scene {
        WindowGroup {
            HUDMainView()
                .environmentObject(model)
                .environmentObject(tempoTrainerModel)
        }
    }
}
