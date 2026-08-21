import Foundation

public struct NumericConstraint: Sendable, Codable, Equatable {
    public let minimum: Double?
    public let maximum: Double?

    public init(minimum: Double? = nil, maximum: Double? = nil) {
        self.minimum = minimum
        self.maximum = maximum
    }

    public init(exactly value: Double) {
        self.init(minimum: value, maximum: value)
    }
}

public struct AudioRequirement: Sendable, Codable, Equatable {
    public let allowedExtensions: [String]?
    public let allowedEncodings: [String]?
    public let sampleRate: NumericConstraint?
    public let bitDepth: NumericConstraint?
    public let requireConsistentSampleRate: Bool
    public let requireConsistentBitDepth: Bool
    public let requireConsistentChannelCount: Bool
    public let severity: FindingSeverity

    public init(
        allowedExtensions: [String]? = nil,
        allowedEncodings: [String]? = nil,
        sampleRate: NumericConstraint? = nil,
        bitDepth: NumericConstraint? = nil,
        requireConsistentSampleRate: Bool = false,
        requireConsistentBitDepth: Bool = false,
        requireConsistentChannelCount: Bool = false,
        severity: FindingSeverity = .warning
    ) {
        self.allowedExtensions = allowedExtensions
        self.allowedEncodings = allowedEncodings
        self.sampleRate = sampleRate
        self.bitDepth = bitDepth
        self.requireConsistentSampleRate = requireConsistentSampleRate
        self.requireConsistentBitDepth = requireConsistentBitDepth
        self.requireConsistentChannelCount = requireConsistentChannelCount
        self.severity = severity
    }

    private enum CodingKeys: String, CodingKey {
        case allowedExtensions
        case allowedEncodings
        case sampleRate
        case bitDepth
        case requireConsistentSampleRate
        case requireConsistentBitDepth
        case requireConsistentChannelCount
        case severity
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        allowedExtensions = try container.decodeIfPresent([String].self, forKey: .allowedExtensions)
        allowedEncodings = try container.decodeIfPresent([String].self, forKey: .allowedEncodings)
        sampleRate = try container.decodeIfPresent(NumericConstraint.self, forKey: .sampleRate)
        bitDepth = try container.decodeIfPresent(NumericConstraint.self, forKey: .bitDepth)
        requireConsistentSampleRate = try container.decodeIfPresent(Bool.self, forKey: .requireConsistentSampleRate) ?? false
        requireConsistentBitDepth = try container.decodeIfPresent(Bool.self, forKey: .requireConsistentBitDepth) ?? false
        requireConsistentChannelCount = try container.decodeIfPresent(Bool.self, forKey: .requireConsistentChannelCount) ?? false
        severity = try container.decodeIfPresent(FindingSeverity.self, forKey: .severity) ?? .warning
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(allowedExtensions, forKey: .allowedExtensions)
        try container.encodeIfPresent(allowedEncodings, forKey: .allowedEncodings)
        try container.encodeIfPresent(sampleRate, forKey: .sampleRate)
        try container.encodeIfPresent(bitDepth, forKey: .bitDepth)
        try container.encode(requireConsistentSampleRate, forKey: .requireConsistentSampleRate)
        try container.encode(requireConsistentBitDepth, forKey: .requireConsistentBitDepth)
        try container.encode(requireConsistentChannelCount, forKey: .requireConsistentChannelCount)
        try container.encode(severity, forKey: .severity)
    }
}

public struct ArtworkRequirement: Sendable, Codable, Equatable {
    public let minimumWidth: Int?
    public let minimumHeight: Int?
    public let requiresSquare: Bool
    public let severity: FindingSeverity

    public init(
        minimumWidth: Int? = nil,
        minimumHeight: Int? = nil,
        requiresSquare: Bool = false,
        severity: FindingSeverity = .warning
    ) {
        self.minimumWidth = minimumWidth
        self.minimumHeight = minimumHeight
        self.requiresSquare = requiresSquare
        self.severity = severity
    }
}

public struct FilenameRequirement: Sendable, Codable, Equatable {
    public let ambiguousVersionPattern: String?
    public let ambiguousVersionSeverity: FindingSeverity

