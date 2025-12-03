import SwiftUI

struct MainMenuView: View {
    @EnvironmentObject var hudModel: WatchHUDModel
    @EnvironmentObject var tempoTrainerModel: TempoTrainerModel
    @EnvironmentObject var caddieHudModel: CaddieHudModel

    var body: some View {
        NavigationStack {
            List {
                NavigationLink("Round HUD") {
                    HUDMainView()
                        .environmentObject(hudModel)
                        .environmentObject(tempoTrainerModel)
                }
                NavigationLink("Caddie HUD") {
                    CaddieHudView()
                        .environmentObject(caddieHudModel)
                }
            }
            .navigationTitle("GolfIQ")
        }
    }
}

#Preview {
    MainMenuView()
        .environmentObject(WatchHUDModel.previewModel())
        .environmentObject(TempoTrainerModel())
        .environmentObject(CaddieHudModel())
}
