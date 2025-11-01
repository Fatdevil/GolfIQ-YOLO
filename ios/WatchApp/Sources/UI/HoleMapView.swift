import Foundation
import SwiftUI

struct HoleMapView: View {
  @Environment(\.scenePhase) private var scenePhase
  @EnvironmentObject private var bridge: WatchBridge

  let hole: HoleModel?
  let playerLocation: HolePoint?
  let targetLocation: HolePoint?
  let tournamentSafe: Bool
  let onTargetMoved: (HolePoint) -> Void

  @State private var canvasSize: CGSize = .zero
  @State private var idleTimer: Timer?

  var body: some View {
    VStack {
      if let hole {
        Canvas { context, size in
          if canvasSize != size {
            DispatchQueue.main.async { self.canvasSize = size }
          }
          renderHole(hole, in: context, size: size)
          if let playerLocation {
            renderMarker(playerLocation, color: .blue, in: context, size: size, hole: hole)
          }
          if let targetLocation {
            renderMarker(targetLocation, color: .orange, in: context, size: size, hole: hole)
          }
        }
        .gesture(DragGesture(minimumDistance: 0).onEnded { value in
          guard let hole else { return }
          let bbox = hole.bbox
          guard bbox.maxLat > bbox.minLat, bbox.maxLon > bbox.minLon, canvasSize != .zero else { return }
          let fracX = min(max(Double(value.location.x / canvasSize.width), 0), 1)
          let fracY = min(max(Double(value.location.y / canvasSize.height), 0), 1)
          let lat = bbox.minLat + (bbox.maxLat - bbox.minLat) * fracY
          let lon = bbox.minLon + (bbox.maxLon - bbox.minLon) * fracX
          onTargetMoved(HolePoint(lat: lat, lon: lon))
        })
      } else {
        ProgressView()
      }
    }
    .onChange(of: scenePhase) { _, newPhase in
      bridge.scenePhase = newPhase
    }
    .onReceive(bridge.redrawPublisher) { _ in
      scheduleIdleUpdate()
    }
  }

  private func scheduleIdleUpdate() {
    idleTimer?.invalidate()
    idleTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { _ in
      bridge.requestIdleUpdate()
    }
  }

  private func renderHole(_ hole: HoleModel, in context: GraphicsContext, size: CGSize) {
    let fairwayColor = Color.green.opacity(tournamentSafe ? 0.6 : 0.3)
    hole.fairways.forEach { polygon in
      drawPolygon(polygon, color: fairwayColor, in: context, size: size, hole: hole)
    }

    let greenColor = Color.green.opacity(tournamentSafe ? 0.9 : 0.5)
    hole.greens.forEach { polygon in
      drawPolygon(polygon, color: greenColor, in: context, size: size, hole: hole)
    }

    let bunkerColor = Color.yellow.opacity(0.5)
    hole.bunkers.forEach { polygon in
      drawPolygon(polygon, color: bunkerColor, in: context, size: size, hole: hole)
    }
  }

  private func drawPolygon(
    _ polygon: HolePolygon,
    color: Color,
    in context: GraphicsContext,
    size: CGSize,
    hole: HoleModel
  ) {
    guard polygon.count > 2 else { return }
    var path = Path()
    polygon.enumerated().forEach { index, point in
      let projected = project(point, within: hole.bbox, canvas: size)
      if index == 0 {
        path.move(to: projected)
      } else {
        path.addLine(to: projected)
      }
    }
    path.closeSubpath()
    context.fill(path, with: .color(color))
  }

  private func renderMarker(
    _ point: HolePoint,
    color: Color,
    in context: GraphicsContext,
    size: CGSize,
    hole: HoleModel
  ) {
    let center = project(point, within: hole.bbox, canvas: size)
    let rect = CGRect(x: center.x - 4, y: center.y - 4, width: 8, height: 8)
    context.fill(Path(ellipseIn: rect), with: .color(color))
  }

  private func project(_ point: HolePoint, within bbox: HoleBoundingBox, canvas: CGSize) -> CGPoint {
    let fracX = (point.lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)
    let fracY = (point.lat - bbox.minLat) / (bbox.maxLat - bbox.minLat)
    return CGPoint(
      x: canvas.width * fracX,
      y: canvas.height * fracY
    )
  }
}
