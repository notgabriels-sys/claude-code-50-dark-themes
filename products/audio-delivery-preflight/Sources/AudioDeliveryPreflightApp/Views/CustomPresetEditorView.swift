import PreflightCore
import SwiftUI

struct CustomPresetEditorView: View {
    private enum AccessibilityTarget: Hashable { case validationError }

    let model: AppModel
    @AccessibilityFocusState private var focusedAccessibilityTarget: AccessibilityTarget?

    private let blockingSeverities: [FindingSeverity] = [.error, .warning]
    private let issueSeverities: [FindingSeverity] = [.error, .warning, .information]
    private let roleCategories: [FileCategory] = [.audio, .artwork, .document, .serviceFile, .other]

    var body: some View {
        GroupBox("Custom preset editor") {
            VStack(alignment: .leading, spacing: 16) {
                Text("Changes stay in memory for this app session. Apply a valid configuration before scanning.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let validationMessage = model.customPresetValidationMessage {
                    Label(validationMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("custom-preset-validation-error")
                        .accessibilityFocused($focusedAccessibilityTarget, equals: .validationError)
                }

                TextField("Preset name", text: draftBinding(\.name))
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("custom-preset-name")

                audioSection
                artworkSection
                filenameSection
                rolesSection
                generalSeveritySection

                HStack {
                    Button("Apply Custom preset") {
                        _ = model.applyCustomPreset()
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("apply-custom-preset-button")

                    if model.errorMessage == nil {
                        Label("Custom preset is valid", systemImage: "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("custom-preset-valid")
                    }
                }
            }
            .padding(.top, 4)
        }
        .accessibilityIdentifier("custom-preset-editor")
        .task(id: model.customPresetValidationMessage) {
            if model.customPresetValidationMessage != nil {
                focusedAccessibilityTarget = .validationError
            }
        }
    }

    private var audioSection: some View {
        GroupBox("Audio formats and measurements") {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Allowed filename extensions, comma-separated", text: draftBinding(\.audioAllowedExtensions))
                    .accessibilityIdentifier("custom-audio-extensions")
                TextField("Allowed inspected encodings, comma-separated", text: draftBinding(\.audioAllowedEncodings))
                    .accessibilityIdentifier("custom-audio-encodings")
                numericRange(
                    title: "Sample rate (Hz)",
                    minimum: draftBinding(\.audioSampleRateMinimum),
                    maximum: draftBinding(\.audioSampleRateMaximum)
                )
                numericRange(
                    title: "PCM bit depth",
                    minimum: draftBinding(\.audioBitDepthMinimum),
                    maximum: draftBinding(\.audioBitDepthMaximum)
                )
                Toggle("Require one inspected sample rate", isOn: draftBinding(\.requireConsistentSampleRate))
                Toggle("Require one inspected PCM bit depth", isOn: draftBinding(\.requireConsistentBitDepth))
                Toggle("Require one inspected channel count", isOn: draftBinding(\.requireConsistentChannelCount))
                SeverityPicker(
                    title: "Audio requirement severity",
                    selection: draftBinding(\.audioSeverity),
                    options: blockingSeverities
                )
            }
            .textFieldStyle(.roundedBorder)
        }
    }

    private var artworkSection: some View {
        GroupBox("Artwork") {
            VStack(alignment: .leading, spacing: 10) {
                Toggle("Enable artwork dimension requirements", isOn: draftBinding(\.artworkEnabled))
                if model.customPresetDraft.artworkEnabled {
                    numericRange(
                        title: "Minimum pixels",
                        minimumLabel: "Minimum width",
                        maximumLabel: "Minimum height",
                        minimum: draftBinding(\.artworkMinimumWidth),
                        maximum: draftBinding(\.artworkMinimumHeight)
                    )
                    Toggle("Require square artwork", isOn: draftBinding(\.artworkRequiresSquare))
                    SeverityPicker(
                        title: "Artwork severity",
                        selection: draftBinding(\.artworkSeverity),
                        options: blockingSeverities
                    )
                }
            }
        }
    }

    private var filenameSection: some View {
        GroupBox("Filename policy") {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Ambiguous version-marker regular expression (optional)", text: draftBinding(\.filenamePattern))
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("custom-filename-pattern")
                SeverityPicker(
                    title: "Filename finding severity",
                    selection: draftBinding(\.filenameSeverity),
                    options: blockingSeverities
                )
            }
        }
    }

    private var rolesSection: some View {
        GroupBox("Delivery roles") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Roles match visible relative filenames. Audio encoding rules are then enforced from inspected content.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(model.customPresetDraft.roles) { role in
                    CustomRoleEditorView(
                        role: roleBinding(id: role.id),
                        categories: roleCategories,
                        blockingSeverities: blockingSeverities,
                        remove: { removeRole(id: role.id) }
                    )
                }
                Button {
                    addRole()
                } label: {
                    Label("Add delivery role", systemImage: "plus")
                }
                .disabled(model.customPresetDraft.roles.count >= PresetInputLimits.maximumRoles)
                .accessibilityHint("A Custom preset can contain at most 32 delivery roles.")
                .accessibilityIdentifier("add-custom-role-button")
            }
        }
    }

    private var generalSeveritySection: some View {
        GroupBox("Filesystem finding severity") {
            VStack(alignment: .leading, spacing: 10) {
                SeverityPicker(
                    title: "Service files",
                    selection: draftBinding(\.serviceFileSeverity),
                    options: issueSeverities
                )
                SeverityPicker(
                    title: "Symbolic links",
                    selection: draftBinding(\.symbolicLinkSeverity),
                    options: issueSeverities
                )
                SeverityPicker(
                    title: "Exact duplicates",
                    selection: draftBinding(\.exactDuplicateSeverity),
                    options: issueSeverities
                )
            }
        }
    }

    private func numericRange(
        title: String,
        minimumLabel: String = "Minimum",
        maximumLabel: String = "Maximum",
        minimum: Binding<String>,
        maximum: Binding<String>
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            HStack {
                TextField(minimumLabel, text: minimum)
                TextField(maximumLabel, text: maximum)
            }
            .textFieldStyle(.roundedBorder)
        }
    }

    private func draftBinding<Value>(_ keyPath: WritableKeyPath<CustomPresetDraft, Value>) -> Binding<Value> {
        Binding(
            get: { model.customPresetDraft[keyPath: keyPath] },
            set: { value in
                model.updateCustomPresetDraft { draft in
                    draft[keyPath: keyPath] = value
                }
            }
        )
    }

    private func roleBinding(id: UUID) -> Binding<CustomRoleDraft> {
        Binding(
            get: {
                model.customPresetDraft.roles.first(where: { $0.id == id })
                    ?? CustomRoleDraft(id: id)
            },
            set: { role in
                model.updateCustomPresetDraft { draft in
                    guard let index = draft.roles.firstIndex(where: { $0.id == id }) else { return }
                    draft.roles[index] = role
                }
            }
        )
    }

    private func addRole() {
        model.updateCustomPresetDraft { draft in
            guard draft.roles.count < PresetInputLimits.maximumRoles else { return }
            var suffix = draft.roles.count + 1
            var identifier = "new-role-\(suffix)"
            while draft.roles.contains(where: { $0.identifier == identifier }) {
                suffix += 1
                identifier = "new-role-\(suffix)"
            }
            draft.roles.append(CustomRoleDraft(identifier: identifier, name: "New role \(suffix)"))
        }
    }

    private func removeRole(id: UUID) {
        model.updateCustomPresetDraft { draft in
            draft.roles.removeAll { $0.id == id }
        }
    }
}

