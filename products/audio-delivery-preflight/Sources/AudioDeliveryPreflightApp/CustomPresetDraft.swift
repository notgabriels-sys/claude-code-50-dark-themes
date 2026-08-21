import Foundation
import PreflightCore

struct CustomPresetDraft {
    var name: String
    var audioAllowedExtensions: String
    var audioAllowedEncodings: String
    var audioSampleRateMinimum: String
    var audioSampleRateMaximum: String
    var audioBitDepthMinimum: String
    var audioBitDepthMaximum: String
    var requireConsistentSampleRate: Bool
    var requireConsistentBitDepth: Bool
    var requireConsistentChannelCount: Bool
    var audioSeverity: FindingSeverity
    var artworkEnabled: Bool
    var artworkMinimumWidth: String
    var artworkMinimumHeight: String
    var artworkRequiresSquare: Bool
    var artworkSeverity: FindingSeverity
    var filenamePattern: String
    var filenameSeverity: FindingSeverity
    var roles: [CustomRoleDraft]
    var serviceFileSeverity: FindingSeverity
    var symbolicLinkSeverity: FindingSeverity
    var exactDuplicateSeverity: FindingSeverity

    init(preset: Preset = BuiltInPresets.custom) {
        name = preset.identifier == BuiltInPresets.custom.identifier
            ? preset.name
            : "\(preset.name) Custom"
        audioAllowedExtensions = Self.listText(preset.audio.allowedExtensions)
        audioAllowedEncodings = Self.listText(preset.audio.allowedEncodings)
        audioSampleRateMinimum = Self.numberText(preset.audio.sampleRate?.minimum)
        audioSampleRateMaximum = Self.numberText(preset.audio.sampleRate?.maximum)
        audioBitDepthMinimum = Self.numberText(preset.audio.bitDepth?.minimum)
        audioBitDepthMaximum = Self.numberText(preset.audio.bitDepth?.maximum)
        requireConsistentSampleRate = preset.audio.requireConsistentSampleRate
        requireConsistentBitDepth = preset.audio.requireConsistentBitDepth
        requireConsistentChannelCount = preset.audio.requireConsistentChannelCount
        audioSeverity = preset.audio.severity
        artworkEnabled = preset.artwork != nil
        artworkMinimumWidth = preset.artwork?.minimumWidth.map(String.init) ?? ""
        artworkMinimumHeight = preset.artwork?.minimumHeight.map(String.init) ?? ""
        artworkRequiresSquare = preset.artwork?.requiresSquare ?? false
        artworkSeverity = preset.artwork?.severity ?? .warning
        filenamePattern = preset.filename.ambiguousVersionPattern ?? ""
        filenameSeverity = preset.filename.ambiguousVersionSeverity
        roles = preset.roles.map(CustomRoleDraft.init)
        serviceFileSeverity = preset.serviceFileSeverity
        symbolicLinkSeverity = preset.symbolicLinkSeverity
        exactDuplicateSeverity = preset.exactDuplicateSeverity
    }

    func makePreset() throws -> Preset {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw PreflightError.invalidPreset(field: "name", reason: "The name cannot be empty.")
        }

