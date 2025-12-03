import SwiftUI

struct CaddieHudView: View {
    @EnvironmentObject var model: CaddieHudModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if model.payload != nil {
                content
            } else {
                emptyState
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .navigationTitle("Caddie HUD")
    }

    private var header: some View {
        HStack {
            if let hole = model.holeLabel {
                Text(hole)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Text("On-course HUD")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let clubLine = model.clubLine {
                Text("Club: \(clubLine)")
                    .font(.footnote)
            }
            if let primary = model.primaryDistanceText {
                Text(primary)
                    .font(.title3)
                    .fontWeight(.bold)
                    .monospacedDigit()
            }
            if let secondary = model.secondaryDistanceText {
                Text(secondary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let risk = model.riskProfileLabel {
                Text(risk)
                    .font(.caption)
                    .fontWeight(.semibold)
            }
            if let hint = model.riskHint {
                Text(hint)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("No recommendation yet")
                .font(.headline)
            Text("Open GolfIQ Caddie on your phone during a round to get live recommendations.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    NavigationStack {
        CaddieHudView()
            .environmentObject(CaddieHudModel())
    }
}
