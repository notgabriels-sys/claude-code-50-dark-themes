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

public struct PresetResolver: PresetResolving {
    public init() {}

    public func resolve(_ preset: Preset) throws -> ResolvedPreset {
        guard preset.schemaVersion == "1.0" else {
            throw PreflightError.invalidPreset(
                field: "schemaVersion",
                reason: "Only preset schema version 1.0 is supported."
            )
        }
        guard !preset.identifier.isEmpty else {
            throw PreflightError.invalidPreset(field: "identifier", reason: "The identifier cannot be empty.")
        }
        guard !preset.name.isEmpty else {
            throw PreflightError.invalidPreset(field: "name", reason: "The name cannot be empty.")
        }

        try validate(preset.audio.sampleRate, field: "audio.sampleRate")
        try validate(preset.audio.bitDepth, field: "audio.bitDepth")
        try validateStrings(preset.audio.allowedExtensions, field: "audio.allowedExtensions")
        try validateStrings(preset.audio.allowedEncodings, field: "audio.allowedEncodings")
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

        let duplicateIdentifiers = Dictionary(grouping: preset.roles, by: \.identifier)
            .first { $0.value.count > 1 }?.key
        if let duplicateIdentifiers {
            throw PreflightError.invalidPreset(field: "roles", reason: "Role identifiers must be unique: \(duplicateIdentifiers).")
        }

        var compiledRoles: [CompiledDeliveryRole] = []
        for role in preset.roles {
            guard !role.identifier.isEmpty else {
                throw PreflightError.invalidPreset(field: "roles.identifier", reason: "The identifier cannot be empty.")
            }
            try validate(role.channelCount, field: "roles.\(role.identifier).channelCount")
            try validate(role.sampleRate, field: "roles.\(role.identifier).sampleRate")
            try validate(role.bitDepth, field: "roles.\(role.identifier).bitDepth")
            try validateStrings(role.allowedExtensions, field: "roles.\(role.identifier).allowedExtensions")
            try validateStrings(role.allowedEncodings, field: "roles.\(role.identifier).allowedEncodings")
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
            } else {
                try validateIssueSeverity(role.readability, field: "roles.\(role.identifier).readability")
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

    private func validateStrings(_ values: [String]?, field: String) throws {
        guard let values else { return }
        guard !values.isEmpty, values.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            throw PreflightError.invalidPreset(field: field, reason: "Configured values cannot be empty.")
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
            ResolvedRequirement(identifier: "role.\(role.identifier)", description: "\(role.required ? "Required" : "Optional") role \(role.name) is matched by its configured pattern.", severity: role.severity)
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
}
