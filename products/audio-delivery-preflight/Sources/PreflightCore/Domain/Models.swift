import Foundation

public enum FindingSeverity: String, Codable, Sendable, Equatable, CaseIterable {
    case error
    case warning
    case information
    case pass
}

public enum OverallStatus: String, Codable, Sendable, Equatable {
    case ready
    case needsReview
    case requirementsNotMet
    case incomplete

    public static func completed(findings: [Finding]) -> OverallStatus {
        if findings.contains(where: { $0.severity == .error }) {
            return .requirementsNotMet
        }

        if findings.contains(where: { $0.severity == .warning }) {
            return .needsReview
        }

        return .ready
    }
}

public enum FileCategory: String, Codable, Sendable, Equatable {
    case audio
    case artwork
    case document
    case serviceFile
    case other
}

public enum FileKind: String, Codable, Sendable, Equatable {
    case regular
    case directory
    case symbolicLink
    case special
}

public enum InspectionStatus: String, Codable, Sendable, Equatable {
    case notInspected
    case succeeded
    case failed
}

public enum ChecksumStatus: String, Codable, Sendable, Equatable {
    case notCalculated
    case succeeded
    case failed
}

public enum RuleOrigin: String, Codable, Sendable, Equatable {
    case engine
    case preset
}

public struct RelativePath: Sendable, Codable, Equatable, Hashable {
    public let value: String

    public init(_ value: String) throws {
        guard !value.isEmpty else {
            throw PreflightError.invalidRelativePath(reason: "A relative path cannot be empty.")
        }

        guard !value.hasPrefix("/") else {
            throw PreflightError.invalidRelativePath(reason: "An absolute path cannot be exported.")
        }

        let bytes = Array(value.utf8)
        let hasWindowsDrivePrefix = bytes.count >= 2
            && ((bytes[0] >= 65 && bytes[0] <= 90) || (bytes[0] >= 97 && bytes[0] <= 122))
            && bytes[1] == 58
        guard !hasWindowsDrivePrefix else {
            throw PreflightError.invalidRelativePath(reason: "A drive-qualified path cannot be exported.")
        }

        guard !value.contains("\\") else {
            throw PreflightError.invalidRelativePath(reason: "A serialized relative path must use forward slashes only.")
        }

        let components = value.split(separator: "/", omittingEmptySubsequences: false)
        guard components.allSatisfy({ component in
            !component.isEmpty && component != "." && component != ".."
        }) else {
            throw PreflightError.invalidRelativePath(reason: "A relative path cannot contain empty, current-directory, or parent-directory components.")
        }

        self.value = value
    }

    public init(from decoder: Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

public enum EvidenceValue: Sendable, Codable, Equatable {
    case string(String)
    case number(Double)
    case integer(Int)
    case boolean(Bool)
    case unknown

    private enum CodingKeys: String, CodingKey {
        case type
        case string
        case number
        case integer
        case boolean
    }

    private enum Kind: String, Codable {
        case string
        case number
        case integer
        case boolean
        case unknown
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .type) {
        case .string:
            self = .string(try container.decode(String.self, forKey: .string))
        case .number:
            self = .number(try container.decode(Double.self, forKey: .number))
        case .integer:
            self = .integer(try container.decode(Int.self, forKey: .integer))
        case .boolean:
            self = .boolean(try container.decode(Bool.self, forKey: .boolean))
        case .unknown:
            self = .unknown
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .string(let value):
            try container.encode(Kind.string, forKey: .type)
            try container.encode(value, forKey: .string)
        case .number(let value):
            try container.encode(Kind.number, forKey: .type)
            try container.encode(value, forKey: .number)
        case .integer(let value):
            try container.encode(Kind.integer, forKey: .type)
            try container.encode(value, forKey: .integer)
        case .boolean(let value):
            try container.encode(Kind.boolean, forKey: .type)
            try container.encode(value, forKey: .boolean)
        case .unknown:
            try container.encode(Kind.unknown, forKey: .type)
        }
    }
}

public struct Evidence: Sendable, Codable, Equatable {
    public let label: String
    public let value: EvidenceValue

    public init(label: String, value: EvidenceValue) {
        self.label = label
        self.value = value
    }
}

public struct Finding: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let ruleID: String
    public let severity: FindingSeverity
    public let title: String
    public let explanation: String
    public let affectedPaths: [RelativePath]
    public let evidence: [Evidence]
    public let expected: String
    public let suggestedAction: String
    public let origin: RuleOrigin
    public let engineVersion: String

