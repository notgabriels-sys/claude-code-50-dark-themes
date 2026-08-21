import Darwin
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
    private let onBeforeEnumeratingEntry: (@Sendable () -> Void)?
    private let onBeforeOpeningRootPathComponent: TrustedFileAccess.OpenRootPathComponentHook?

    public init() {
        self.onBeforeEnumeratingEntry = nil
        self.onBeforeOpeningRootPathComponent = nil
    }

    init(onBeforeEnumeratingEntry: @escaping @Sendable () -> Void) {
        self.onBeforeEnumeratingEntry = onBeforeEnumeratingEntry
        self.onBeforeOpeningRootPathComponent = nil
    }

    init(onBeforeOpeningRootPathComponent: @escaping TrustedFileAccess.OpenRootPathComponentHook) {
        self.onBeforeEnumeratingEntry = nil
        self.onBeforeOpeningRootPathComponent = onBeforeOpeningRootPathComponent
    }

    public func inventory(root: URL) async throws -> InventorySnapshot {
        try Task.checkCancellation()

        let rootDescriptor: Int32
        do {
            rootDescriptor = try TrustedFileAccess.openTrustedRoot(
                at: root,
                onBeforeOpeningPathComponent: onBeforeOpeningRootPathComponent
            )
        } catch TrustedFileAccessError.symbolicLinkNotAllowed {
            throw PreflightError.invalidScanRequest(
                reason: "The selected inventory root must not be a symbolic link."
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw PreflightError.invalidScanRequest(
                reason: "The selected inventory root could not be accessed safely."
            )
        }
        defer { Darwin.close(rootDescriptor) }

        var entries: [InventoryEntry] = []
        var findings: [Finding] = []
        try walkDirectory(
            descriptor: rootDescriptor,
            relativeComponents: [],
            entries: &entries,
            findings: &findings
        )

        entries.sort { Self.unicodeScalarLessThan($0.relativePath.value, $1.relativePath.value) }
        findings.sort(by: Self.findingLessThan)
        return InventorySnapshot(entries: entries, findings: findings)
    }

    private func walkDirectory(
        descriptor: Int32,
        relativeComponents: [String],
        entries: inout [InventoryEntry],
        findings: inout [Finding]
    ) throws {
        try Task.checkCancellation()

        let names: [String]
        do {
            names = try Self.directoryNames(from: descriptor)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            if let relativePath = try? Self.relativePath(relativeComponents) {
                findings.append(Self.finding(
                    ruleID: "filesystem.enumeration-failed",
                    severity: .warning,
                    title: "Directory entry could not be enumerated",
                    explanation: "The directory entry could not be enumerated safely.",
                    affectedPaths: [relativePath]
                ))
                return
            }
            throw PreflightError.invalidScanRequest(
                reason: "The selected inventory root could not be enumerated."
            )
        }

        for name in names {
            try Task.checkCancellation()
            onBeforeEnumeratingEntry?()
            try Task.checkCancellation()

            let components = relativeComponents + [name]
            let relativePath: RelativePath
            do {
                relativePath = try Self.relativePath(components)
            } catch {
                findings.append(Self.finding(
                    ruleID: "filesystem.invalid-relative-path",
                    severity: .warning,
                    title: "Directory entry has no safe relative path",
                    explanation: "The directory entry is outside the selected root or cannot be represented as a RelativePath.",
                    affectedPaths: []
                ))
                continue
            }

            let fileStatus: stat
            do {
                fileStatus = try Self.status(name: name, from: descriptor)
            } catch {
                entries.append(Self.entry(
                    relativePath: relativePath,
                    filename: name,
                    status: nil,
                    kind: .special
                ))
                findings.append(Self.finding(
                    ruleID: "filesystem.metadata-unreadable",
                    severity: .warning,
                    title: "Directory entry metadata could not be read",
                    explanation: "The directory entry metadata could not be read safely.",
                    affectedPaths: [relativePath]
                ))
                continue
            }

            let kind = Self.kind(for: fileStatus)
            entries.append(Self.entry(
                relativePath: relativePath,
                filename: name,
                status: fileStatus,
                kind: kind
            ))

            switch kind {
            case .symbolicLink:
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

            case .regular:
                if !Self.isReadableRegularFile(name: name, from: descriptor) {
                    findings.append(Self.finding(
                        ruleID: "filesystem.unreadable-entry",
                        severity: .warning,
                        title: "Regular file could not be read",
                        explanation: "The file is recorded but later inspection may not be possible.",
                        affectedPaths: [relativePath]
                    ))
                }

            case .directory:
                let childDescriptor: Int32
                do {
                    childDescriptor = try Self.openDirectory(name: name, from: descriptor)
                } catch {
                    findings.append(Self.finding(
                        ruleID: "filesystem.enumeration-failed",
                        severity: .warning,
                        title: "Directory entry could not be enumerated",
                        explanation: "The directory entry could not be enumerated safely.",
                        affectedPaths: [relativePath]
                    ))
                    continue
                }
                defer { Darwin.close(childDescriptor) }
                try walkDirectory(
                    descriptor: childDescriptor,
                    relativeComponents: components,
                    entries: &entries,
                    findings: &findings
                )
            }
        }
    }

    private static func directoryNames(from descriptor: Int32) throws -> [String] {
        try Task.checkCancellation()
        let duplicate = Darwin.dup(descriptor)
        guard duplicate >= 0 else {
            throw TrustedFileAccessError.openFailed
        }
        guard let directory = Darwin.fdopendir(duplicate) else {
            Darwin.close(duplicate)
            throw TrustedFileAccessError.openFailed
        }
        defer { Darwin.closedir(directory) }

        var names: [String] = []
        while true {
            try Task.checkCancellation()
            errno = 0
            guard let directoryEntry = Darwin.readdir(directory) else {
                guard errno == 0 else {
                    throw TrustedFileAccessError.readFailed
                }
                break
            }
            let capacity = MemoryLayout.size(ofValue: directoryEntry.pointee.d_name)
            let name = withUnsafePointer(to: &directoryEntry.pointee.d_name) { pointer in
                pointer.withMemoryRebound(to: CChar.self, capacity: capacity) {
                    String(cString: $0)
                }
            }
            guard name != ".", name != ".." else { continue }
            names.append(name)
        }

        return names.sorted(by: unicodeScalarLessThan)
    }

    private static func status(name: String, from directoryDescriptor: Int32) throws -> stat {
        var fileStatus = stat()
        let result = name.withCString { representation in
            Darwin.fstatat(directoryDescriptor, representation, &fileStatus, AT_SYMLINK_NOFOLLOW)
        }
        guard result == 0 else {
            throw TrustedFileAccessError.statusFailed
        }
        return fileStatus
    }

    private static func openDirectory(name: String, from directoryDescriptor: Int32) throws -> Int32 {
        let descriptor = name.withCString { representation in
            Darwin.openat(directoryDescriptor, representation, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        }
        guard descriptor >= 0 else {
            throw TrustedFileAccessError.openFailed
        }

        var fileStatus = stat()
        guard Darwin.fstat(descriptor, &fileStatus) == 0,
              fileStatus.st_mode & S_IFMT == S_IFDIR
        else {
            Darwin.close(descriptor)
            throw TrustedFileAccessError.unexpectedFileKind
        }
        return descriptor
    }

    private static func isReadableRegularFile(name: String, from directoryDescriptor: Int32) -> Bool {
        let descriptor = name.withCString { representation in
            Darwin.openat(directoryDescriptor, representation, O_RDONLY | O_NONBLOCK | O_NOFOLLOW)
        }
        guard descriptor >= 0 else { return false }
        defer { Darwin.close(descriptor) }

        var fileStatus = stat()
        return Darwin.fstat(descriptor, &fileStatus) == 0
            && fileStatus.st_mode & S_IFMT == S_IFREG
    }

    private static func relativePath(_ components: [String]) throws -> RelativePath {
        guard !components.isEmpty else {
            throw TrustedFileAccessError.invalidRelativePath
        }
        return try RelativePath(components.joined(separator: "/"))
    }

    private static func kind(for status: stat) -> FileKind {
        switch status.st_mode & S_IFMT {
        case S_IFREG: .regular
        case S_IFDIR: .directory
        case S_IFLNK: .symbolicLink
        default: .special
        }
    }

    private static func entry(
        relativePath: RelativePath,
        filename: String,
        status: stat?,
        kind: FileKind
    ) -> InventoryEntry {
        let normalizedFilename = filename.lowercased()
        let isHidden = filename.hasPrefix(".")
            || status.map { $0.st_flags & UInt32(UF_HIDDEN) != 0 } == true
        return InventoryEntry(
            relativePath: relativePath,
            normalizedFilename: normalizedFilename,
            normalizedExtension: (filename as NSString).pathExtension.lowercased(),
            category: category(for: normalizedFilename),
            byteSize: status.map { Int64($0.st_size) },
            modificationDate: status.map(modificationDate),
            kind: kind,
            evidence: [Evidence(label: "isHidden", value: .boolean(isHidden))]
        )
    }

    private static func modificationDate(from status: stat) -> Date {
        Date(
            timeIntervalSince1970: TimeInterval(status.st_mtimespec.tv_sec)
                + TimeInterval(status.st_mtimespec.tv_nsec) / 1_000_000_000
        )
    }

    private static func category(for filename: String) -> FileCategory {
        if filename == ".ds_store" || filename.hasPrefix("._") {
            return .serviceFile
        }

        let extensionName = (filename as NSString).pathExtension
        if ["aif", "aiff", "flac", "m4a", "mp3", "wav"].contains(extensionName) {
            return .audio
        }
        if ["gif", "heic", "jpeg", "jpg", "png", "tif", "tiff", "webp"].contains(extensionName) {
            return .artwork
        }
        if ["csv", "doc", "docx", "md", "pdf", "rtf", "txt"].contains(extensionName) {
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

    private static func findingLessThan(_ left: Finding, _ right: Finding) -> Bool {
        let leftPath = left.affectedPaths.first?.value ?? ""
        let rightPath = right.affectedPaths.first?.value ?? ""
        if leftPath != rightPath {
            return unicodeScalarLessThan(leftPath, rightPath)
        }
        return unicodeScalarLessThan(left.ruleID, right.ruleID)
    }

    private static func unicodeScalarLessThan(_ left: String, _ right: String) -> Bool {
        left.unicodeScalars.lexicographicallyPrecedes(right.unicodeScalars)
    }
}
