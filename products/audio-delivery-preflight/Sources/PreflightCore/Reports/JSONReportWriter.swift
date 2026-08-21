import Foundation

public struct JSONReportWriter: Sendable {
    public init() {}

    public func data(for result: ScanResult) throws -> Data {
        let report = try JSONReportV1(result: result)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(report)
    }
}

enum ReportDisplayName {
    static func safeComponent(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != ".", trimmed != ".." else { return nil }
        guard !value.contains("/"), !value.contains("\\") else { return nil }
        guard value.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else { return nil }
        let bytes = Array(value.utf8)
        let driveQualified = bytes.count >= 2
            && ((65...90).contains(bytes[0]) || (97...122).contains(bytes[0]))
            && bytes[1] == 58
        guard !driveQualified else { return nil }
        return value
    }
}

private struct JSONReportV1: Encodable {
    let schemaVersion: String
    let selectedFolderName: String
    let preset: JSONResolvedPresetV1
    let applicationVersion: String
    let engineVersion: String
    let startedAt: Date
    let completedAt: Date?
    let inventory: [JSONInventoryEntryV1]
    let findings: [JSONFindingV1]
    let overallStatus: String

    init(result: ScanResult) throws {
        guard let selectedFolderName = ReportDisplayName.safeComponent(result.selectedFolderName) else {
            throw PreflightError.exportFailed(reason: "The selected folder name cannot be exported safely.")
        }
        schemaVersion = "1.0"
        self.selectedFolderName = selectedFolderName
        preset = JSONResolvedPresetV1(result.preset)
        applicationVersion = result.applicationVersion
        engineVersion = result.engineVersion
        startedAt = result.startedAt
        completedAt = result.completedAt
        inventory = try result.inventory.map(JSONInventoryEntryV1.init)
        findings = result.findings.map(JSONFindingV1.init)
        overallStatus = result.overallStatus.rawValue
    }
}

private struct JSONResolvedPresetV1: Encodable {
    let schemaVersion: String
    let identifier: String
    let name: String
    let requirements: [JSONResolvedRequirementV1]
    let definition: JSONPresetV1

    init(_ value: ResolvedPreset) {
        schemaVersion = value.schemaVersion
        identifier = value.identifier
        name = value.name
        requirements = value.requirements.map(JSONResolvedRequirementV1.init)
        definition = JSONPresetV1(value.definition)
    }
}

private struct JSONResolvedRequirementV1: Encodable {
    let identifier: String
    let description: String
    let severity: String

    init(_ value: ResolvedRequirement) {
        identifier = value.identifier
        description = value.description
        severity = value.severity.rawValue
    }
}

private struct JSONPresetV1: Encodable {
    let schemaVersion: String
    let identifier: String
    let name: String
    let audio: JSONAudioRequirementV1
    let artwork: JSONArtworkRequirementV1?
    let filename: JSONFilenameRequirementV1
    let roles: [JSONDeliveryRoleV1]
    let serviceFileSeverity: String
    let symbolicLinkSeverity: String
    let exactDuplicateSeverity: String

    init(_ value: Preset) {
        schemaVersion = value.schemaVersion
        identifier = value.identifier
        name = value.name
        audio = JSONAudioRequirementV1(value.audio)
        artwork = value.artwork.map(JSONArtworkRequirementV1.init)
        filename = JSONFilenameRequirementV1(value.filename)
        roles = value.roles.map(JSONDeliveryRoleV1.init)
        serviceFileSeverity = value.serviceFileSeverity.rawValue
        symbolicLinkSeverity = value.symbolicLinkSeverity.rawValue
        exactDuplicateSeverity = value.exactDuplicateSeverity.rawValue
    }
}

private struct JSONNumericConstraintV1: Encodable {
    let minimum: Double?
    let maximum: Double?

    init(_ value: NumericConstraint) {
        minimum = value.minimum
        maximum = value.maximum
    }
}