        return Preset(
            identifier: BuiltInPresets.custom.identifier,
            name: trimmedName,
            audio: AudioRequirement(
                allowedExtensions: try Self.list(audioAllowedExtensions, lowercased: true, field: "audio.allowedExtensions"),
                allowedEncodings: try Self.list(audioAllowedEncodings, field: "audio.allowedEncodings"),
                sampleRate: try Self.numericConstraint(
                    minimum: audioSampleRateMinimum,
                    maximum: audioSampleRateMaximum,
                    field: "audio.sampleRate"
                ),
                bitDepth: try Self.numericConstraint(
                    minimum: audioBitDepthMinimum,
                    maximum: audioBitDepthMaximum,
                    field: "audio.bitDepth"
                ),
                requireConsistentSampleRate: requireConsistentSampleRate,
                requireConsistentBitDepth: requireConsistentBitDepth,
                requireConsistentChannelCount: requireConsistentChannelCount,
                severity: audioSeverity
            ),
            artwork: artworkEnabled ? ArtworkRequirement(
                minimumWidth: try Self.integer(artworkMinimumWidth, field: "artwork.minimumWidth"),
                minimumHeight: try Self.integer(artworkMinimumHeight, field: "artwork.minimumHeight"),
                requiresSquare: artworkRequiresSquare,
                severity: artworkSeverity
            ) : nil,
            filename: FilenameRequirement(
                ambiguousVersionPattern: Self.optionalText(filenamePattern),
                ambiguousVersionSeverity: filenameSeverity
            ),
            roles: try roles.map { try $0.makeRole() },
            serviceFileSeverity: serviceFileSeverity,
            symbolicLinkSeverity: symbolicLinkSeverity,
            exactDuplicateSeverity: exactDuplicateSeverity
        )
    }

    static func numericConstraint(minimum: String, maximum: String, field: String) throws -> NumericConstraint? {
        let minimumValue = try number(minimum, field: "\(field).minimum")
        let maximumValue = try number(maximum, field: "\(field).maximum")
        guard minimumValue != nil || maximumValue != nil else { return nil }
        return NumericConstraint(minimum: minimumValue, maximum: maximumValue)
    }

    private static func list(_ text: String, lowercased: Bool = false, field: String) throws -> [String]? {
        guard optionalText(text) != nil else { return nil }
        let values = text.split(separator: ",", omittingEmptySubsequences: false).map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard !values.isEmpty, values.allSatisfy({ !$0.isEmpty }) else {
            throw PreflightError.invalidPreset(field: field, reason: "Comma-separated values cannot be empty.")
        }
        return values.map { lowercased ? $0.lowercased() : $0 }
    }

    private static func number(_ text: String, field: String) throws -> Double? {
        guard let value = optionalText(text) else { return nil }
        guard let parsed = Double(value), parsed.isFinite else {
            throw PreflightError.invalidPreset(field: field, reason: "Enter a finite number.")
        }
        return parsed
    }

    private static func integer(_ text: String, field: String) throws -> Int? {
        guard let value = optionalText(text) else { return nil }
        guard let parsed = Int(value) else {
            throw PreflightError.invalidPreset(field: field, reason: "Enter a whole number.")
        }
        return parsed
    }

    private static func optionalText(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func listText(_ values: [String]?) -> String {
        values?.joined(separator: ", ") ?? ""
    }

    private static func numberText(_ value: Double?) -> String {
        guard let value else { return "" }
        return value.rounded() == value ? String(Int(value)) : String(value)
    }
}

struct CustomRoleDraft: Identifiable {
    let id: UUID
    var identifier: String
    var name: String
    var pattern: String
    var required: Bool
    var category: FileCategory?
    var allowedExtensions: String
    var allowedEncodings: String
    var channelCountMinimum: String
    var channelCountMaximum: String
    var sampleRateMinimum: String
    var sampleRateMaximum: String
    var bitDepthMinimum: String
    var bitDepthMaximum: String
    var readabilitySeverity: FindingSeverity
    var requirementSeverity: FindingSeverity
    var ambiguitySeverity: FindingSeverity

