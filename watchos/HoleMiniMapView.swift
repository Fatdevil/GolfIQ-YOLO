import SwiftUI
import os.log

struct HoleMiniMapConfiguration: Equatable {
    struct Marker: Equatable {
        let label: String
        let distance: Double
        let normalizedY: CGFloat
    }

    struct Pin: Equatable {
        let label: String
        let normalizedY: CGFloat
    }

    let markers: [Marker]
    let pin: Pin?
}

struct HoleMiniMapView: View {
    private enum Constants {
        static let backgroundColor = Color.green.opacity(0.25)
        static let fairwayColor = Color.green.opacity(0.45)
        static let borderColor = Color.white.opacity(0.8)
        static let markerColor = Color.white
        static let markerTextColor = Color.black
        static let pinColor = Color.red
        static let minZoom: CGFloat = 0.85
        static let maxZoom: CGFloat = 1.60
    }

    enum Interaction: String {
        case zoom
        case pan
        case tapTarget = "tap_target"
    }

    static let minZoom = Constants.minZoom
    static let maxZoom = Constants.maxZoom

    let configuration: HoleMiniMapConfiguration
    let tournamentSafe: Bool

    @State private var zoom: CGFloat = Constants.minZoom
    @State private var storedPan: CGSize = .zero
    @State private var activePan: CGSize = .zero
    @State private var canvasSize: CGSize = .zero
    @State private var panInteractionEmitted = false

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            Canvas { context, _ in
                updateCanvasSizeIfNeeded(size)
                let start = CFAbsoluteTimeGetCurrent()
                defer {
                    let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000
                    WatchMiniMapTelemetry.shared.emitRender(ms: elapsed)
                }
                drawBackground(in: context, canvasSize: size)
                drawFairway(in: context)
                drawMarkers(in: context)
                drawPin(in: context)
            }
            .focusable(true)
            .digitalCrownRotation(
                Binding(
                    get: { zoom },
                    set: { newValue in
                        let clamped = Self.clampZoom(newValue)
                        if clamped != zoom {
                            zoom = clamped
                            emitInteraction(.zoom)
                        } else {
                            zoom = clamped
                        }
                        clampPanForCurrentState()
                    }
                ),
                from: Constants.minZoom,
                through: Constants.maxZoom,
                by: 0.01,
                sensitivity: .low,
                isContinuous: true,
                isHapticFeedbackEnabled: true
            )
            .gesture(
                DragGesture()
                    .onChanged { value in
                        let proposed = CGSize(
                            width: storedPan.width + value.translation.width,
                            height: storedPan.height + value.translation.height
                        )
                        let clamped = Self.clampPan(proposed, canvasSize: size, zoom: zoom)
                        activePan = clamped
                        if !panInteractionEmitted {
                            panInteractionEmitted = true
                            emitInteraction(.pan)
                        }
                    }
                    .onEnded { value in
                        let proposed = CGSize(
                            width: storedPan.width + value.translation.width,
                            height: storedPan.height + value.translation.height
                        )
                        storedPan = Self.clampPan(proposed, canvasSize: size, zoom: zoom)
                        activePan = storedPan
                        panInteractionEmitted = false
                    }
            )
            .simultaneousGesture(
                TapGesture()
                    .onEnded {
                        emitInteraction(.tapTarget)
                    }
            )
            .onChange(of: size) { _, newSize in
                canvasSize = newSize
                clampPanForCurrentState()
            }
        }
        .frame(height: 140)
    }

    static func clampZoom(_ value: CGFloat) -> CGFloat {
        min(max(value, Constants.minZoom), Constants.maxZoom)
    }

    static func clampPan(_ pan: CGSize, canvasSize: CGSize, zoom: CGFloat) -> CGSize {
        guard zoom > 1 else { return .zero }
        let base = min(canvasSize.width, canvasSize.height)
        guard base > 0 else { return .zero }
        let maxOffset = base * (zoom - 1) / 2
        let clampedX = pan.width.clamped(to: -maxOffset...maxOffset)
        let clampedY = pan.height.clamped(to: -maxOffset...maxOffset)
        return CGSize(width: clampedX, height: clampedY)
    }

    private func updateCanvasSizeIfNeeded(_ size: CGSize) {
        guard canvasSize != size else { return }
        DispatchQueue.main.async {
            canvasSize = size
            clampPanForCurrentState()
        }
    }

    private func clampPanForCurrentState() {
        guard canvasSize != .zero else { return }
        let clamped = Self.clampPan(storedPan, canvasSize: canvasSize, zoom: zoom)
        if clamped != storedPan {
            storedPan = clamped
        }
        activePan = clamped
    }

    private func drawBackground(in context: GraphicsContext, canvasSize: CGSize) {
        let base = min(canvasSize.width, canvasSize.height)
        var transform = CGAffineTransform.identity
        transform = transform.translatedBy(x: canvasSize.width / 2 + activePan.width, y: canvasSize.height / 2 + activePan.height)
        transform = transform.scaledBy(x: base * zoom, y: base * zoom)
        transform = transform.translatedBy(x: -0.5, y: -0.5)
        context.concatenate(transform)

        let backgroundRect = CGRect(x: 0, y: 0, width: 1, height: 1)
        context.fill(Path(backgroundRect), with: .color(Constants.backgroundColor))
        context.stroke(Path(backgroundRect), with: .color(Constants.borderColor), lineWidth: 0.01)
    }

    private func drawFairway(in context: GraphicsContext) {
        let fairwayPath = Path { path in
            path.move(to: CGPoint(x: 0.35, y: 0.05))
            path.addQuadCurve(to: CGPoint(x: 0.65, y: 0.25), control: CGPoint(x: 0.75, y: 0.0))
            path.addLine(to: CGPoint(x: 0.65, y: 0.75))
            path.addQuadCurve(to: CGPoint(x: 0.35, y: 0.95), control: CGPoint(x: 0.25, y: 1.0))
            path.addLine(to: CGPoint(x: 0.35, y: 0.25))
            path.addQuadCurve(to: CGPoint(x: 0.35, y: 0.05), control: CGPoint(x: 0.25, y: 0.0))
            path.closeSubpath()
        }
        let opacityMultiplier: Double = tournamentSafe ? 0.6 : 1.0
        let color = Constants.fairwayColor.opacity(opacityMultiplier)
        context.fill(fairwayPath, with: .color(color))
    }

    private func drawMarkers(in context: GraphicsContext) {
        for marker in configuration.markers {
            let center = CGPoint(x: 0.5, y: marker.normalizedY)
            let circleRect = CGRect(x: center.x - 0.04, y: center.y - 0.04, width: 0.08, height: 0.08)
            context.fill(Path(ellipseIn: circleRect), with: .color(Constants.markerColor))
            let text = Text("\(marker.label) \(distanceString(marker.distance))")
                .font(.system(size: 0.08, weight: .semibold))
                .foregroundColor(Constants.markerTextColor)
            context.draw(text, at: CGPoint(x: 0.5, y: marker.normalizedY - 0.07), anchor: .center)
        }
    }

    private func drawPin(in context: GraphicsContext) {
        guard let pin = configuration.pin else { return }
        let baseY = pin.normalizedY
        let width: CGFloat = 0.06
        let height: CGFloat = 0.12
        let path = Path { path in
            path.move(to: CGPoint(x: 0.5, y: baseY - height / 2))
            path.addLine(to: CGPoint(x: 0.5 + width / 2, y: baseY))
            path.addLine(to: CGPoint(x: 0.5 - width / 2, y: baseY))
            path.closeSubpath()
        }
        context.fill(path, with: .color(Constants.pinColor))
        let stem = Path(CGRect(x: 0.495, y: baseY, width: 0.01, height: 0.15))
        context.fill(stem, with: .color(Constants.pinColor))
        let text = Text(pin.label)
            .font(.system(size: 0.07, weight: .bold))
            .foregroundColor(.white)
        context.draw(text, at: CGPoint(x: 0.5, y: baseY - height / 2 - 0.05), anchor: .center)
    }

    private func emitInteraction(_ interaction: Interaction) {
        WatchMiniMapTelemetry.shared.emitInteraction(interaction)
    }

    private func distanceString(_ value: Double) -> String {
        String(format: "%.0f", value)
    }
}

private extension CGFloat {
    func clamped(to range: ClosedRange<CGFloat>) -> CGFloat {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

final class WatchMiniMapTelemetry {
    static let shared = WatchMiniMapTelemetry()

    private let log = OSLog(subsystem: "com.golfiq.watchhud", category: "MiniMap")

    private init() {}

    func emitRender(ms: Double) {
        os_log("watch.minimap.render_ms %{public}.2f", log: log, type: .info, ms)
    }

    func emitInteraction(_ interaction: HoleMiniMapView.Interaction) {
        os_log("watch.minimap.interaction %{public}@", log: log, type: .info, interaction.rawValue)
    }
}