    public init(
        schemaVersion: String = "1.0",
        ruleID: String,
        severity: FindingSeverity,
        title: String,
        explanation: String,
        affectedPaths: [RelativePath],
        evidence: [Evidence],
        expected: String,
        suggestedAction: String,
        origin: RuleOrigin,
        engineVersion: String
    ) {
        self.schemaVersion = schemaVersion
        self.ruleID = ruleID
        self.severity = severity
        self.title = title
        self.explanation = explanation
        self.affectedPaths = affectedPaths
        self.evidence = evidence
        self.expected = expected
        self.suggestedAction = suggestedAction
        self.origin = origin
        self.engineVersion = engineVersion
    }
}

public struct AudioProperties: Sendable, Codable, Equatable {
    public let container: String?
    public let encoding: String?
    public let durationSeconds: Double?
    public let channelCount: Int?
    public let sampleRate: Double?
    public let pcmBitDepth: Int?
    public let isReadable: Bool?
    public let metadata: [String: String]

    public init(
        container: String? = nil,
        encoding: String? = nil,
        durationSeconds: Double? = nil,
        channelCount: Int? = nil,
        sampleRate: Double? = nil,
        pcmBitDepth: Int? = nil,
        isReadable: Bool? = nil,
        metadata: [String: String] = [:]
    ) {
        self.container = container
        self.encoding = encoding
        self.durationSeconds = durationSeconds
        self.channelCount = channelCount
        self.sampleRate = sampleRate
        self.pcmBitDepth = pcmBitDepth
        self.isReadable = isReadable
        self.metadata = metadata
    }
}

public struct ImageProperties: Sendable, Codable, Equatable {
    public let pixelWidth: Int?
    public let pixelHeight: Int?
    public let aspectRatio: Double?
    public let format: String?
    public let colorModel: String?
    public let hasAlpha: Bool?
    public let byteSize: Int64?
    public let isReadable: Bool?

    public init(
        pixelWidth: Int? = nil,
        pixelHeight: Int? = nil,
        aspectRatio: Double? = nil,
        format: String? = nil,
        colorModel: String? = nil,
        hasAlpha: Bool? = nil,
        byteSize: Int64? = nil,
        isReadable: Bool? = nil
    ) {
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.aspectRatio = aspectRatio
        self.format = format
        self.colorModel = colorModel
        self.hasAlpha = hasAlpha
        self.byteSize = byteSize
        self.isReadable = isReadable
    }
}

public struct InventoryEntry: Sendable, Codable, Equatable {
    public let relativePath: RelativePath
    public let normalizedFilename: String
    public let normalizedExtension: String
    public let category: FileCategory
    public let byteSize: Int64?
    public let modificationDate: Date?
    public let kind: FileKind
    public let sha256: String?
    public let checksumStatus: ChecksumStatus
    public let inspectionStatus: InspectionStatus
    public let audioProperties: AudioProperties?
    public let imageProperties: ImageProperties?
    public let evidence: [Evidence]

    public init(
        relativePath: RelativePath,
        normalizedFilename: String,
        normalizedExtension: String,
        category: FileCategory,
        byteSize: Int64? = nil,
        modificationDate: Date? = nil,
        kind: FileKind,
        sha256: String? = nil,
        inspectionStatus: InspectionStatus = .notInspected,
        checksumStatus: ChecksumStatus? = nil,
        audioProperties: AudioProperties? = nil,
        imageProperties: ImageProperties? = nil,
        evidence: [Evidence] = []
    ) {
        self.relativePath = relativePath
        self.normalizedFilename = normalizedFilename
        self.normalizedExtension = normalizedExtension
        self.category = category
        self.byteSize = byteSize
        self.modificationDate = modificationDate
        self.kind = kind
        self.sha256 = sha256
        self.checksumStatus = checksumStatus ?? (sha256 == nil ? .notCalculated : .succeeded)
        self.inspectionStatus = inspectionStatus
        self.audioProperties = audioProperties
        self.imageProperties = imageProperties
        self.evidence = evidence
    }

    private enum CodingKeys: String, CodingKey {
        case relativePath
        case normalizedFilename
        case normalizedExtension
        case category
        case byteSize
        case modificationDate
        case kind
        case sha256
        case checksumStatus
        case inspectionStatus
        case audioProperties
        case imageProperties
        case evidence
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let sha256 = try container.decodeIfPresent(String.self, forKey: .sha256)