    public init(
        ambiguousVersionPattern: String? = nil,
        ambiguousVersionSeverity: FindingSeverity = .warning
    ) {
        self.ambiguousVersionPattern = ambiguousVersionPattern
        self.ambiguousVersionSeverity = ambiguousVersionSeverity
    }
}

public struct DeliveryRole: Sendable, Codable, Equatable {
    public let identifier: String
    public let name: String
    public let pattern: String
    public let required: Bool
    public let category: FileCategory?
    public let allowedExtensions: [String]?
    public let allowedEncodings: [String]?
    public let channelCount: NumericConstraint?
    public let sampleRate: NumericConstraint?
    public let bitDepth: NumericConstraint?
    public let readability: FindingSeverity
    public let severity: FindingSeverity
    public let ambiguitySeverity: FindingSeverity

    public init(
        identifier: String,
        name: String? = nil,
        pattern: String,
        required: Bool,
        category: FileCategory? = nil,
        allowedExtensions: [String]? = nil,
        allowedEncodings: [String]? = nil,
        channelCount: NumericConstraint? = nil,
        sampleRate: NumericConstraint? = nil,
        bitDepth: NumericConstraint? = nil,
        readability: FindingSeverity = .warning,
        severity: FindingSeverity = .error,
        ambiguitySeverity: FindingSeverity = .warning
    ) {
        self.identifier = identifier
        self.name = name ?? identifier
        self.pattern = pattern
        self.required = required
        self.category = category
        self.allowedExtensions = allowedExtensions
        self.allowedEncodings = allowedEncodings
        self.channelCount = channelCount
        self.sampleRate = sampleRate
        self.bitDepth = bitDepth
        self.readability = readability
        self.severity = severity
        self.ambiguitySeverity = ambiguitySeverity
    }
}

public struct Preset: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let identifier: String
    public let name: String
    public let audio: AudioRequirement
    public let artwork: ArtworkRequirement?
    public let filename: FilenameRequirement
    public let roles: [DeliveryRole]
    public let serviceFileSeverity: FindingSeverity
    public let symbolicLinkSeverity: FindingSeverity
    public let exactDuplicateSeverity: FindingSeverity

    public init(
        schemaVersion: String = "1.0",
        identifier: String,
        name: String,
        audio: AudioRequirement = AudioRequirement(),
        artwork: ArtworkRequirement? = nil,
        filename: FilenameRequirement = FilenameRequirement(),
        roles: [DeliveryRole] = [],
        serviceFileSeverity: FindingSeverity = .information,
        symbolicLinkSeverity: FindingSeverity = .warning,
        exactDuplicateSeverity: FindingSeverity = .warning
    ) {
        self.schemaVersion = schemaVersion
        self.identifier = identifier
        self.name = name
        self.audio = audio
        self.artwork = artwork
        self.filename = filename
        self.roles = roles
        self.serviceFileSeverity = serviceFileSeverity
        self.symbolicLinkSeverity = symbolicLinkSeverity
        self.exactDuplicateSeverity = exactDuplicateSeverity
    }
}

public protocol PresetResolving: Sendable {
    func resolve(_ preset: Preset) throws -> ResolvedPreset
}

struct CompiledDeliveryRole: @unchecked Sendable {
    let role: DeliveryRole
    let pattern: NSRegularExpression
}

enum PresetValidationLimits {
    static let maximumRoles = 32
    static let maximumRegularExpressionByteCount = 512
    static let maximumCollectionValueCount = 4_096
    static let maximumStringByteCount = 4_096
    static let maximumAggregateStringByteCount = 1_048_576
}

public struct PresetResolver: PresetResolving {
    public init() {}