    init(
        id: UUID = UUID(),
        identifier: String = "new-role",
        name: String = "New role",
        pattern: String = ".*",
        required: Bool = true,
        category: FileCategory? = nil,
        allowedExtensions: String = "",
        allowedEncodings: String = "",
        channelCountMinimum: String = "",
        channelCountMaximum: String = "",
        sampleRateMinimum: String = "",
        sampleRateMaximum: String = "",
        bitDepthMinimum: String = "",
        bitDepthMaximum: String = "",
        readabilitySeverity: FindingSeverity = .warning,
        requirementSeverity: FindingSeverity = .error,
        ambiguitySeverity: FindingSeverity = .warning
    ) {
        self.id = id
        self.identifier = identifier
        self.name = name
        self.pattern = pattern
        self.required = required
        self.category = category
        self.allowedExtensions = allowedExtensions
        self.allowedEncodings = allowedEncodings
        self.channelCountMinimum = channelCountMinimum
        self.channelCountMaximum = channelCountMaximum
        self.sampleRateMinimum = sampleRateMinimum
        self.sampleRateMaximum = sampleRateMaximum
        self.bitDepthMinimum = bitDepthMinimum
        self.bitDepthMaximum = bitDepthMaximum
        self.readabilitySeverity = readabilitySeverity
        self.requirementSeverity = requirementSeverity
        self.ambiguitySeverity = ambiguitySeverity
    }

    init(_ role: DeliveryRole) {
        self.init(
            identifier: role.identifier,
            name: role.name,
            pattern: role.pattern,
            required: role.required,
            category: role.category,
            allowedExtensions: role.allowedExtensions?.joined(separator: ", ") ?? "",
            allowedEncodings: role.allowedEncodings?.joined(separator: ", ") ?? "",
            channelCountMinimum: Self.numberText(role.channelCount?.minimum),
            channelCountMaximum: Self.numberText(role.channelCount?.maximum),
            sampleRateMinimum: Self.numberText(role.sampleRate?.minimum),
            sampleRateMaximum: Self.numberText(role.sampleRate?.maximum),
            bitDepthMinimum: Self.numberText(role.bitDepth?.minimum),
            bitDepthMaximum: Self.numberText(role.bitDepth?.maximum),
            readabilitySeverity: role.readability,
            requirementSeverity: role.severity,
            ambiguitySeverity: role.ambiguitySeverity
        )
    }

    func makeRole() throws -> DeliveryRole {
        let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPattern = pattern.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedIdentifier.isEmpty, !trimmedName.isEmpty, !trimmedPattern.isEmpty else {
            throw PreflightError.invalidPreset(field: "roles", reason: "Role identity, name, and pattern are required.")
        }
        return DeliveryRole(
            identifier: trimmedIdentifier,
            name: trimmedName,
            pattern: trimmedPattern,
            required: required,
            category: category,
            allowedExtensions: try list(allowedExtensions, lowercased: true, field: "roles.\(trimmedIdentifier).allowedExtensions"),
            allowedEncodings: try list(allowedEncodings, field: "roles.\(trimmedIdentifier).allowedEncodings"),
            channelCount: try CustomPresetDraft.numericConstraint(
                minimum: channelCountMinimum,
                maximum: channelCountMaximum,
                field: "roles.\(trimmedIdentifier).channelCount"
            ),
            sampleRate: try CustomPresetDraft.numericConstraint(
                minimum: sampleRateMinimum,
                maximum: sampleRateMaximum,
                field: "roles.\(trimmedIdentifier).sampleRate"
            ),
            bitDepth: try CustomPresetDraft.numericConstraint(
                minimum: bitDepthMinimum,
                maximum: bitDepthMaximum,
                field: "roles.\(trimmedIdentifier).bitDepth"
            ),
            readability: readabilitySeverity,
            severity: requirementSeverity,
            ambiguitySeverity: ambiguitySeverity
        )
    }

    private func list(_ text: String, lowercased: Bool = false, field: String) throws -> [String]? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let values = text.split(separator: ",", omittingEmptySubsequences: false).map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard values.allSatisfy({ !$0.isEmpty }) else {
            throw PreflightError.invalidPreset(field: field, reason: "Comma-separated values cannot be empty.")
        }
        return values.map { lowercased ? $0.lowercased() : $0 }
    }

    private static func numberText(_ value: Double?) -> String {
        guard let value else { return "" }
        return value.rounded() == value ? String(Int(value)) : String(value)
    }
}
