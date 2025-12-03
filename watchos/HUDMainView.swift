import SwiftUI

struct HUDMainView: View {
    @EnvironmentObject var hudModel: WatchHUDModel
    @EnvironmentObject var tempoTrainerModel: TempoTrainerModel

    var body: some View {
        Group {
            if hudModel.hud != nil {
                VStack(spacing: 8) {
                    header
                    distances
                    playsLike
                    adviceSection
                    tempoTrainer
                    Spacer(minLength: 0)
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
        .padding(10)
        .minimumScaleFactor(0.7)
        .overlay(alignment: .bottom) {
            if let toast = hudModel.toast {
                Text(toast)
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.black.opacity(0.8))
                    .cornerRadius(12)
                    .padding(.bottom, 10)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            if let hole = hudModel.holeNumber {
                Text("H\(hole)")
                    .font(.headline)
            }
            if let par = hudModel.par {
                Text("Par \(par)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var distances: some View {
        HStack(spacing: 8) {
            distanceColumn(label: "F", value: hudModel.toFront_m)
            distanceColumn(label: "M", value: hudModel.toMiddle_m)
            distanceColumn(label: "B", value: hudModel.toBack_m)
        }
        .font(.system(size: 18, weight: .semibold, design: .rounded))
    }

    private func distanceColumn(label: String, value: Double?) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(formattedDistance(value))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
    }

    private var playsLike: some View {
        Group {
            if let adjustment = hudModel.playsLikeAdjustment_m {
                Text(playsLikeText(adjustment))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if let pct = hudModel.playsLikePct {
                Text(String(format: "Plays like: %+.1f%%", pct))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var adviceSection: some View {
        Group {
            if let advice = hudModel.currentAdvice {
                Text(advice.titleText)
                    .font(.caption)
                    .bold()
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let summary = advice.summaryText {
                    Text(summary)
                        .font(.caption2)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button(action: {
                    hudModel.acceptAdvice()
                }) {
                    Text("Use club")
                        .font(.caption2.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)
            } else if hudModel.isSilent {
                Text("Caddie silent")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var tempoTrainer: some View {
        Group {
            if tempoTrainerModel.target != nil {
                TempoTrainerView(model: tempoTrainerModel)
            }
        }
    }

    private func formattedDistance(_ value: Double?) -> String {
        guard let value else { return "–" }
        return String(Int(round(value)))
    }

    private func playsLikeText(_ adjustment: Double) -> String {
        if abs(adjustment) < 1 {
            return "Plays like: even"
        } else if adjustment > 0 {
            return "Plays like: +\(Int(round(adjustment))) m"
        } else {
            return "Plays like: \(Int(round(adjustment))) m"
        }
    }
}

private extension WatchHUDModel.HUD.CaddieHint {
    var titleText: String {
        if let title = confidenceTitle {
            return title
        }
        return club
    }

    var summaryText: String? {
        var parts: [String] = []
        if let aim = aim {
            switch aim.dir {
            case .L:
                if let offset = aim.offsetM { parts.append("Aim L \(Int(abs(offset).rounded()))m") }
                else { parts.append("Aim L") }
            case .R:
                if let offset = aim.offsetM { parts.append("Aim R \(Int(abs(offset).rounded()))m") }
                else { parts.append("Aim R") }
            case .C:
                parts.append("Aim C")
            }
        }
        parts.append("Carry \(Int(carryM.rounded()))m")
        if let total = totalM {
            parts.append("Total \(Int(total.rounded()))m")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var confidenceTitle: String? {
        guard let confidence else { return nil }
        let percentage = Int((confidence * 100).rounded())
        return "Confidence \(percentage)%"
    }
}

#Preview {
    HUDMainView()
        .environmentObject(WatchHUDModel.previewModel())
        .environmentObject(TempoTrainerModel())
}
