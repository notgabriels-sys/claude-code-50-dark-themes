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
    public let sampleRate: NumericConstraint?
    public let bitDepth: NumericConstraint?
    public let requireConsistentSampleRate: Bool
    public let severity: FindingSeverity

    public init(
        allowedExtensions: [String]? = nil,
        sampleRate: NumericConstraint? = nil,
        bitDepth: NumericConstraint? = nil,
        requireConsistentSampleRate: Bool = false,
        severity: FindingSeverity = .warning
    ) {
        self.allowedExtensions = allowedExtensions
        self.sampleRate = sampleRate
        self.bitDepth = bitDepth
        self.requireConsistentSampleRate = requireConsistentSampleRate
        self.severity = severity
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
        guard !preset.identifier.isEmpty else {
            throw PreflightError.invalidPreset(field: "identifier", reason: "The identifier cannot be empty.")
        }
        guard !preset.name.isEmpty else {
            throw PreflightError.invalidPreset(field: "name", reason: "The name cannot be empty.")
        }

        try validate(preset.audio.sampleRate, field: "audio.sampleRate")
        try validate(preset.audio.bitDepth, field: "audio.bitDepth")
        if let artwork = preset.artwork {
            if let width = artwork.minimumWidth, width <= 0 {
                throw PreflightError.invalidPreset(field: "artwork.minimumWidth", reason: "The minimum must be greater than zero.")
            }
            if let height = artwork.minimumHeight, height <= 0 {
                throw PreflightError.invalidPreset(field: "artwork.minimumHeight", reason: "The minimum must be greater than zero.")
            }
        }

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

    private func requirements(for preset: Preset) -> [ResolvedRequirement] {
        var requirements: [ResolvedRequirement] = []
        if let extensions = preset.audio.allowedExtensions {
            requirements.append(ResolvedRequirement(identifier: "audio.allowed-formats", description: "Allowed audio extensions: \(extensions.joined(separator: ", ")).", severity: .warning))
        }
        if let sampleRate = preset.audio.sampleRate {
            requirements.append(ResolvedRequirement(identifier: "audio.sample-rate", description: numericDescription(sampleRate), severity: .warning))
        }
        if let bitDepth = preset.audio.bitDepth {
            requirements.append(ResolvedRequirement(identifier: "audio.bit-depth", description: numericDescription(bitDepth), severity: .warning))
        }
        if preset.audio.requireConsistentSampleRate {
            requirements.append(ResolvedRequirement(identifier: "audio.consistent-sample-rate", description: "Audio files must use one inspected sample rate.", severity: .warning))
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
