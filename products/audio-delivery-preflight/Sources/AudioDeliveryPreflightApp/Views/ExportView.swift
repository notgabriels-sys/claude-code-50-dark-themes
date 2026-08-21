import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ExportView: View {
    let model: AppModel
    @State private var isExporting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("Export reports", systemImage: "square.and.arrow.up")
                .font(.largeTitle.bold())
            Text("Reports are created only after you choose a local destination. Source files remain unchanged; processing stays local.")
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("export-local-immutability-statement")

            ForEach(AppModel.ExportFormat.allCases) { format in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(format.title).fontWeight(.semibold)
                        Text(format.filename).font(.caption.monospaced()).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Choose destination…") {
                        chooseDestination(for: format)
                    }
                    .disabled(isExporting)
                    .accessibilityLabel("Choose destination for \(format.title)")
                    .accessibilityIdentifier("export-\(format.rawValue)-button")
                }
                .padding()
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }

            if let confirmation = model.exportConfirmationMessage {
                Label(confirmation, systemImage: "checkmark.circle")
                    .foregroundStyle(.green)
                    .accessibilityLabel(confirmation)
                    .accessibilityIdentifier("export-success-message")
            }

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("export-error-message")
            }

            HStack {
                Button("Back to results") { model.dismissExport() }
                    .disabled(isExporting)
                    .accessibilityIdentifier("back-to-results-button")
                Spacer()
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: 760, alignment: .leading)
        .accessibilityIdentifier("export-view")
    }

    private func chooseDestination(for format: AppModel.ExportFormat) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = format.filename
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.allowedContentTypes = [contentType(for: format)]
        panel.prompt = "Export"
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        isExporting = true
        Task { @MainActor in
            await model.export(format, to: destination)
            isExporting = false
        }
    }

    private func contentType(for format: AppModel.ExportFormat) -> UTType {
        switch format {
        case .html: .html
        case .json: .json
        case .checksums: .plainText
        }
    }
}
