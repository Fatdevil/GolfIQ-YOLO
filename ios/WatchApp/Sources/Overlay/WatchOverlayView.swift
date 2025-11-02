import SwiftUI

struct WatchOverlayView: View {
  @State private var snapshot: OverlaySnapshotV1DTO?
  @Environment(\.colorScheme) var scheme

  var body: some View {
    GeometryReader { geo in
      ZStack {
        OverlayCanvas(snapshot: snapshot, size: geo.size, colorScheme: scheme)
      }
    }
    .allowsHitTesting(false)
    .onReceive(WatchBridge.shared.overlayPublisher) { snap in
      withAnimation(.easeOut(duration: 0.15)) {
        snapshot = snap
      }
    }
  }
}