    public func resolve(_ preset: Preset) throws -> ResolvedPreset {
        guard preset.schemaVersion == "1.0" else {
            throw PreflightError.invalidPreset(
                field: "schemaVersion",
                reason: "Only preset schema version 1.0 is supported."
            )
        }
        var stringBudget = PresetStringBudget()
        try validateIdentifier(preset.identifier, field: "identifier", budget: &stringBudget)
        try validateName(preset.name, field: "name", budget: &stringBudget)
        guard preset.roles.count <= PresetValidationLimits.maximumRoles else {
            throw PreflightError.invalidPreset(
                field: "roles",
                reason: "A preset can define at most 32 roles."
            )
        }
        let duplicateIdentifiers = Dictionary(
            grouping: preset.roles,
            by: { normalizedIdentifier($0.identifier) }
        )
            .first { $0.value.count > 1 }?.key
        if let duplicateIdentifiers {
            throw PreflightError.invalidPreset(
                field: "roles",
                reason: "Role identifiers must be unique after normalization: \(duplicateIdentifiers)."
            )
        }

        try validate(preset.audio.sampleRate, field: "audio.sampleRate")
        try validate(preset.audio.bitDepth, field: "audio.bitDepth")
        try validateStrings(
            preset.audio.allowedExtensions,
            field: "audio.allowedExtensions",
            budget: &stringBudget
        )
        try validateStrings(
            preset.audio.allowedEncodings,
            field: "audio.allowedEncodings",
            budget: &stringBudget
        )
        if preset.audio.allowedExtensions != nil
            || preset.audio.allowedEncodings != nil
            || preset.audio.sampleRate != nil
            || preset.audio.bitDepth != nil
            || preset.audio.requireConsistentSampleRate
            || preset.audio.requireConsistentBitDepth
            || preset.audio.requireConsistentChannelCount
        {
            try validateBlockingSeverity(preset.audio.severity, field: "audio.severity")
        } else {
            try validateIssueSeverity(preset.audio.severity, field: "audio.severity")
        }
        if let artwork = preset.artwork {
            if let width = artwork.minimumWidth, width <= 0 {
                throw PreflightError.invalidPreset(field: "artwork.minimumWidth", reason: "The minimum must be greater than zero.")
            }
            if let height = artwork.minimumHeight, height <= 0 {
                throw PreflightError.invalidPreset(field: "artwork.minimumHeight", reason: "The minimum must be greater than zero.")
            }
            if artwork.minimumWidth != nil || artwork.minimumHeight != nil || artwork.requiresSquare {
                try validateBlockingSeverity(artwork.severity, field: "artwork.severity")
            } else {
                try validateIssueSeverity(artwork.severity, field: "artwork.severity")
            }
        }
        try validateIssueSeverity(preset.filename.ambiguousVersionSeverity, field: "filename.ambiguousVersionSeverity")
        try validateIssueSeverity(preset.serviceFileSeverity, field: "serviceFileSeverity")
        try validateIssueSeverity(preset.symbolicLinkSeverity, field: "symbolicLinkSeverity")
        try validateIssueSeverity(preset.exactDuplicateSeverity, field: "exactDuplicateSeverity")

        for role in preset.roles {
            let prefix = role.identifier.isEmpty ? "roles" : "roles.\(role.identifier)"
            try validateIdentifier(role.identifier, field: "\(prefix).identifier", budget: &stringBudget)
            try validateName(role.name, field: "\(prefix).name", budget: &stringBudget)
            try validateRegularExpression(role.pattern, field: "\(prefix).pattern", budget: &stringBudget)
            try validateStrings(
                role.allowedExtensions,
                field: "\(prefix).allowedExtensions",
                budget: &stringBudget
            )
            try validateStrings(
                role.allowedEncodings,
                field: "\(prefix).allowedEncodings",
                budget: &stringBudget
            )
        }
        if let pattern = preset.filename.ambiguousVersionPattern {
            try validateRegularExpression(
                pattern,
                field: "filename.ambiguousVersionPattern",
                budget: &stringBudget
            )
        }

        var compiledRoles: [CompiledDeliveryRole] = []
        for role in preset.roles {
            try validate(role.channelCount, field: "roles.\(role.identifier).channelCount")
            try validate(role.sampleRate, field: "roles.\(role.identifier).sampleRate")
            try validate(role.bitDepth, field: "roles.\(role.identifier).bitDepth")
            try validateCategoryContract(for: role)
            let roleHasBlockingRequirement = role.required
                || role.allowedEncodings != nil
                || role.channelCount != nil
                || role.sampleRate != nil
                || role.bitDepth != nil
            if roleHasBlockingRequirement {
                try validateBlockingSeverity(role.severity, field: "roles.\(role.identifier).severity")
            } else {
                try validateIssueSeverity(role.severity, field: "roles.\(role.identifier).severity")
            }
            if role.category == .audio || role.category == .artwork {
                try validateBlockingSeverity(role.readability, field: "roles.\(role.identifier).readability")
            }
            try validateBlockingSeverity(role.ambiguitySeverity, field: "roles.\(role.identifier).ambiguitySeverity")
            do {
                compiledRoles.append(CompiledDeliveryRole(role: role, pattern: try NSRegularExpression(pattern: role.pattern)))
            } catch {
                throw PreflightError.invalidPreset(field: "roles.\(role.identifier).pattern", reason: "The regular expression is invalid.")
            }
        }

        if let pattern = preset.filename.ambiguousVersionPattern {
            do {
                _ = try NSRegularExpression(pattern: pattern)
            } catch {
                throw PreflightError.invalidPreset(field: "filename.ambiguousVersionPattern", reason: "The regular expression is invalid.")
            }
        }

        return ResolvedPreset(
            schemaVersion: preset.schemaVersion,
            identifier: preset.identifier,
            name: preset.name,
            requirements: requirements(for: preset),
            definition: preset,
            compiledRoles: compiledRoles
        )
    }

