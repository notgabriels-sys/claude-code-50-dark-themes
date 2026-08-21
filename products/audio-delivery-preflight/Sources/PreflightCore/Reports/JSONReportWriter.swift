import Foundation

/// Exports an intentionally stable, private JSON representation of a completed scan.
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

private struct JSONReportV1: Codable {
    let schemaVersion: String
    let selectedFolderName: String
    let preset: ResolvedPreset
    let applicationVersion: String
    let engineVersion: String
    let startedAt: Date
    let completedAt: Date?
    let inventory: [JSONInventoryEntryV1]
    let findings: [Finding]
    let overallStatus: OverallStatus

    init(result: ScanResult) throws {
        schemaVersion = "1.0"
        selectedFolderName = result.selectedFolderName
        preset = result.preset
        applicationVersion = result.applicationVersion
        engineVersion = result.engineVersion
        startedAt = result.startedAt
        completedAt = result.completedAt
        inventory = try result.inventory.map(JSONInventoryEntryV1.init)
        findings = result.findings
        overallStatus = result.overallStatus
    }
}

private struct JSONInventoryEntryV1: Codable {
    let relativePath: String
    let normalizedFilename: String
    let normalizedExtension: String
    let category: FileCategory
    let byteSize: Int64?
    let modificationDate: Date?
    let kind: FileKind
    let sha256: String?
    let inspectionStatus: InspectionStatus
    let audioProperties: AudioProperties?
    let imageProperties: ImageProperties?
    let evidence: [Evidence]

    init(_ entry: InventoryEntry) throws {
        let path = entry.relativePath.value
        guard Self.isExportSafeRelativePath(path) else {
            throw PreflightError.exportFailed(reason: "The report contains an unsafe relative path.")
        }
        relativePath = path
        normalizedFilename = entry.normalizedFilename
        normalizedExtension = entry.normalizedExtension
        category = entry.category
        byteSize = entry.byteSize
        modificationDate = entry.modificationDate
        kind = entry.kind
        sha256 = entry.sha256
        inspectionStatus = entry.inspectionStatus
        audioProperties = entry.audioProperties
        imageProperties = entry.imageProperties
        evidence = entry.evidence
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