        self.init(
            relativePath: try container.decode(RelativePath.self, forKey: .relativePath),
            normalizedFilename: try container.decode(String.self, forKey: .normalizedFilename),
            normalizedExtension: try container.decode(String.self, forKey: .normalizedExtension),
            category: try container.decode(FileCategory.self, forKey: .category),
            byteSize: try container.decodeIfPresent(Int64.self, forKey: .byteSize),
            modificationDate: try container.decodeIfPresent(Date.self, forKey: .modificationDate),
            kind: try container.decode(FileKind.self, forKey: .kind),
            sha256: sha256,
            inspectionStatus: try container.decode(InspectionStatus.self, forKey: .inspectionStatus),
            checksumStatus: try container.decodeIfPresent(ChecksumStatus.self, forKey: .checksumStatus),
            audioProperties: try container.decodeIfPresent(AudioProperties.self, forKey: .audioProperties),
            imageProperties: try container.decodeIfPresent(ImageProperties.self, forKey: .imageProperties),
            evidence: try container.decode([Evidence].self, forKey: .evidence)
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(relativePath, forKey: .relativePath)
        try container.encode(normalizedFilename, forKey: .normalizedFilename)
        try container.encode(normalizedExtension, forKey: .normalizedExtension)
        try container.encode(category, forKey: .category)
        try container.encodeIfPresent(byteSize, forKey: .byteSize)
        try container.encodeIfPresent(modificationDate, forKey: .modificationDate)
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(sha256, forKey: .sha256)
        try container.encode(checksumStatus, forKey: .checksumStatus)
        try container.encode(inspectionStatus, forKey: .inspectionStatus)
        try container.encodeIfPresent(audioProperties, forKey: .audioProperties)
        try container.encodeIfPresent(imageProperties, forKey: .imageProperties)
        try container.encode(evidence, forKey: .evidence)
    }
}

public struct ResolvedRequirement: Sendable, Codable, Equatable {
    public let identifier: String
    public let description: String
    public let severity: FindingSeverity

    public init(identifier: String, description: String, severity: FindingSeverity) {
        self.identifier = identifier
        self.description = description
        self.severity = severity
    }
}

public struct ResolvedPreset: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let identifier: String
    public let name: String
    public let requirements: [ResolvedRequirement]
    public let definition: Preset
    let compiledRoles: [CompiledDeliveryRole]

    init(
        schemaVersion: String,
        identifier: String,
        name: String,
        requirements: [ResolvedRequirement],
        definition: Preset,
        compiledRoles: [CompiledDeliveryRole]
    ) {
        self.schemaVersion = schemaVersion
        self.identifier = identifier
        self.name = name
        self.requirements = requirements
        self.definition = definition
        self.compiledRoles = compiledRoles
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case identifier
        case name
        case requirements
        case definition
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let schemaVersion = try container.decode(String.self, forKey: .schemaVersion)
        let identifier = try container.decode(String.self, forKey: .identifier)
        let name = try container.decode(String.self, forKey: .name)
        let requirements = try container.decode([ResolvedRequirement].self, forKey: .requirements)
        let definition = try container.decode(Preset.self, forKey: .definition)
        let resolvedDefinition = try PresetResolver().resolve(definition)

        guard schemaVersion == resolvedDefinition.schemaVersion else {
            throw DecodingError.dataCorruptedError(forKey: .schemaVersion, in: container, debugDescription: "The resolved preset schema version does not match its definition.")
        }
        guard identifier == resolvedDefinition.identifier else {
            throw DecodingError.dataCorruptedError(forKey: .identifier, in: container, debugDescription: "The resolved preset identifier does not match its definition.")
        }
        guard name == resolvedDefinition.name else {
            throw DecodingError.dataCorruptedError(forKey: .name, in: container, debugDescription: "The resolved preset name does not match its definition.")
        }
        guard requirements == resolvedDefinition.requirements else {
            throw DecodingError.dataCorruptedError(forKey: .requirements, in: container, debugDescription: "The resolved preset requirements do not match its definition.")
        }
        self = resolvedDefinition
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(identifier, forKey: .identifier)
        try container.encode(name, forKey: .name)
        try container.encode(requirements, forKey: .requirements)
        try container.encode(definition, forKey: .definition)
    }