    private func validate(_ constraint: NumericConstraint?, field: String) throws {
        guard let constraint else { return }
        for value in [constraint.minimum, constraint.maximum].compactMap({ $0 }) {
            guard value.isFinite else {
                throw PreflightError.invalidPreset(field: field, reason: "The bound must be finite.")
            }
            guard value > 0 else {
                throw PreflightError.invalidPreset(field: field, reason: "The bound must be greater than zero.")
            }
            guard value.rounded() == value else {
                throw PreflightError.invalidPreset(field: field, reason: "The bound must be an integer.")
            }
        }
        if let minimum = constraint.minimum, let maximum = constraint.maximum, minimum > maximum {
            throw PreflightError.invalidPreset(field: field, reason: "The minimum cannot exceed the maximum.")
        }
    }

    private func validateIdentifier(
        _ value: String,
        field: String,
        budget: inout PresetStringBudget
    ) throws {
        try validateBoundedString(value, field: field, budget: &budget)
        guard !value.isEmpty else {
            throw PreflightError.invalidPreset(field: field, reason: "The identifier cannot be empty.")
        }
        guard value == value.trimmingCharacters(in: .whitespacesAndNewlines),
              value.first?.isASCIIIdentifierCharacter == true,
              value.last?.isASCIIIdentifierCharacter == true,
              value.split(separator: "-", omittingEmptySubsequences: false).allSatisfy({ component in
                  !component.isEmpty && component.allSatisfy(\.isASCIIIdentifierCharacter)
              })
        else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Identifiers must use letters, digits, and single hyphens only."
            )
        }
        guard value == normalizedIdentifier(value) else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Identifiers must use their normalized lowercase form."
            )
        }
    }

    private func validateName(
        _ value: String,
        field: String,
        budget: inout PresetStringBudget
    ) throws {
        try validateBoundedString(value, field: field, budget: &budget)
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw PreflightError.invalidPreset(field: field, reason: "The name cannot be empty.")
        }
        guard value == trimmed else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "The name must not contain leading or trailing whitespace."
            )
        }
    }

    private func validateRegularExpression(
        _ pattern: String,
        field: String,
        budget: inout PresetStringBudget
    ) throws {
        guard pattern.utf8.count <= PresetValidationLimits.maximumRegularExpressionByteCount else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "The regular expression cannot exceed 512 UTF-8 bytes."
            )
        }
        try validateBoundedString(pattern, field: field, budget: &budget)
        guard SafeRegularExpressionPolicy.isSafe(pattern) else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "The regular expression uses an unsafe construct."
            )
        }
    }

    private func validateStrings(
        _ values: [String]?,
        field: String,
        budget: inout PresetStringBudget
    ) throws {
        guard let values else { return }
        guard !values.isEmpty else {
            throw PreflightError.invalidPreset(field: field, reason: "Configured values cannot be empty.")
        }
        try budget.reserveCollectionValues(values.count, field: field)
        for value in values {
            try validateBoundedString(value, field: field, budget: &budget)
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, trimmed == value else {
                throw PreflightError.invalidPreset(
                    field: field,
                    reason: "Configured values must be nonempty and trimmed."
                )
            }
        }
    }

    private func validateBoundedString(
        _ value: String,
        field: String,
        budget: inout PresetStringBudget
    ) throws {
        guard !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Actual control characters are not allowed."
            )
        }
        guard value.utf8.count <= PresetValidationLimits.maximumStringByteCount else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "A configured string cannot exceed 4096 UTF-8 bytes."
            )
        }
        try budget.reserve(value, field: field)
    }

    private func normalizedIdentifier(_ identifier: String) -> String {
        identifier.precomposedStringWithCanonicalMapping.lowercased()
    }

    private func validateCategoryContract(for role: DeliveryRole) throws {
        if role.category != .audio {
            let audioOnlyFields: [(String, Bool)] = [
                ("allowedEncodings", role.allowedEncodings != nil),
                ("channelCount", role.channelCount != nil),
                ("sampleRate", role.sampleRate != nil),
                ("bitDepth", role.bitDepth != nil),
            ]
            if let invalidField = audioOnlyFields.first(where: { $0.1 })?.0 {
                throw PreflightError.invalidPreset(
                    field: "roles.\(role.identifier).\(invalidField)",
                    reason: "Audio-only role constraints require the Audio category."
                )
            }
        }

        if role.category != .audio, role.category != .artwork, role.readability != .warning {
            throw PreflightError.invalidPreset(
                field: "roles.\(role.identifier).readability",
                reason: "Unreadable-media severity is only applicable to Audio or Artwork roles."
            )
        }
    }

    private func validateBlockingSeverity(_ severity: FindingSeverity, field: String) throws {
        guard severity == .error || severity == .warning else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "A constrained or indeterminate requirement must use error or warning severity."
            )
        }
    }

    private func validateIssueSeverity(_ severity: FindingSeverity, field: String) throws {
        guard severity != .pass else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "A finding severity cannot be pass."
            )
        }
    }

    private func requirements(for preset: Preset) -> [ResolvedRequirement] {
        var requirements: [ResolvedRequirement] = []
        if let extensions = preset.audio.allowedExtensions {
            requirements.append(ResolvedRequirement(identifier: "audio.allowed-formats", description: "Allowed audio extensions: \(extensions.joined(separator: ", ")).", severity: preset.audio.severity))
        }
        if let encodings = preset.audio.allowedEncodings {
            requirements.append(ResolvedRequirement(identifier: "audio.allowed-encodings", description: "Allowed inspected audio encodings: \(encodings.joined(separator: ", ")).", severity: preset.audio.severity))
        }
        if let sampleRate = preset.audio.sampleRate {
            requirements.append(ResolvedRequirement(identifier: "audio.sample-rate", description: numericDescription(sampleRate), severity: preset.audio.severity))
        }
        if let bitDepth = preset.audio.bitDepth {
            requirements.append(ResolvedRequirement(identifier: "audio.bit-depth", description: numericDescription(bitDepth), severity: preset.audio.severity))
        }
        if preset.audio.requireConsistentSampleRate {
            requirements.append(ResolvedRequirement(identifier: "audio.consistent-sample-rate", description: "Audio files must use one inspected sample rate.", severity: preset.audio.severity))
        }
        if preset.audio.requireConsistentBitDepth {
            requirements.append(ResolvedRequirement(identifier: "audio.consistent-bit-depth", description: "Linear PCM audio files must use one inspected PCM bit depth.", severity: preset.audio.severity))
        }
        if preset.audio.requireConsistentChannelCount {
            requirements.append(ResolvedRequirement(identifier: "audio.consistent-channel-count", description: "Audio files must use one inspected channel count.", severity: preset.audio.severity))
        }
        if let artwork = preset.artwork {
            requirements.append(ResolvedRequirement(identifier: "artwork.requirements", description: artworkDescription(artwork), severity: artwork.severity))
        }
        if preset.filename.ambiguousVersionPattern != nil {
            requirements.append(ResolvedRequirement(identifier: "filename.ambiguous-version", description: "Filename version markers must match the configured naming pattern.", severity: preset.filename.ambiguousVersionSeverity))
        }
        requirements.append(contentsOf: preset.roles.map { role in
            ResolvedRequirement(
                identifier: "role.\(role.identifier)",
                description: roleDescription(role),
                severity: role.severity
            )
        })
        requirements.append(ResolvedRequirement(identifier: "filesystem.service-files", description: "Service files are reported at \(preset.serviceFileSeverity.rawValue) severity.", severity: preset.serviceFileSeverity))
        requirements.append(ResolvedRequirement(identifier: "filesystem.symbolic-links", description: "Symbolic links are reported at \(preset.symbolicLinkSeverity.rawValue) severity.", severity: preset.symbolicLinkSeverity))
        requirements.append(ResolvedRequirement(identifier: "duplicate.exact", description: "Exact duplicate files are reported at \(preset.exactDuplicateSeverity.rawValue) severity.", severity: preset.exactDuplicateSeverity))
        return requirements
    }

    private func numericDescription(_ constraint: NumericConstraint) -> String {
        switch (constraint.minimum, constraint.maximum) {
        case let (.some(minimum), .some(maximum)) where minimum == maximum:
            return "Must equal \(minimum)."
        case let (.some(minimum), .some(maximum)):
            return "Must be between \(minimum) and \(maximum)."
        case let (.some(minimum), .none):
            return "Must be at least \(minimum)."
        case let (.none, .some(maximum)):
            return "Must be at most \(maximum)."
        case (.none, .none):
            return "No numeric bound is configured."
        }
    }

    private func artworkDescription(_ artwork: ArtworkRequirement) -> String {
        var descriptions: [String] = []
        if artwork.requiresSquare { descriptions.append("must be square") }
        if let width = artwork.minimumWidth { descriptions.append("width must be at least \(width) px") }
        if let height = artwork.minimumHeight { descriptions.append("height must be at least \(height) px") }
        return descriptions.isEmpty ? "No artwork dimensions are mandated." : descriptions.joined(separator: "; ") + "."
    }

    private func roleDescription(_ role: DeliveryRole) -> String {
        var details = [
            "\(role.required ? "Required" : "Optional") role \(role.name) (identifier: \(role.identifier))",
            "pattern: \(role.pattern)",
            "category: \(role.category?.rawValue ?? "any")",
            "allowed extensions: \(role.allowedExtensions?.joined(separator: ", ") ?? "any")",
        ]
        if role.category == .audio {
            details.append("allowed inspected audio encodings: \(role.allowedEncodings?.joined(separator: ", ") ?? "any")")
            details.append("channel count: \(role.channelCount.map { roleNumericDescription($0) } ?? "any")")
            details.append("sample rate: \(role.sampleRate.map { roleNumericDescription($0, unit: "Hz") } ?? "any")")
            details.append("PCM bit depth: \(role.bitDepth.map { roleNumericDescription($0) } ?? "any")")
        } else {
            details.append("audio-only inspected constraints: not applicable")
        }
        if role.category == .audio || role.category == .artwork {
            details.append("unreadable media severity: \(role.readability.rawValue)")
        } else {
            details.append("unreadable media severity: not applicable")
        }
        details.append("missing or constrained value severity: \(role.severity.rawValue)")
        details.append("multiple matches severity: \(role.ambiguitySeverity.rawValue)")
        return details.joined(separator: "; ") + "."
    }

    private func roleNumericDescription(_ constraint: NumericConstraint, unit: String? = nil) -> String {
        let suffix = unit.map { " \($0)" } ?? ""
        switch (constraint.minimum, constraint.maximum) {
        case let (.some(minimum), .some(maximum)) where minimum == maximum:
            return "exactly \(displayNumber(minimum))\(suffix)"
        case let (.some(minimum), .some(maximum)):
            return "\(displayNumber(minimum)) to \(displayNumber(maximum))\(suffix)"
        case let (.some(minimum), .none):
            return "at least \(displayNumber(minimum))\(suffix)"
        case let (.none, .some(maximum)):
            return "at most \(displayNumber(maximum))\(suffix)"
        case (.none, .none):
            return "any"
        }
    }

    private func displayNumber(_ value: Double) -> String {
        let text = String(value)
        return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
    }
}

