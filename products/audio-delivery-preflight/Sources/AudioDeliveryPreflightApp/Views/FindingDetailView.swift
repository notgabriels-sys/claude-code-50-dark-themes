import SwiftUI
import PreflightCore

struct FindingDetailView: View {
    let finding: Finding

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(finding.title, systemImage: severitySymbol(finding.severity))
                .font(.title3.bold())
                .accessibilityLabel("\(severityText(finding.severity)): \(finding.title)")
            Text(finding.explanation)

            detailSection("Affected relative paths") {
                if finding.affectedPaths.isEmpty {
                    Text("No individual file path applies.")
                } else {
                    ForEach(finding.affectedPaths, id: \.self) { path in
                        Text(path.value).font(.system(.body, design: .monospaced))
                    }
                }
            }

            detailSection("Expected condition") { Text(finding.expected) }
            detailSection("Measured evidence") {
                if finding.evidence.isEmpty {
                    Text("No additional measured evidence was available.")
                } else {
                    ForEach(Array(finding.evidence.enumerated()), id: \.offset) { _, evidence in
                        Text("\(evidence.label): \(evidenceText(evidence.value))")
                    }
                }
            }
            detailSection("Suggested action") { Text(finding.suggestedAction) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("finding-detail")
    }

    @ViewBuilder
    private func detailSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.headline)
            content()
        }
    }
}
