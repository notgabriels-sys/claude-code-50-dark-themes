import SwiftUI
import PreflightCore

struct RequirementsView: View {
    let model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
            Label("Review requirements", systemImage: "checklist")
                .font(.largeTitle.bold())

            Text("Folder: \(model.selectedFolderName ?? "Selected folder")")
                .font(.headline)
                .accessibilityIdentifier("selected-folder-name")
            Text("Preset: \(model.selectedPresetName)")
                .foregroundStyle(.secondary)

            if model.isCustomPresetSelected {
                CustomPresetEditorView(model: model)
            } else {
                Button("Edit this preset as Custom") {
                    model.editSelectedPresetAsCustom()
                }
                .accessibilityIdentifier("edit-preset-as-custom-button")
            }

            GroupBox("Resolved requirements") {
                if model.resolvedRequirements.isEmpty {
                    Text("This preset has no additional technical requirements. The scan will still inventory and inspect supported files.")
                } else {
                    ForEach(model.resolvedRequirements, id: \.identifier) { requirement in
                        RequirementRow(requirement: requirement)
                    }
                }
            }
            .accessibilityIdentifier("resolved-requirements")

            GroupBox("Required delivery roles") {
                if model.requiredRoles.isEmpty {
                    Text("No required delivery roles are defined by this preset.")
                } else {
                    ForEach(model.requiredRoles, id: \.identifier) { role in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(role.name).fontWeight(.semibold)
                            Text("Visible filename pattern: \(role.pattern)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 3)
                    }
                }
            }
            .accessibilityIdentifier("required-delivery-roles")

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
            }

            HStack {
                Button("Choose another folder") {
                    model.clearSelection()
                }
                .accessibilityIdentifier("choose-another-folder-button")

                Spacer()

                Button("Start Scan") {
                    model.startScan()
                }
                .buttonStyle(.borderedProminent)
                .disabled(!model.canStartScan)
                .accessibilityIdentifier("start-scan-button")
            }
            }
            .frame(maxWidth: 760, alignment: .leading)
        }
        .accessibilityIdentifier("requirements-view")
    }
}

private struct RequirementRow: View {
    let requirement: ResolvedRequirement

    var body: some View {
        Label {
            Text(requirement.description)
        } icon: {
            Image(systemName: severitySymbol(requirement.severity))
        }
        .accessibilityLabel("\(severityText(requirement.severity)): \(requirement.description)")
        .padding(.vertical, 3)
    }
}
