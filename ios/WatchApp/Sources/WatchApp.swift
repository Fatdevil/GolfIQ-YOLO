import SwiftUI

@main
struct GolfIQWatchApp: App {
  @StateObject private var bridge = WatchBridge()
  @StateObject private var locationProvider = LocationProvider()

  var body: some Scene {
    WindowGroup {
      HoleMapView(
        hole: bridge.currentHole,
        playerLocation: bridge.playerLocation ?? locationProvider.latestLocation,
        targetLocation: bridge.targetLocation,
        tournamentSafe: bridge.tournamentSafe
      ) { target in
        bridge.emitTargetMoved(target)
      }
      .environmentObject(bridge)
    }
  }
}