private struct JSONAudioRequirementV1: Encodable {
    let allowedExtensions: [String]?
    let allowedEncodings: [String]?
    let sampleRate: JSONNumericConstraintV1?
    let bitDepth: JSONNumericConstraintV1?
    let requireConsistentSampleRate: Bool
    let requireConsistentBitDepth: Bool
    let requireConsistentChannelCount: Bool
    let severity: String

    init(_ value: AudioRequirement) {
        allowedExtensions = value.allowedExtensions
        allowedEncodings = value.allowedEncodings
        sampleRate = value.sampleRate.map(JSONNumericConstraintV1.init)
        bitDepth = value.bitDepth.map(JSONNumericConstraintV1.init)
        requireConsistentSampleRate = value.requireConsistentSampleRate
        requireConsistentBitDepth = value.requireConsistentBitDepth
        requireConsistentChannelCount = value.requireConsistentChannelCount
        severity = value.severity.rawValue
    }
}

private struct JSONArtworkRequirementV1: Encodable {
    let minimumWidth: Int?
    let minimumHeight: Int?
    let requiresSquare: Bool
    let severity: String

    init(_ value: ArtworkRequirement) {
        minimumWidth = value.minimumWidth
        minimumHeight = value.minimumHeight
        requiresSquare = value.requiresSquare
        severity = value.severity.rawValue
    }
}

private struct JSONFilenameRequirementV1: Encodable {
    let ambiguousVersionPattern: String?
    let ambiguousVersionSeverity: String

    init(_ value: FilenameRequirement) {
        ambiguousVersionPattern = value.ambiguousVersionPattern
        ambiguousVersionSeverity = value.ambiguousVersionSeverity.rawValue
    }
}

private struct JSONDeliveryRoleV1: Encodable {
    let identifier: String
    let name: String
    let pattern: String
    let required: Bool
    let category: String?
    let allowedExtensions: [String]?
    let allowedEncodings: [String]?
    let channelCount: JSONNumericConstraintV1?
    let sampleRate: JSONNumericConstraintV1?
    let bitDepth: JSONNumericConstraintV1?
    let readability: String
    let severity: String
    let ambiguitySeverity: String

    init(_ value: DeliveryRole) {
        identifier = value.identifier
        name = value.name
        pattern = value.pattern
        required = value.required
        category = value.category?.rawValue
        allowedExtensions = value.allowedExtensions
        allowedEncodings = value.allowedEncodings
        channelCount = value.channelCount.map(JSONNumericConstraintV1.init)
        sampleRate = value.sampleRate.map(JSONNumericConstraintV1.init)
        bitDepth = value.bitDepth.map(JSONNumericConstraintV1.init)
        readability = value.readability.rawValue
        severity = value.severity.rawValue
        ambiguitySeverity = value.ambiguitySeverity.rawValue
    }
}

private struct JSONInventoryEntryV1: Encodable {
    let relativePath: String
    let normalizedFilename: String
    let normalizedExtension: String
    let category: String
    let byteSize: Int64?
    let modificationDate: Date?
    let kind: String
    let sha256: String?
    let checksumStatus: String
    let inspectionStatus: String
    let audioProperties: JSONAudioPropertiesV1?
    let imageProperties: JSONImagePropertiesV1?
    let evidence: [JSONEvidenceV1]

    init(_ entry: InventoryEntry) throws {
        let path = entry.relativePath.value
        guard Self.isExportSafeRelativePath(path) else {
            throw PreflightError.exportFailed(reason: "The report contains an unsafe relative path.")
        }
        relativePath = path
        normalizedFilename = entry.normalizedFilename
        normalizedExtension = entry.normalizedExtension
        category = entry.category.rawValue
        byteSize = entry.byteSize
        modificationDate = entry.modificationDate
        kind = entry.kind.rawValue
        sha256 = entry.sha256
        checksumStatus = entry.checksumStatus.rawValue
        inspectionStatus = entry.inspectionStatus.rawValue
        audioProperties = entry.audioProperties.map(JSONAudioPropertiesV1.init)
        imageProperties = entry.imageProperties.map(JSONImagePropertiesV1.init)
        evidence = entry.evidence.map(JSONEvidenceV1.init)
    }

