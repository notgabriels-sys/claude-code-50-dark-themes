import Foundation

public protocol FileInventorying: Sendable {
    func inventory(root: URL) async throws -> InventorySnapshot
}

public struct InventorySnapshot: Sendable, Codable, Equatable {
    public let entries: [InventoryEntry]
    public let findings: [Finding]

    public init(entries: [InventoryEntry], findings: [Finding]) {
        self.entries = entries
        self.findings = findings
    }
}

public struct FileInventory: FileInventorying {
    private static let resourceKeys: Set<URLResourceKey> = [
        .isRegularFileKey,
        .isDirectoryKey,
        .isSymbolicLinkKey,
        .isHiddenKey,
        .fileSizeKey,
        .contentModificationDateKey,
    ]

    public init() {}

    public func inventory(root: URL) async throws -> InventorySnapshot {
        let standardizedRoot = root.standardizedFileURL
        let rootValues = try standardizedRoot.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard rootValues.isSymbolicLink != true else {
            throw PreflightError.invalidScanRequest(reason: "The selected inventory root must not be a symbolic link.")
        }
        guard rootValues.isDirectory == true else {
            throw PreflightError.invalidScanRequest(reason: "The selected inventory root must be a directory.")
        }

        var findings: [Finding] = []
        guard let enumerator = FileManager.default.enumerator(
            at: standardizedRoot,
            includingPropertiesForKeys: Array(Self.resourceKeys),
            options: [],
            errorHandler: { url, error in
                findings.append(Self.finding(
                    ruleID: "filesystem.enumeration-failed",
                    severity: .warning,
                    title: "Directory entry could not be enumerated",
                    explanation: "The directory entry could not be enumerated safely.",
                    affectedPaths: Self.validatedRelativePath(for: url, root: standardizedRoot).map { [$0] } ?? []
                ))
                return true
            }
        ) else {
            throw PreflightError.invalidScanRequest(reason: "The selected inventory root could not be enumerated.")
        }

        var entries: [InventoryEntry] = []
        while let url = enumerator.nextObject() as? URL {
            let standardizedURL = url.standardizedFileURL
            guard let relativePath = Self.validatedRelativePath(for: standardizedURL, root: standardizedRoot) else {
                findings.append(Self.finding(
                    ruleID: "filesystem.invalid-relative-path",
                    severity: .warning,
                    title: "Directory entry has no safe relative path",
                    explanation: "The directory entry is outside the selected root or cannot be represented as a RelativePath.",
                    affectedPaths: []
                ))
                enumerator.skipDescendants()
                continue
            }

            let values: URLResourceValues
            do {
                values = try standardizedURL.resourceValues(forKeys: Self.resourceKeys)
            } catch {
                entries.append(Self.entry(relativePath: relativePath, url: standardizedURL, values: nil, kind: .special))
                findings.append(Self.finding(
                    ruleID: "filesystem.resource-read-failed",
                    severity: .warning,
                    title: "Directory entry metadata could not be read",
                    explanation: "The directory entry metadata could not be read safely.",
                    affectedPaths: [relativePath]
                ))
                enumerator.skipDescendants()
                continue
            }

            let kind = Self.kind(for: values)
            entries.append(Self.entry(relativePath: relativePath, url: standardizedURL, values: values, kind: kind))

            switch kind {
            case .symbolicLink:
                enumerator.skipDescendants()
                findings.append(Self.finding(
                    ruleID: "filesystem.symlink-not-followed",
                    severity: .information,
                    title: "Symbolic link was not followed",
                    explanation: "Symbolic links are recorded but their destinations are never enumerated.",
                    affectedPaths: [relativePath]
                ))
            case .special:
                findings.append(Self.finding(
                    ruleID: "filesystem.special-entry",
                    severity: .warning,
                    title: "Special filesystem entry was not inspected",
                    explanation: "Only regular files and directories can be safely inventoried.",
                    affectedPaths: [relativePath]
                ))
            case .regular, .directory:
                break
            }

            if kind == .regular, !FileManager.default.isReadableFile(atPath: standardizedURL.path) {
                findings.append(Self.finding(
                    ruleID: "filesystem.unreadable-entry",
                    severity: .warning,
                    title: "Regular file could not be read",
                    explanation: "The file is recorded but later inspection may not be possible.",
                    affectedPaths: [relativePath]
                ))
            }
        }

        entries.sort { Self.unicodeScalarLessThan($0.relativePath.value, $1.relativePath.value) }
        return InventorySnapshot(entries: entries, findings: findings)
    }

    private static func validatedRelativePath(for url: URL, root: URL) -> RelativePath? {
        let urlComponents = url.standardizedFileURL.pathComponents
        let rootComponents = root.standardizedFileURL.pathComponents
        guard urlComponents.count > rootComponents.count, urlComponents.starts(with: rootComponents) else {
            return nil
        }

        return try? RelativePath(urlComponents.dropFirst(rootComponents.count).joined(separator: "/"))
    }

    private static func kind(for values: URLResourceValues) -> FileKind {
        if values.isSymbolicLink == true {
            return .symbolicLink
        }

        if values.isDirectory == true {
            return .directory
        }

        if values.isRegularFile == true {
            return .regular
        }

        return .special
    }

    private static func entry(
        relativePath: RelativePath,
        url: URL,
        values: URLResourceValues?,
        kind: FileKind
    ) -> InventoryEntry {
        let filename = url.lastPathComponent.lowercased()
        return InventoryEntry(
            relativePath: relativePath,
            normalizedFilename: filename,
            normalizedExtension: url.pathExtension.lowercased(),
            category: category(for: filename),
            byteSize: values?.fileSize.map(Int64.init),
            modificationDate: values?.contentModificationDate,
            kind: kind,
            evidence: values?.isHidden.map { [Evidence(label: "isHidden", value: .boolean($0))] } ?? []
        )
    }

    private static func category(for filename: String) -> FileCategory {
        if filename == ".ds_store" || filename.hasPrefix("._") {
            return .serviceFile
        }

        let extensionName = URL(fileURLWithPath: filename).pathExtension
        if ["aif", "aiff", "flac", "m4a", "mp3", "wav"].contains(extensionName) {
            return .audio
        }

        if ["gif", "heic", "jpeg", "jpg", "png", "tif", "tiff", "webp"].contains(extensionName) {
            return .artwork
        }

        if ["csv", "doc", "docx", "pdf", "rtf", "txt"].contains(extensionName) {
            return .document
        }

        return .other
    }

    private static func finding(
        ruleID: String,
        severity: FindingSeverity,
        title: String,
        explanation: String,
        affectedPaths: [RelativePath]
    ) -> Finding {
        Finding(
            ruleID: ruleID,
            severity: severity,
            title: title,
            explanation: explanation,
            affectedPaths: affectedPaths,
            evidence: [],
            expected: "A bounded inventory of the selected root.",
            suggestedAction: "Review the affected filesystem entry.",
            origin: .engine,
            engineVersion: "0.1.0"
        )
    }

    private static func unicodeScalarLessThan(_ left: String, _ right: String) -> Bool {
        left.unicodeScalars.lexicographicallyPrecedes(right.unicodeScalars)
    }
}
