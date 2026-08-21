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
                    roleAssignmentsTab(result.roleAssignments)
                        .tabItem { Label("Role assignments", systemImage: "checklist") }
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

    private func roleAssignmentsTab(_ assignments: [RoleAssignment]) -> some View {
        Group {
            if assignments.isEmpty {
                ContentUnavailableView(
                    "No successful role assignments",
                    systemImage: "checklist",
                    description: Text("A role is assigned only when exactly one matching file passes its configured role constraints.")
                )
            } else {
                List(assignments, id: \.roleIdentifier) { assignment in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(assignment.roleName) (\(assignment.roleIdentifier))")
                            .fontWeight(.semibold)
                        Text(assignment.matchedPath.value)
                            .font(.system(.body, design: .monospaced))
                        Text("Matched pattern: \(assignment.pattern)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Category: \(assignment.category.rawValue)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ForEach(assignment.acceptedEvidence, id: \.label) { evidence in
                            Text("\(evidence.label): \(evidenceText(evidence.value))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        "Role \(assignment.roleName), matched \(assignment.matchedPath.value), pattern \(assignment.pattern), category \(assignment.category.rawValue)"
                    )
                }
            }
        }
        .accessibilityIdentifier("role-assignments-view")
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
                ForEach(measuredProperties(for: entry), id: \.self) { property in
                    Text(property)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityLabel("\(entry.relativePath.value), \(entry.category.rawValue), \(entry.kind.rawValue)")
        }
        .accessibilityIdentifier("inventory-view")
    }

    private func measuredProperties(for entry: InventoryEntry) -> [String] {
        if let audio = entry.audioProperties {
            var values: [String] = []
            if let container = audio.container { values.append("Container: \(container)") }
            if let encoding = audio.encoding { values.append("Encoding: \(encoding)") }
            if let duration = audio.durationSeconds { values.append("Duration: \(duration.formatted()) seconds") }
            if let channels = audio.channelCount { values.append("Channels: \(channels)") }
            if let sampleRate = audio.sampleRate { values.append("Sample rate: \(sampleRate.formatted()) Hz") }
            if let bitDepth = audio.pcmBitDepth { values.append("PCM bit depth: \(bitDepth)") }
            for key in audio.metadata.keys.sorted(by: unicodeScalarLessThan) {
                if let value = audio.metadata[key] {
                    values.append("Metadata \(key): \(value)")
                }
            }
            return values
        }
        if let image = entry.imageProperties {
            var values: [String] = []
            if let width = image.pixelWidth { values.append("Width: \(width) px") }
            if let height = image.pixelHeight { values.append("Height: \(height) px") }
            if let format = image.format { values.append("Format: \(format)") }
            if let colorModel = image.colorModel { values.append("Color model: \(colorModel)") }
            if let alpha = image.hasAlpha { values.append("Alpha: \(alpha ? "Yes" : "No")") }
            return values
        }
        return []
    }

    private func unicodeScalarLessThan(_ left: String, _ right: String) -> Bool {
        left.unicodeScalars.lexicographicallyPrecedes(right.unicodeScalars)
    }
}
