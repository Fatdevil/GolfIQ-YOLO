import SwiftUI

struct TempoTrainerView: View {
    @ObservedObject var model: TempoTrainerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tempo Trainer")
                .font(.headline)
            if let target = model.target {
                Text(String(format: "Target %.1f : 1", target.targetRatio))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("Backswing ~\(target.targetBackswingMs) ms · Downswing ~\(target.targetDownswingMs) ms")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("Waiting for target from phone")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Ready") {
                    model.startCue()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)

                Button("Log swing") {
                    model.simulateAndRecordSwing()
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
                .disabled(model.target == nil)
            }
            if let result = model.lastResult {
                Text(String(format: "Tempo: %.2f : 1", result.ratio))
                    .font(.caption)
                Text(result.withinBand ? "Inside target band" : "Outside target band")
                    .font(.caption2)
                    .foregroundStyle(result.withinBand ? .green : .orange)
            }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemBackground)))
    }
}

#Preview {
    let model = TempoTrainerModel()
    model.activate(TempoTrainerTarget(targetRatio: 3.0, tolerance: 0.2, targetBackswingMs: 900, targetDownswingMs: 300))
    return TempoTrainerView(model: model)
}

