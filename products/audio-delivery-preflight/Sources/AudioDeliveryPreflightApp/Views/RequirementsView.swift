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

            GroupBox("Delivery roles") {
                if model.deliveryRoles.isEmpty {
                    Text("No delivery roles are defined by this preset.")
                } else {
                    ForEach(model.deliveryRoles, id: \.identifier) { role in
                        DeliveryRoleRequirementView(role: role)
                    }
                }
            }
            .accessibilityIdentifier("delivery-roles")

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

private struct DeliveryRoleRequirementView: View {
    let role: DeliveryRole

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(role.name) (\(role.identifier))").fontWeight(.semibold)
            ForEach(details, id: \.self) { detail in
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    private var details: [String] {
        var values = [
            role.required ? "Required" : "Optional",
            "Pattern: \(role.pattern)",
            "Category: \(role.category?.rawValue ?? "any")",
            "Allowed extensions: \(role.allowedExtensions?.joined(separator: ", ") ?? "any")",
        ]
        if role.category == .audio {
            values.append("Allowed inspected audio encodings: \(role.allowedEncodings?.joined(separator: ", ") ?? "any")")
            values.append("Channel count: \(constraint(role.channelCount))")
            values.append("Sample rate: \(constraint(role.sampleRate, unit: "Hz"))")
            values.append("PCM bit depth: \(constraint(role.bitDepth))")
        } else {
            values.append("Audio-only inspected constraints: not applicable")
        }
        values.append(
            role.category == .audio || role.category == .artwork
                ? "Unreadable media severity: \(role.readability.rawValue)"
                : "Unreadable media severity: not applicable"
        )
        values.append("Missing or constrained value severity: \(role.severity.rawValue)")
        values.append("Multiple matches severity: \(role.ambiguitySeverity.rawValue)")
        return values
    }

    private func constraint(_ value: NumericConstraint?, unit: String? = nil) -> String {
        guard let value else { return "any" }
        let suffix = unit.map { " \($0)" } ?? ""
        switch (value.minimum, value.maximum) {
        case let (.some(minimum), .some(maximum)) where minimum == maximum:
            return "exactly \(number(minimum))\(suffix)"
        case let (.some(minimum), .some(maximum)):
            return "\(number(minimum)) to \(number(maximum))\(suffix)"
        case let (.some(minimum), .none):
            return "at least \(number(minimum))\(suffix)"
        case let (.none, .some(maximum)):
            return "at most \(number(maximum))\(suffix)"
        case (.none, .none):
            return "any"
        }
    }

    private func number(_ value: Double) -> String {
        let text = String(value)
        return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
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
