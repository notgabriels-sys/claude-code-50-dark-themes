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
        self.inspectionStatus = inspectionStatus
        self.audioProperties = audioProperties
        self.imageProperties = imageProperties
        self.evidence = evidence
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

    public init(
        schemaVersion: String = "1.0",
        identifier: String,
        name: String,
        requirements: [ResolvedRequirement]
    ) {
        self.schemaVersion = schemaVersion
        self.identifier = identifier
        self.name = name
        self.requirements = requirements
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

public struct ScanResult: Sendable, Codable, Equatable {
    public let schemaVersion: String
    public let selectedFolderName: String
    public let preset: ResolvedPreset
    public let applicationVersion: String
    public let engineVersion: String
    public let startedAt: Date
    public let completedAt: Date?
    public let inventory: [InventoryEntry]
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
        self.findings = findings
        self.overallStatus = overallStatus
    }
}
