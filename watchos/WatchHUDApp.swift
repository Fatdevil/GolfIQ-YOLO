import SwiftUI

@main
struct WatchHUDApp: App {
    @StateObject private var model: WatchHUDModel
    @StateObject private var tempoTrainerModel: TempoTrainerModel
    @StateObject private var caddieHudModel: CaddieHudModel
    private let sessionDelegate: SessionDelegate

    init() {
        let model = WatchHUDModel()
        _model = StateObject(wrappedValue: model)
        let tempoModel = TempoTrainerModel()
        _tempoTrainerModel = StateObject(wrappedValue: tempoModel)
        let caddieModel = CaddieHudModel()
        _caddieHudModel = StateObject(wrappedValue: caddieModel)
        sessionDelegate = SessionDelegate(model: model, tempoModel: tempoModel, caddieHudModel: caddieModel)
    }

    var body: some Scene {
        WindowGroup {
            MainMenuView()
                .environmentObject(model)
                .environmentObject(tempoTrainerModel)
                .environmentObject(caddieHudModel)
        }
    }
}