private struct CustomRoleEditorView: View {
    @Binding var role: CustomRoleDraft
    let categories: [FileCategory]
    let blockingSeverities: [FindingSeverity]
    let remove: () -> Void

    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    TextField("Role identifier", text: $role.identifier)
                    TextField("Visible role name", text: $role.name)
                }
                TextField("Relative filename regular expression", text: $role.pattern)
                HStack {
                    Toggle("Required", isOn: $role.required)
                    Picker("Category", selection: categoryBinding) {
                        Text("Any category").tag(FileCategory?.none)
                        ForEach(categories, id: \.rawValue) { category in
                            Text(categoryTitle(category)).tag(Optional(category))
                        }
                    }
                }
                TextField("Allowed filename extensions, comma-separated", text: $role.allowedExtensions)
                if role.category == .audio {
                    TextField("Allowed inspected audio encodings, comma-separated", text: $role.allowedEncodings)
                    range("Channel count", minimum: $role.channelCountMinimum, maximum: $role.channelCountMaximum)
                    range("Sample rate (Hz)", minimum: $role.sampleRateMinimum, maximum: $role.sampleRateMaximum)
                    range("PCM bit depth", minimum: $role.bitDepthMinimum, maximum: $role.bitDepthMaximum)
                } else {
                    Text("Inspected encoding, channel count, sample rate, and PCM bit depth apply only to Audio roles.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                SeverityPicker(
                    title: "Missing or constrained value severity",
                    selection: $role.requirementSeverity,
                    options: blockingSeverities
                )
                if role.category == .audio || role.category == .artwork {
                    SeverityPicker(
                        title: "Unreadable media severity",
                        selection: $role.readabilitySeverity,
                        options: blockingSeverities
                    )
                }
                SeverityPicker(
                    title: "Multiple matches severity",
                    selection: $role.ambiguitySeverity,
                    options: blockingSeverities
                )
                Button("Remove role", role: .destructive, action: remove)
            }
            .textFieldStyle(.roundedBorder)
            .padding(.top, 6)
        } label: {
            Text(role.name.isEmpty ? role.identifier : role.name)
                .fontWeight(.semibold)
        }
        .padding(.vertical, 3)
        .accessibilityIdentifier("custom-role-\(role.id.uuidString)")
    }

    private var categoryBinding: Binding<FileCategory?> {
        Binding(
            get: { role.category },
            set: { category in
                role.category = category
                if category != .audio {
                    role.allowedEncodings = ""
                    role.channelCountMinimum = ""
                    role.channelCountMaximum = ""
                    role.sampleRateMinimum = ""
                    role.sampleRateMaximum = ""
                    role.bitDepthMinimum = ""
                    role.bitDepthMaximum = ""
                }
                if category != .audio, category != .artwork {
                    role.readabilitySeverity = .warning
                }
            }
        )
    }

    private func range(_ title: String, minimum: Binding<String>, maximum: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            HStack {
                TextField("Minimum", text: minimum)
                TextField("Maximum", text: maximum)
            }
        }
    }

    private func categoryTitle(_ category: FileCategory) -> String {
        switch category {
        case .audio: "Audio"
        case .artwork: "Artwork"
        case .document: "Document"
        case .serviceFile: "Service file"
        case .other: "Other"
        }
    }
}

private struct SeverityPicker: View {
    let title: String
    @Binding var selection: FindingSeverity
    let options: [FindingSeverity]

    var body: some View {
        Picker(title, selection: $selection) {
            ForEach(options, id: \.rawValue) { severity in
                Text(severityText(severity)).tag(severity)
            }
        }
    }
}