private struct PresetStringBudget {
    private var aggregateStringByteCount = 0
    private var collectionValueCount = 0

    mutating func reserve(_ value: String, field: String) throws {
        let (newCount, overflow) = aggregateStringByteCount.addingReportingOverflow(value.utf8.count)
        guard !overflow, newCount <= PresetValidationLimits.maximumAggregateStringByteCount else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Preset strings exceed the 1048576-byte aggregate limit."
            )
        }
        aggregateStringByteCount = newCount
    }

    mutating func reserveCollectionValues(_ count: Int, field: String) throws {
        let (newCount, overflow) = collectionValueCount.addingReportingOverflow(count)
        guard !overflow, newCount <= PresetValidationLimits.maximumCollectionValueCount else {
            throw PreflightError.invalidPreset(
                field: field,
                reason: "Preset collections can contain at most 4096 configured values in aggregate."
            )
        }
        collectionValueCount = newCount
    }
}

private enum SafeRegularExpressionPolicy {
    private static let maximumBoundedRepetition = 256
    private static let trustedBuiltInPatterns: Set<String> = {
        Set(BuiltInPresets.all.flatMap { preset in
            preset.roles.map(\.pattern) + [preset.filename.ambiguousVersionPattern].compactMap { $0 }
        })
    }()

    private struct GroupState {
        var containsRepetition = false
        var containsAlternation = false
    }