    public static func == (left: ResolvedPreset, right: ResolvedPreset) -> Bool {
        left.schemaVersion == right.schemaVersion
            && left.identifier == right.identifier
            && left.name == right.name
            && left.requirements == right.requirements
            && left.definition == right.definition
    }
}

public struct ScanRequest: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let selectedFolderURL: URL
    public let preset: ResolvedPreset
    public let applicationVersion: String
    public let engineVersion: String
    public let reportOutputURLs: [URL]

    public init(
        schemaVersion: String = "1.0",
        selectedFolderURL: URL,
        preset: ResolvedPreset,
        applicationVersion: String,
        engineVersion: String,
        reportOutputURLs: [URL] = []
    ) {
        self.schemaVersion = schemaVersion
        self.selectedFolderURL = selectedFolderURL
        self.preset = preset
        self.applicationVersion = applicationVersion
        self.engineVersion = engineVersion
        self.reportOutputURLs = reportOutputURLs
    }
}

public struct RoleAssignment: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let roleIdentifier: String
    public let roleName: String
    public let pattern: String
    public let matchedPath: RelativePath
    public let category: FileCategory
    public let acceptedEvidence: [Evidence]

    public init(
        schemaVersion: String = "1.0",
        roleIdentifier: String,
        roleName: String,
        pattern: String,
        matchedPath: RelativePath,
        category: FileCategory,
        acceptedEvidence: [Evidence]
    ) {
        self.schemaVersion = schemaVersion
        self.roleIdentifier = roleIdentifier
        self.roleName = roleName
        self.pattern = pattern
        self.matchedPath = matchedPath
        self.category = category
        self.acceptedEvidence = acceptedEvidence
    }
}

public struct ScanResult: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let selectedFolderName: String
    public let preset: ResolvedPreset
    public let applicationVersion: String
    public let engineVersion: String
    public let startedAt: Date
    public let completedAt: Date?
    public let inventory: [InventoryEntry]
    public let roleAssignments: [RoleAssignment]
    public let findings: [Finding]
    public let overallStatus: OverallStatus

    public init(
        schemaVersion: String = "1.0",
        selectedFolderName: String,
        preset: ResolvedPreset,
        applicationVersion: String,
        engineVersion: String,
        startedAt: Date,
        completedAt: Date? = nil,
        inventory: [InventoryEntry],
        roleAssignments: [RoleAssignment] = [],
        findings: [Finding],
        overallStatus: OverallStatus
    ) {
        self.schemaVersion = schemaVersion
        self.selectedFolderName = selectedFolderName
        self.preset = preset
        self.applicationVersion = applicationVersion
        self.engineVersion = engineVersion
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.inventory = inventory
        self.roleAssignments = roleAssignments
        self.findings = findings
        self.overallStatus = overallStatus
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case selectedFolderName
        case preset
        case applicationVersion
        case engineVersion
        case startedAt
        case completedAt
        case inventory
        case roleAssignments
        case findings
        case overallStatus
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            schemaVersion: try container.decode(String.self, forKey: .schemaVersion),
            selectedFolderName: try container.decode(String.self, forKey: .selectedFolderName),
            preset: try container.decode(ResolvedPreset.self, forKey: .preset),
            applicationVersion: try container.decode(String.self, forKey: .applicationVersion),
            engineVersion: try container.decode(String.self, forKey: .engineVersion),
            startedAt: try container.decode(Date.self, forKey: .startedAt),
            completedAt: try container.decodeIfPresent(Date.self, forKey: .completedAt),
            inventory: try container.decode([InventoryEntry].self, forKey: .inventory),
            roleAssignments: try container.decodeIfPresent([RoleAssignment].self, forKey: .roleAssignments) ?? [],
            findings: try container.decode([Finding].self, forKey: .findings),
            overallStatus: try container.decode(OverallStatus.self, forKey: .overallStatus)
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(selectedFolderName, forKey: .selectedFolderName)
        try container.encode(preset, forKey: .preset)
        try container.encode(applicationVersion, forKey: .applicationVersion)
        try container.encode(engineVersion, forKey: .engineVersion)
        try container.encode(startedAt, forKey: .startedAt)
        try container.encodeIfPresent(completedAt, forKey: .completedAt)
        try container.encode(inventory, forKey: .inventory)
        try container.encode(roleAssignments, forKey: .roleAssignments)
        try container.encode(findings, forKey: .findings)
        try container.encode(overallStatus, forKey: .overallStatus)
    }
}