    private static func isExportSafeRelativePath(_ path: String) -> Bool {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("\\") else { return false }
        let bytes = Array(path.utf8)
        guard !(bytes.count >= 2 && bytes[1] == 58 && ((65...90).contains(bytes[0]) || (97...122).contains(bytes[0]))) else { return false }
        return path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy {
            !$0.isEmpty && $0 != "." && $0 != ".."
        }
    }
}

private struct JSONAudioPropertiesV1: Encodable {
    let container: String?
    let encoding: String?
    let durationSeconds: Double?
    let channelCount: Int?
    let sampleRate: Double?
    let pcmBitDepth: Int?
    let isReadable: Bool?
    let metadata: [String: String]

    init(_ value: AudioProperties) {
        container = value.container
        encoding = value.encoding
        durationSeconds = value.durationSeconds
        channelCount = value.channelCount
        sampleRate = value.sampleRate
        pcmBitDepth = value.pcmBitDepth
        isReadable = value.isReadable
        metadata = value.metadata
    }
}

private struct JSONImagePropertiesV1: Encodable {
    let pixelWidth: Int?
    let pixelHeight: Int?
    let aspectRatio: Double?
    let format: String?
    let colorModel: String?
    let hasAlpha: Bool?
    let byteSize: Int64?
    let isReadable: Bool?

    init(_ value: ImageProperties) {
        pixelWidth = value.pixelWidth
        pixelHeight = value.pixelHeight
        aspectRatio = value.aspectRatio
        format = value.format
        colorModel = value.colorModel
        hasAlpha = value.hasAlpha
        byteSize = value.byteSize
        isReadable = value.isReadable
    }
}

private struct JSONFindingV1: Encodable {
    let schemaVersion: String
    let ruleID: String
    let severity: String
    let title: String
    let explanation: String
    let affectedPaths: [String]
    let evidence: [JSONEvidenceV1]
    let expected: String
    let suggestedAction: String
    let origin: String
    let engineVersion: String

    init(_ value: Finding) {
        schemaVersion = value.schemaVersion
        ruleID = value.ruleID
        severity = value.severity.rawValue
        title = value.title
        explanation = value.explanation
        affectedPaths = value.affectedPaths.map(\.value)
        evidence = value.evidence.map(JSONEvidenceV1.init)
        expected = value.expected
        suggestedAction = value.suggestedAction
        origin = value.origin.rawValue
        engineVersion = value.engineVersion
    }
}

private struct JSONEvidenceV1: Encodable {
    let label: String
    let value: JSONEvidenceValueV1

    init(_ value: Evidence) {
        label = value.label
        self.value = JSONEvidenceValueV1(value.value)
    }
}

private enum JSONEvidenceValueV1: Encodable {
    case string(String)
    case number(Double)
    case integer(Int)
    case boolean(Bool)
    case unknown

    private enum CodingKeys: String, CodingKey { case type, string, number, integer, boolean }

    init(_ value: EvidenceValue) {
        switch value {
        case .string(let value): self = .string(value)
        case .number(let value): self = .number(value)
        case .integer(let value): self = .integer(value)
        case .boolean(let value): self = .boolean(value)
        case .unknown: self = .unknown
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .string(let value):
            try container.encode("string", forKey: .type)
            try container.encode(value, forKey: .string)
        case .number(let value):
            try container.encode("number", forKey: .type)
            try container.encode(value, forKey: .number)
        case .integer(let value):
            try container.encode("integer", forKey: .type)
            try container.encode(value, forKey: .integer)
        case .boolean(let value):
            try container.encode("boolean", forKey: .type)
            try container.encode(value, forKey: .boolean)
        case .unknown:
            try container.encode("unknown", forKey: .type)
        }
    }
}