    private enum Quantifier {
        case bounded(endIndex: Int, isVariable: Bool, canRepeatMoreThanOnce: Bool)
        case unbounded(endIndex: Int)
        case unsafe

        var isUnbounded: Bool {
            switch self {
            case .unbounded, .unsafe:
                true
            case .bounded:
                false
            }
        }

        var isVariable: Bool {
            switch self {
            case .bounded(_, let isVariable, _):
                isVariable
            case .unbounded, .unsafe:
                true
            }
        }

        var canRepeatMoreThanOnce: Bool {
            switch self {
            case .bounded(_, _, let canRepeatMoreThanOnce):
                canRepeatMoreThanOnce
            case .unbounded, .unsafe:
                true
            }
        }

        var isUnsafe: Bool {
            if case .unsafe = self { return true }
            return false
        }
    }

    static func isSafe(_ pattern: String) -> Bool {
        if trustedBuiltInPatterns.contains(pattern) {
            return true
        }

        let characters = Array(pattern)
        var groups = [GroupState()]
        var index = 0
        var inCharacterClass = false
        var escaped = false
        var previousWasQuantifier = false
        var variableQuantifierCount = 0
        var unboundedQuantifierCount = 0

        while index < characters.count {
            let character = characters[index]

            if escaped {
                if !inCharacterClass,
                   (character.isASCIIBackreferenceDigit || character == "k" || character == "g")
                {
                    return false
                }
                escaped = false
                previousWasQuantifier = false
                index += 1
                continue
            }

            if character == "\\" {
                escaped = true
                index += 1
                continue
            }

            if inCharacterClass {
                if character == "]" {
                    inCharacterClass = false
                    previousWasQuantifier = false
                }
                index += 1
                continue
            }

            if character == "[" {
                inCharacterClass = true
                previousWasQuantifier = false
                index += 1
                continue
            }

            if character == "(" {
                if index + 1 < characters.count, characters[index + 1] == "?" {
                    guard let bodyStart = allowedSpecialGroupBodyStart(
                        in: characters,
                        openingIndex: index
                    ) else {
                        return false
                    }
                    if bodyStart > index, characters[bodyStart - 1] == ")" {
                        previousWasQuantifier = false
                        index = bodyStart
                        continue
                    }
                    groups.append(GroupState())
                    previousWasQuantifier = false
                    index = bodyStart
                    continue
                }
                groups.append(GroupState())
                previousWasQuantifier = false
                index += 1
                continue
            }

            if character == ")" {
                guard groups.count > 1 else {
                    previousWasQuantifier = false
                    index += 1
                    continue
                }
                let closed = groups.removeLast()
                if let quantifier = quantifier(at: index + 1, in: characters) {
                    if quantifier.isUnsafe {
                        return false
                    }
                    if quantifier.canRepeatMoreThanOnce,
                       (closed.containsRepetition || closed.containsAlternation)
                    {
                        return false
                    }
                }
                groups[groups.count - 1].containsRepetition =
                    groups[groups.count - 1].containsRepetition || closed.containsRepetition
                groups[groups.count - 1].containsAlternation =
                    groups[groups.count - 1].containsAlternation || closed.containsAlternation
                previousWasQuantifier = false
                index += 1
                continue
            }

            if character == "|" {
                groups[groups.count - 1].containsAlternation = true
                previousWasQuantifier = false
                index += 1
                continue
            }

            if let quantifier = quantifier(at: index, in: characters) {
                guard !previousWasQuantifier else { return false }
                if quantifier.isVariable {
                    variableQuantifierCount += 1
                }
                if quantifier.isUnbounded {
                    unboundedQuantifierCount += 1
                }
                switch quantifier {
                case .bounded(let endIndex, _, _):
                    groups[groups.count - 1].containsRepetition = true
                    previousWasQuantifier = true
                    index = endIndex + 1
                case .unbounded(let endIndex):
                    groups[groups.count - 1].containsRepetition = true
                    previousWasQuantifier = true
                    index = endIndex + 1
                case .unsafe:
                    return false
                }
                continue
            }

            previousWasQuantifier = false
            index += 1
        }

        if variableQuantifierCount <= 1 {
            return true
        }

        return variableQuantifierCount == 2
            && unboundedQuantifierCount == 2
            && pattern.contains("\\s*\\d+")
    }

