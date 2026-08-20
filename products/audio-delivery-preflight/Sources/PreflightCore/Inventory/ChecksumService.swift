import CryptoKit
import Darwin
import Foundation

public protocol ChecksumCalculating: Sendable {
    func sha256(for fileURL: URL) async throws -> String
}

public struct DuplicateGroup: Sendable, Codable, Equatable {
    public let sha256: String
    public let paths: [RelativePath]

    public init(sha256: String, paths: [RelativePath]) {
        self.sha256 = sha256
        self.paths = paths
    }
}

public struct ChecksumService: ChecksumCalculating {
    private static let chunkSize = 64 * 1024
    private let onBeforeOpeningPathComponent: (@Sendable (RelativePath, Int) -> Void)?

    public init() {
        self.onBeforeOpeningPathComponent = nil
    }

    init(onBeforeOpeningPathComponent: @escaping @Sendable (RelativePath, Int) -> Void) {
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
    }

    public func sha256(for fileURL: URL) async throws -> String {
        let descriptor = try TrustedFileAccess.openRegularFile(at: fileURL.standardizedFileURL)
        defer { Darwin.close(descriptor) }
        return try Self.sha256(from: descriptor)
    }

    public func checksummedInventory(entries: [InventoryEntry], root: URL) async -> InventorySnapshot {
        let standardizedRoot = root.standardizedFileURL
        var checksummedEntries: [InventoryEntry] = []
        var findings: [Finding] = []
        let rootDescriptor: Int32?

        do {
            rootDescriptor = try TrustedFileAccess.openTrustedRoot(at: standardizedRoot)
        } catch {
            rootDescriptor = nil
        }
        defer {
            if let rootDescriptor {
                Darwin.close(rootDescriptor)
            }
        }

        for entry in entries {
            guard entry.kind == .regular, entry.category != .serviceFile else {
                checksummedEntries.append(entry)
                continue
            }

            guard let rootDescriptor else {
                checksummedEntries.append(Self.copying(entry, sha256: nil, inspectionStatus: .failed))
                findings.append(Self.finding(
                    ruleID: "checksum.root-open-failed",
                    title: "Selected root could not be opened safely",
                    explanation: "The selected inventory root could not be opened safely.",
                    affectedPath: entry.relativePath
                ))
                continue
            }

            do {
                let descriptor = try TrustedFileAccess.openRegularFile(
                    relativePath: entry.relativePath,
                    from: rootDescriptor,
                    onBeforeOpeningPathComponent: onBeforeOpeningPathComponent
                )
                defer { Darwin.close(descriptor) }
                let digest = try Self.sha256(from: descriptor)
                checksummedEntries.append(Self.copying(entry, sha256: digest, inspectionStatus: .succeeded))
            } catch {
                checksummedEntries.append(Self.copying(entry, sha256: nil, inspectionStatus: .failed))
                findings.append(Self.finding(
                    ruleID: "checksum.read-failed",
                    title: "Checksum could not be calculated",
                    explanation: "The regular file could not be read safely.",
                    affectedPath: entry.relativePath
                ))
            }
        }

        return InventorySnapshot(entries: checksummedEntries, findings: findings)
    }

    public func duplicateGroups(entries: [InventoryEntry]) -> [DuplicateGroup] {
        let groupedPaths = Dictionary(grouping: entries.filter {
            $0.kind == .regular
                && $0.category != .serviceFile
                && $0.inspectionStatus == .succeeded
                && $0.sha256 != nil
        }, by: { $0.sha256! })

        return groupedPaths.compactMap { digest, matchingEntries in
            guard matchingEntries.count >= 2 else {
                return nil
            }

            return DuplicateGroup(
                sha256: digest,
                paths: matchingEntries.map(\.relativePath).sorted(by: Self.relativePathLessThan)
            )
        }
        .sorted { Self.unicodeScalarLessThan($0.sha256, $1.sha256) }
    }

    private static func sha256(from descriptor: Int32) throws -> String {
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: false)
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: Self.chunkSize), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func copying(
        _ entry: InventoryEntry,
        sha256: String?,
        inspectionStatus: InspectionStatus
    ) -> InventoryEntry {
        InventoryEntry(
            relativePath: entry.relativePath,
            normalizedFilename: entry.normalizedFilename,
            normalizedExtension: entry.normalizedExtension,
            category: entry.category,
            byteSize: entry.byteSize,
            modificationDate: entry.modificationDate,
            kind: entry.kind,
            sha256: sha256,
            inspectionStatus: inspectionStatus,
            audioProperties: entry.audioProperties,
            imageProperties: entry.imageProperties,
            evidence: entry.evidence
        )
    }

    private static func finding(
        ruleID: String,
        title: String,
        explanation: String,
        affectedPath: RelativePath
    ) -> Finding {
        Finding(
            ruleID: ruleID,
            severity: .warning,
            title: title,
            explanation: explanation,
            affectedPaths: [affectedPath],
            evidence: [],
            expected: "A readable regular file inside the selected root.",
            suggestedAction: "Review the affected file and run the preflight again.",
            origin: .engine,
            engineVersion: "0.1.0"
        )
    }

    private static func relativePathLessThan(_ left: RelativePath, _ right: RelativePath) -> Bool {
        unicodeScalarLessThan(left.value, right.value)
    }

    private static func unicodeScalarLessThan(_ left: String, _ right: String) -> Bool {
        left.unicodeScalars.lexicographicallyPrecedes(right.unicodeScalars)
    }
}
