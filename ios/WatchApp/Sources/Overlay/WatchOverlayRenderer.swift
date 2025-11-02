import SwiftUI

struct OverlayCanvas: View {
  let snapshot: OverlaySnapshotV1DTO?
  let size: CGSize
  let colorScheme: ColorScheme

  private struct Palette {
    let corridorFill: Color
    let corridorStroke: Color
    let ringFill: Color
    let ringStroke: Color
    let label: Color
  }

  private func palette(for scheme: ColorScheme) -> Palette {
    switch scheme {
    case .dark:
      return Palette(
        corridorFill: Color.blue.opacity(0.28),
        corridorStroke: Color.blue.opacity(0.55),
        ringFill: Color.cyan.opacity(0.24),
        ringStroke: Color.cyan.opacity(0.6),
        label: Color.white.opacity(0.9)
      )
    default:
      return Palette(
        corridorFill: Color.blue.opacity(0.22),
        corridorStroke: Color.blue.opacity(0.48),
        ringFill: Color.cyan.opacity(0.2),
        ringStroke: Color.cyan.opacity(0.55),
        label: Color.black.opacity(0.75)
      )
    }
  }

  private func point(from pair: [Double], canvas: CGSize) -> CGPoint? {
    guard pair.count == 2 else { return nil }
    let x = max(0, min(1, pair[0])) * canvas.width
    let y = max(0, min(1, pair[1])) * canvas.height
    if x.isFinite && y.isFinite {
      return CGPoint(x: x, y: y)
    }
    return nil
  }

  private func buildPath(from pairs: [[Double]], canvas: CGSize) -> Path? {
    guard !pairs.isEmpty else { return nil }
    var path = Path()
    var validCount = 0
    for (index, pair) in pairs.enumerated() {
      guard let point = point(from: pair, canvas: canvas) else { continue }
      validCount += 1
      if index == 0 {
        path.move(to: point)
      } else {
        path.addLine(to: point)
      }
    }
    if validCount >= 3 {
      path.closeSubpath()
      return path
    }
    return nil
  }

  private func centroid(of pairs: [[Double]], canvas: CGSize) -> CGPoint? {
    var sumX: Double = 0
    var sumY: Double = 0
    var count: Double = 0
    for pair in pairs {
      guard let point = point(from: pair, canvas: canvas) else { continue }
      sumX += Double(point.x)
      sumY += Double(point.y)
      count += 1
    }
    guard count > 0 else { return nil }
    return CGPoint(x: CGFloat(sumX / count), y: CGFloat(sumY / count))
  }

  var body: some View {
    Canvas { context, canvasSize in
      guard let snapshot else { return }
      let palette = palette(for: colorScheme)

      if let corridorPath = buildPath(from: snapshot.corridor, canvas: canvasSize) {
        context.fill(corridorPath, with: .color(palette.corridorFill))
        context.stroke(corridorPath, with: .color(palette.corridorStroke), lineWidth: 1.5)
      }

      if let ringPath = buildPath(from: snapshot.ring, canvas: canvasSize) {
        context.fill(ringPath, with: .color(palette.ringFill))
        context.stroke(ringPath, with: .color(palette.ringStroke), lineWidth: 1.5)
      }

      if snapshot.labelsAllowed, let p50 = snapshot.meta?.p50_m, let center = centroid(of: snapshot.ring, canvas: canvasSize) {
        let label = Text("\(Int(round(p50))) m").font(.caption2)
        context.draw(label.foregroundColor(palette.label), at: center)
      }
    }
    .frame(width: size.width, height: size.height)
  }
}