    private static func allowedSpecialGroupBodyStart(
        in characters: [Character],
        openingIndex: Int
    ) -> Int? {
        let markerIndex = openingIndex + 2
        guard markerIndex < characters.count else { return nil }
        if characters[markerIndex] == ":" {
            return markerIndex + 1
        }

        var index = markerIndex
        var sawFlag = false
        while index < characters.count,
              "imsxw-".contains(characters[index])
        {
            sawFlag = true
            index += 1
        }
        guard sawFlag, index < characters.count else { return nil }
        if characters[index] == ":" {
            return index + 1
        }
        if characters[index] == ")" {
            return index + 1
        }
        return nil
    }

    private static func quantifier(at index: Int, in characters: [Character]) -> Quantifier? {
        guard index < characters.count else { return nil }
        switch characters[index] {
        case "*", "+":
            return .unbounded(endIndex: index)
        case "?":
            return .bounded(
                endIndex: index,
                isVariable: true,
                canRepeatMoreThanOnce: false
            )
        case "{":
            var cursor = index + 1
            var body = ""
            while cursor < characters.count, characters[cursor] != "}" {
                body.append(characters[cursor])
                cursor += 1
            }
            guard cursor < characters.count, !body.isEmpty else { return nil }
            let parts = body.split(separator: ",", omittingEmptySubsequences: false)
            guard parts.count <= 2,
                  !parts[0].isEmpty,
                  parts[0].allSatisfy(\.isNumber),
                  (parts.count == 1 || parts[1].isEmpty || parts[1].allSatisfy(\.isNumber))
            else {
                return nil
            }
            guard let lowerBound = Int(parts[0]), lowerBound <= maximumBoundedRepetition else {
                return .unsafe
            }
            if parts.count == 2, parts[1].isEmpty {
                return .unbounded(endIndex: cursor)
            }
            let upperBound: Int
            if parts.count == 2 {
                guard let parsedUpperBound = Int(parts[1]),
                      parsedUpperBound >= lowerBound,
                      parsedUpperBound <= maximumBoundedRepetition
                else {
                    return .unsafe
                }
                upperBound = parsedUpperBound
            } else {
                upperBound = lowerBound
            }
            return .bounded(
                endIndex: cursor,
                isVariable: lowerBound != upperBound,
                canRepeatMoreThanOnce: upperBound > 1
            )
        default:
            return nil
        }
    }
}

private extension Character {
    var isASCIIIdentifierCharacter: Bool {
        guard unicodeScalars.count == 1, let scalar = unicodeScalars.first else { return false }
        return scalar.isASCII && (
            (scalar.value >= 48 && scalar.value <= 57)
                || (scalar.value >= 65 && scalar.value <= 90)
                || (scalar.value >= 97 && scalar.value <= 122)
        )
    }

    var isASCIIBackreferenceDigit: Bool {
        guard unicodeScalars.count == 1, let scalar = unicodeScalars.first else { return false }
        return scalar.value >= 49 && scalar.value <= 57
    }
}
