import SwiftUI
import PreflightCore

struct ResultsView: View {
    private enum AccessibilityTarget: Hashable {
        case resultSummary
        case exportConfirmation
    }

    @Bindable var model: AppModel
    @AccessibilityFocusState private var focusedAccessibilityTarget: AccessibilityTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let result = model.result {
                HStack(alignment: .firstTextBaseline) {
                    Label(statusText(result.overallStatus), systemImage: statusSymbol(result.overallStatus))
                        .font(.largeTitle.bold())
                        .accessibilityLabel("Scan status: \(statusText(result.overallStatus))")
                        .accessibilityIdentifier("result-summary")
                        .accessibilityFocused($focusedAccessibilityTarget, equals: .resultSummary)
                    Spacer()
                    Button("Rescan") { model.rescan() }
                        .accessibilityIdentifier("rescan-button")
                    Button("Export reports") { model.showExport() }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("export-reports-button")
                }

                Text("Folder: \(result.selectedFolderName) · Preset: \(result.preset.name)")
                    .foregroundStyle(.secondary)

                if result.overallStatus == .ready {
                    Label("Technical checks passed. This is not artistic approval and does not guarantee distributor acceptance.", systemImage: "info.circle")
                        .accessibilityIdentifier("technical-boundary-statement")
                }

                if let error = model.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("results-error-message")
                }

                if let confirmation = model.exportConfirmationMessage {
                    Label(confirmation, systemImage: "checkmark.circle")
                        .foregroundStyle(.green)
                        .accessibilityLabel(confirmation)
                        .accessibilityIdentifier("results-export-success-message")
                        .accessibilityFocused($focusedAccessibilityTarget, equals: .exportConfirmation)
                }

                HStack(spacing: 8) {
                    ForEach(FindingSeverity.allCases, id: \.self) { severity in
                        Toggle(isOn: Binding(
                            get: { model.activeSeverities.contains(severity) },
                            set: { _ in model.toggleSeverity(severity) }
                        )) {
                            Label("\(severityText(severity)): \(model.severityCounts[severity, default: 0])", systemImage: severitySymbol(severity))
                        }
                        .toggleStyle(.button)
                        .accessibilityIdentifier("severity-filter-\(severity.rawValue)")
                    }
                }
                .accessibilityLabel("Finding severity filters")

                TabView {
                    findingsTab
                        .tabItem { Label("Findings", systemImage: "exclamationmark.bubble") }
                    inventoryTab(result.inventory)
                        .tabItem { Label("Inventory", systemImage: "list.bullet.rectangle") }
                }
                .frame(minHeight: 330)
                .accessibilityIdentifier("results-tabs")
            } else {
                ContentUnavailableView("No scan result", systemImage: "waveform.path.ecg", description: Text("Choose a folder and start a scan to view findings."))
            }
        }
        .task(id: model.exportConfirmationMessage) {
            focusedAccessibilityTarget = model.exportConfirmationMessage == nil
                ? .resultSummary
                : .exportConfirmation
        }
        .accessibilityIdentifier("results-view")
    }

    private var findingsTab: some View {
        HSplitView {
            List(selection: $model.selectedFindingID) {
                ForEach(model.filteredFindingRows) { row in
                    let finding = row.finding
                    VStack(alignment: .leading, spacing: 4) {
                        Label(finding.title, systemImage: severitySymbol(finding.severity))
                        if let firstPath = finding.affectedPaths.first {
                            Text(firstPath.value)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .tag(row.id)
                    .accessibilityLabel("\(severityText(finding.severity)): \(finding.title)")
                }
            }
            .frame(minWidth: 230)

            ScrollView {
                if let finding = model.findingForDetail {
                    FindingDetailView(finding: finding)
                        .padding(.leading, 12)
                } else {
                    ContentUnavailableView("No matching findings", systemImage: "line.3.horizontal.decrease.circle", description: Text("Adjust the severity filters to show findings."))
                }
            }
            .frame(minWidth: 340)
        }
    }

    private func inventoryTab(_ inventory: [InventoryEntry]) -> some View {
        List(inventory, id: \.relativePath) { entry in
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.relativePath.value).font(.system(.body, design: .monospaced))
                Text("\(entry.category.rawValue) · \(entry.kind.rawValue) · \(entry.inspectionStatus.rawValue)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel("\(entry.relativePath.value), \(entry.category.rawValue), \(entry.kind.rawValue)")
        }
        .accessibilityIdentifier("inventory-view")
    }
}
