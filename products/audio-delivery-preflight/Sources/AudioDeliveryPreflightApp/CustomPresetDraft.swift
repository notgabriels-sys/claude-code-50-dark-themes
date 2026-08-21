import Foundation
import PreflightCore

private func editableNumberText(_ value: Double?) -> String {
    guard let value else { return "" }
    let text = String(value)
    return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
}

fileprivate struct CustomPresetRawInputBudget {
    private var aggregateByteCount = 0

    mutating func reserve(
        _ value: String,
        field: String,
        maximumByteCount: Int = PresetInputLimits.maximumStringByteCount
    ) throws {
        let boundedByteCount = value.utf8.prefix(maximumByteCount + 1).count
        guard boundedByteCount <= maximumByteCount else {
            let reason = maximumByteCount == PresetInputLimits.maximumRegularExpressionByteCount
                ? "The regular expression cannot exceed 512 UTF-8 bytes."
                : "A configured string cannot exceed 4096 UTF-8 bytes."
            throw PreflightError.invalidPreset(field: field, reason: reason)
        }
        let (newAggregateByteCount, overflow) = aggregateByteCount.addingReportingOverflow(
            boundedByteCount
        )
        guard !overflow,
              newAggregateByteCount <= PresetInputLimits.maximumAggregateStringByteCount
        else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Preset strings exceed the 1048576-byte aggregate limit."
            )
        }
        guard !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Actual control characters are not allowed."
            )
        }
        aggregateByteCount = newAggregateByteCount
    }
}

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
        let validatedPreset = (try? PresetResolver().resolve(preset).definition)
            ?? BuiltInPresets.custom
        name = validatedPreset.identifier == BuiltInPresets.custom.identifier
            ? validatedPreset.name
            : "\(validatedPreset.name) Custom"
        audioAllowedExtensions = Self.listText(validatedPreset.audio.allowedExtensions)
        audioAllowedEncodings = Self.listText(validatedPreset.audio.allowedEncodings)
        audioSampleRateMinimum = editableNumberText(validatedPreset.audio.sampleRate?.minimum)
        audioSampleRateMaximum = editableNumberText(validatedPreset.audio.sampleRate?.maximum)
        audioBitDepthMinimum = editableNumberText(validatedPreset.audio.bitDepth?.minimum)
        audioBitDepthMaximum = editableNumberText(validatedPreset.audio.bitDepth?.maximum)
        requireConsistentSampleRate = validatedPreset.audio.requireConsistentSampleRate
        requireConsistentBitDepth = validatedPreset.audio.requireConsistentBitDepth
        requireConsistentChannelCount = validatedPreset.audio.requireConsistentChannelCount
        audioSeverity = validatedPreset.audio.severity
        artworkEnabled = validatedPreset.artwork != nil
        artworkMinimumWidth = validatedPreset.artwork?.minimumWidth.map(String.init) ?? ""
        artworkMinimumHeight = validatedPreset.artwork?.minimumHeight.map(String.init) ?? ""
        artworkRequiresSquare = validatedPreset.artwork?.requiresSquare ?? false
        artworkSeverity = validatedPreset.artwork?.severity ?? .warning
        filenamePattern = validatedPreset.filename.ambiguousVersionPattern ?? ""
        filenameSeverity = validatedPreset.filename.ambiguousVersionSeverity
        var validatedRoles: [CustomRoleDraft] = []
        validatedRoles.reserveCapacity(validatedPreset.roles.count)
        for role in validatedPreset.roles {
            validatedRoles.append(CustomRoleDraft(role))
        }
        roles = validatedRoles
        serviceFileSeverity = validatedPreset.serviceFileSeverity
        symbolicLinkSeverity = validatedPreset.symbolicLinkSeverity
        exactDuplicateSeverity = validatedPreset.exactDuplicateSeverity
    }

    func makePreset() throws -> Preset {
        try validateRawInputBounds()
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw PreflightError.invalidPreset(field: "name", reason: "The name cannot be empty.")
        }

        var collectionValueCount = 0
        let parsedAudioAllowedExtensions = try PresetInputParser.commaSeparatedValues(
            audioAllowedExtensions,
            lowercased: true,
            field: "audio.allowedExtensions",
            aggregateValueCount: &collectionValueCount
        )
        let parsedAudioAllowedEncodings = try PresetInputParser.commaSeparatedValues(
            audioAllowedEncodings,
            field: "audio.allowedEncodings",
            aggregateValueCount: &collectionValueCount
        )
        var parsedRoles: [DeliveryRole] = []
        parsedRoles.reserveCapacity(roles.count)
        for role in roles {
            parsedRoles.append(try role.makeRole(
                aggregateValueCount: &collectionValueCount,
                rawInputAlreadyValidated: true
            ))
        }

        return Preset(
            identifier: BuiltInPresets.custom.identifier,
            name: trimmedName,
            audio: AudioRequirement(
                allowedExtensions: parsedAudioAllowedExtensions,
                allowedEncodings: parsedAudioAllowedEncodings,
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
            roles: parsedRoles,
            serviceFileSeverity: serviceFileSeverity,
            symbolicLinkSeverity: symbolicLinkSeverity,
            exactDuplicateSeverity: exactDuplicateSeverity
        )
    }

    func validateRawInputBounds() throws {
        guard roles.count <= PresetInputLimits.maximumRoles else {
            throw PreflightError.invalidPreset(
                field: "roles",
                reason: "A preset can define at most 32 roles."
            )
        }

        var budget = CustomPresetRawInputBudget()
        try budget.reserve(name, field: "name")
        try budget.reserve(audioAllowedExtensions, field: "audio.allowedExtensions")
        try budget.reserve(audioAllowedEncodings, field: "audio.allowedEncodings")
        try budget.reserve(audioSampleRateMinimum, field: "audio.sampleRate.minimum")
        try budget.reserve(audioSampleRateMaximum, field: "audio.sampleRate.maximum")
        try budget.reserve(audioBitDepthMinimum, field: "audio.bitDepth.minimum")
        try budget.reserve(audioBitDepthMaximum, field: "audio.bitDepth.maximum")
        try budget.reserve(artworkMinimumWidth, field: "artwork.minimumWidth")
        try budget.reserve(artworkMinimumHeight, field: "artwork.minimumHeight")
        try budget.reserve(
            filenamePattern,
            field: "filename.ambiguousVersionPattern",
            maximumByteCount: PresetInputLimits.maximumRegularExpressionByteCount
        )
        for role in roles {
            try role.reserveRawInput(in: &budget)
        }
    }

    static func numericConstraint(minimum: String, maximum: String, field: String) throws -> NumericConstraint? {
        let minimumValue = try number(minimum, field: "\(field).minimum")
        let maximumValue = try number(maximum, field: "\(field).maximum")
        guard minimumValue != nil || maximumValue != nil else { return nil }
        return NumericConstraint(minimum: minimumValue, maximum: maximumValue)
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
            channelCountMinimum: editableNumberText(role.channelCount?.minimum),
            channelCountMaximum: editableNumberText(role.channelCount?.maximum),
            sampleRateMinimum: editableNumberText(role.sampleRate?.minimum),
            sampleRateMaximum: editableNumberText(role.sampleRate?.maximum),
            bitDepthMinimum: editableNumberText(role.bitDepth?.minimum),
            bitDepthMaximum: editableNumberText(role.bitDepth?.maximum),
            readabilitySeverity: role.readability,
            requirementSeverity: role.severity,
            ambiguitySeverity: role.ambiguitySeverity
        )
    }

    func makeRole() throws -> DeliveryRole {
        var rawInputBudget = CustomPresetRawInputBudget()
        try reserveRawInput(in: &rawInputBudget)
        var aggregateValueCount = 0
        return try makeRole(
            aggregateValueCount: &aggregateValueCount,
            rawInputAlreadyValidated: true
        )
    }

    fileprivate func makeRole(
        aggregateValueCount: inout Int,
        rawInputAlreadyValidated: Bool
    ) throws -> DeliveryRole {
        if !rawInputAlreadyValidated {
            var rawInputBudget = CustomPresetRawInputBudget()
            try reserveRawInput(in: &rawInputBudget)
        }
        let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPattern = pattern.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedIdentifier.isEmpty, !trimmedName.isEmpty, !trimmedPattern.isEmpty else {
            throw PreflightError.invalidPreset(field: "roles", reason: "Role identity, name, and pattern are required.")
        }
        let parsedAllowedExtensions = try PresetInputParser.commaSeparatedValues(
            allowedExtensions,
            lowercased: true,
            field: "roles.\(trimmedIdentifier).allowedExtensions",
            aggregateValueCount: &aggregateValueCount
        )
        let parsedAllowedEncodings = try PresetInputParser.commaSeparatedValues(
            allowedEncodings,
            field: "roles.\(trimmedIdentifier).allowedEncodings",
            aggregateValueCount: &aggregateValueCount
        )
        let parsedChannelCount = try CustomPresetDraft.numericConstraint(
            minimum: channelCountMinimum,
            maximum: channelCountMaximum,
            field: "roles.\(trimmedIdentifier).channelCount"
        )
        let parsedSampleRate = try CustomPresetDraft.numericConstraint(
            minimum: sampleRateMinimum,
            maximum: sampleRateMaximum,
            field: "roles.\(trimmedIdentifier).sampleRate"
        )
        let parsedBitDepth = try CustomPresetDraft.numericConstraint(
            minimum: bitDepthMinimum,
            maximum: bitDepthMaximum,
            field: "roles.\(trimmedIdentifier).bitDepth"
        )
        if category != .audio {
            let audioOnlyFields: [(String, Bool)] = [
                ("allowedEncodings", parsedAllowedEncodings != nil),
                ("channelCount", parsedChannelCount != nil),
                ("sampleRate", parsedSampleRate != nil),
                ("bitDepth", parsedBitDepth != nil),
            ]
            if let invalidField = audioOnlyFields.first(where: { $0.1 })?.0 {
                throw PreflightError.invalidPreset(
                    field: "roles.\(trimmedIdentifier).\(invalidField)",
                    reason: "Audio-only role constraints require the Audio category."
                )
            }
        }
        if category != .audio, category != .artwork, readabilitySeverity != .warning {
            throw PreflightError.invalidPreset(
                field: "roles.\(trimmedIdentifier).readability",
                reason: "Unreadable-media severity is only applicable to Audio or Artwork roles."
            )
        }

        return DeliveryRole(
            identifier: trimmedIdentifier,
            name: trimmedName,
            pattern: trimmedPattern,
            required: required,
            category: category,
            allowedExtensions: parsedAllowedExtensions,
            allowedEncodings: parsedAllowedEncodings,
            channelCount: parsedChannelCount,
            sampleRate: parsedSampleRate,
            bitDepth: parsedBitDepth,
            readability: readabilitySeverity,
            severity: requirementSeverity,
            ambiguitySeverity: ambiguitySeverity
        )
    }

    fileprivate func reserveRawInput(in budget: inout CustomPresetRawInputBudget) throws {
        try budget.reserve(identifier, field: "roles.identifier")
        try budget.reserve(name, field: "roles.name")
        try budget.reserve(
            pattern,
            field: "roles.pattern",
            maximumByteCount: PresetInputLimits.maximumRegularExpressionByteCount
        )
        try budget.reserve(allowedExtensions, field: "roles.allowedExtensions")
        try budget.reserve(allowedEncodings, field: "roles.allowedEncodings")
        try budget.reserve(channelCountMinimum, field: "roles.channelCount.minimum")
        try budget.reserve(channelCountMaximum, field: "roles.channelCount.maximum")
        try budget.reserve(sampleRateMinimum, field: "roles.sampleRate.minimum")
        try budget.reserve(sampleRateMaximum, field: "roles.sampleRate.maximum")
        try budget.reserve(bitDepthMinimum, field: "roles.bitDepth.minimum")
        try budget.reserve(bitDepthMaximum, field: "roles.bitDepth.maximum")
    }

}
