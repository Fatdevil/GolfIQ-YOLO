import SwiftUI

struct ContentView: View {
    @ObservedObject var model: WatchHUDModel

    var body: some View {
        Group {
            if let hud = model.hud {
                VStack(alignment: .leading, spacing: 12) {
                    fmbRow(for: hud)
                    if let advice = model.advice ?? hud.caddie {
                        CaddieMiniCardView(hint: advice)
                        Button("Use club") {
                            model.acceptAdvice()
                        }
                        .buttonStyle(.borderedProminent)
                        .font(.footnote)
                    }
                    playsLikeRow(for: hud)
                    if let mini = hud.overlayMini {
                        miniMapRow(for: mini, tournamentSafe: hud.tournamentSafe)
                    }
                    if !hud.tournamentSafe, let strategy = hud.strategy {
                        strategyRow(for: strategy)
                    }
                    Spacer()
                }
            } else {
                VStack(spacing: 8) {
                    ProgressView()
                    Text("Waiting for HUD")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                Text(toast)
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.black.opacity(0.75))
                    .cornerRadius(12)
                    .padding(.bottom, 12)
            }
        }
    }

    private func fmbRow(for hud: HUD) -> some View {
        HStack(spacing: 12) {
            distanceColumn(label: "F", value: hud.fmb.front)
            distanceColumn(label: "M", value: hud.fmb.middle)
            distanceColumn(label: "B", value: hud.fmb.back)
        }
    }

    private func distanceColumn(label: String, value: Double) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            Text(distanceString(value))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .monospacedDigit()
        }
    }

    private func playsLikeRow(for hud: HUD) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PL")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            Text(playsLikeString(hud.playsLikePct))
                .font(.title3)
                .fontWeight(.semibold)
                .monospacedDigit()
        }
    }

    private func miniMapRow(for overlay: HUD.OverlayMini, tournamentSafe: Bool) -> some View {
        let configuration = OverlayMiniBridge.configuration(from: overlay)
        let summary = miniMapSummaryText(for: overlay)
        return VStack(alignment: .leading, spacing: 6) {
            HoleMiniMapView(configuration: configuration, tournamentSafe: tournamentSafe)
            Text(summary)
                .font(.footnote)
                .fontWeight(.semibold)
                .monospacedDigit()
        }
    }

    private func miniMapSummaryText(for overlay: HUD.OverlayMini) -> String {
        let base = "F \(distanceString(overlay.fmb.f)) | M \(distanceString(overlay.fmb.m)) | B \(distanceString(overlay.fmb.b))"
        guard let pin = overlay.pin?.section else { return base }
        return "\(base) · Pin: \(pin.shortLabel)"
    }

    private func strategyRow(for strategy: HUD.Strategy) -> some View {
        HStack(spacing: 6) {
            Text(strategy.profile.displayName)
                .font(.subheadline)
                .fontWeight(.semibold)
            Text(offsetString(strategy.offsetM))
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(carryString(strategy.carryM))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .monospacedDigit()
    }

    private func distanceString(_ value: Double) -> String {
        String(format: "%.0f", value)
    }

    private func playsLikeString(_ value: Double) -> String {
        String(format: "%+.1f%%", value)
    }

    private func offsetString(_ value: Double) -> String {
        String(format: "%+.0fm", value)
    }

    private func carryString(_ value: Double) -> String {
        String(format: "carry %.0fm", value)
    }
}

private extension HUD.Strategy.Profile {
    var displayName: String {
        rawValue.capitalized
    }
}

#Preview {
    let model = WatchHUDModel()
    if let data = """
        {"v":1,"ts":1,"fmb":{"front":132,"middle":138,"back":144},"playsLikePct":6.5,"wind":{"mps":3.2,"deg":270},"strategy":{"profile":"neutral","offset_m":-4,"carry_m":136},"tournamentSafe":false,"overlayMini":{"fmb":{"f":128,"m":136,"b":144},"pin":{"section":"middle"}}}
        """.data(using: .utf8) {
        model.update(with: data)
    }
    return ContentView(model: model)
}
