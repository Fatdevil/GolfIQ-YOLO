import SwiftUI

struct ThermalProtectionBanner: View {
    let isVisible: Bool
    let message: String
    let onResume: () -> Void

    var body: some View {
        if isVisible {
            HStack(spacing: 12) {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(Color.white)
                    .multilineTextAlignment(.leading)
                Spacer()
                Button(action: onResume) {
                    Text("Try resume HUD")
                        .font(.subheadline)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(red: 0.12, green: 0.16, blue: 0.16))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.teal.opacity(0.6), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .transition(.move(edge: .top).combined(with: .opacity))
            .animation(.easeInOut(duration: 0.25), value: isVisible)
        }
    }
}

#Preview {
    ThermalProtectionBanner(isVisible: true, message: "Battery/thermal protection: switched to 2D.") {}
        .background(Color.black)
}
