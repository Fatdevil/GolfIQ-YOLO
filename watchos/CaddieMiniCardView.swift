import SwiftUI

struct CaddieMiniCardView: View {
    let hint: WatchHUDModel.HUD.CaddieHint

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("🏌")
                Text(hint.club)
                    .font(.headline)
                    .fontWeight(.semibold)
                Spacer()
                Text("\(Int(hint.carryM.rounded()))m")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .monospacedDigit()
            }
            HStack(spacing: 8) {
                Text(aimText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let total = hint.totalM {
                    Text("Total \(Int(total.rounded()))m")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                Text(riskLabel)
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(riskColor)
                if let confidence = hint.confidence {
                    Text("Conf \(Int((confidence.clamped) * 100))%")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
        }
        .padding(8)
        .background(Color.black.opacity(0.2))
        .cornerRadius(12)
    }

    private var aimText: String {
        guard let aim = hint.aim else {
            return "Aim C"
        }
        switch aim.dir {
        case .L:
            if let offset = aim.offsetM {
                return "Aim L \(Int(abs(offset).rounded()))m"
            }
            return "Aim L"
        case .R:
            if let offset = aim.offsetM {
                return "Aim R \(Int(abs(offset).rounded()))m"
            }
            return "Aim R"
        case .C:
            return "Aim C"
        }
    }

    private var riskLabel: String {
        switch hint.risk {
        case .safe:
            return "Safe"
        case .neutral:
            return "Neutral"
        case .aggressive:
            return "Aggressive"
        }
    }

    private var riskColor: Color {
        switch hint.risk {
        case .safe:
            return Color.green
        case .neutral:
            return Color.blue
        case .aggressive:
            return Color.red
        }
    }
}

private extension Double {
    var clamped: Double {
        min(1.0, max(0.0, self))
    }
}

#Preview {
    CaddieMiniCardView(
        hint: WatchHUDModel.HUD.CaddieHint(
            club: "7i",
            carryM: 152,
            totalM: 164,
            aim: .init(dir: .R, offsetM: 5),
            risk: .neutral,
            confidence: 0.72
        )
    )
    .padding()
    .previewLayout(.sizeThatFits)
}
