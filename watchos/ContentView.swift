import SwiftUI

struct ContentView: View {
    @ObservedObject var model: WatchHUDModel

    var body: some View {
        HUDMainView()
            .environmentObject(model)
    }
}

#Preview {
    ContentView(model: WatchHUDModel.previewModel())
}
