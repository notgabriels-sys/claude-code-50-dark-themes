import SwiftUI

struct ScanningView: View {
    let model: AppModel

    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
                .accessibilityLabel("Scanning delivery folder")
            Text("Scanning locally")
                .font(.title2.bold())
            Text("Inventorying files, inspecting supported media, calculating checksums, and evaluating the selected requirements. Progress is phase-based, not a percentage.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 460)
            Button("Cancel Scan") { model.cancelScan() }
                .buttonStyle(.bordered)
                .keyboardShortcut(.escape, modifiers: [])
                .accessibilityIdentifier("cancel-scan-button")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onExitCommand { model.cancelScan() }
        .accessibilityIdentifier("scanning-view")
    }
}
