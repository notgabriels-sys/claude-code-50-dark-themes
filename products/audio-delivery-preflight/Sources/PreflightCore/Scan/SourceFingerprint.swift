import CryptoKit
import Darwin
import Foundation

public protocol SourceFingerprinting: Sendable {
    func fingerprint(root: URL, entries: [InventoryEntry]) throws -> SourceFingerprint
}

public struct SourceFingerprint: Sendable, Codable, Equatable {
    public struct File: Sendable, Codable, Equatable {
        public let relativePath: RelativePath
        public let byteSize: Int64?
        public let modificationDate: Date?
        public let sha256: String?

        public init(
            relativePath: RelativePath,
            byteSize: Int64?,
            modificationDate: Date?,
            sha256: String?
        ) {
            self.relativePath = relativePath
            self.byteSize = byteSize
            self.modificationDate = modificationDate
            self.sha256 = sha256
        }
    }

    public let files: [File]

    public init() {
        self.files = []
    }

    public init(entries: [InventoryEntry]) {
        self.files = Self.files(from: entries)
    }

    public func fingerprint(root: URL, entries: [InventoryEntry]) throws -> SourceFingerprint {
        let rootDescriptor = try TrustedFileAccess.openTrustedRoot(at: root)
        defer { Darwin.close(rootDescriptor) }

        var files: [File] = []
        for entry in entries where entry.kind == .regular {
            files.append(try Self.fingerprint(entry: entry, from: rootDescriptor))
        }
        return SourceFingerprint(files: files)
    }

    private init(files: [File]) {
        self.files = files.sorted { $0.relativePath.value.unicodeScalars.lexicographicallyPrecedes($1.relativePath.value.unicodeScalars) }
    }

    private static func files(from entries: [InventoryEntry]) -> [File] {
        entries
            .filter { $0.kind == .regular }
            .map {
                File(
                    relativePath: $0.relativePath,
                    byteSize: $0.byteSize,
                    modificationDate: $0.modificationDate,
                    sha256: $0.sha256
                )
            }
    }

    private static func modificationDate(from status: stat) -> Date {
        let seconds = TimeInterval(status.st_mtimespec.tv_sec)
        let nanoseconds = TimeInterval(status.st_mtimespec.tv_nsec) / 1_000_000_000
        return Date(timeIntervalSince1970: seconds + nanoseconds)
    }

    private static func fingerprint(entry: InventoryEntry, from rootDescriptor: Int32) throws -> File {
        let descriptor = try TrustedFileAccess.openRegularFile(
            relativePath: entry.relativePath,
            from: rootDescriptor
        )
        defer { Darwin.close(descriptor) }
        var status = stat()
        guard Darwin.fstat(descriptor, &status) == 0 else {
            throw TrustedFileAccessError.statusFailed
        }
        return File(
            relativePath: entry.relativePath,
            byteSize: Int64(status.st_size),
            modificationDate: modificationDate(from: status),
            sha256: try sha256(from: descriptor)
        )
    }

    private static func sha256(from descriptor: Int32) throws -> String {
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: false)
        var hasher = SHA256()
        while true {
            try Task.checkCancellation()
            guard let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty else {
                return hasher.finalize().map { String(format: "%02x", $0) }.joined()
            }
            hasher.update(data: chunk)
        }
    }

    /// Compares source facts observed before and after a scan. Each production
    /// fingerprint calculates its checksum from the trusted file descriptor;
    /// the service never writes evidence into the selected source.
    public func matches(_ other: SourceFingerprint) -> Bool {
        guard files.count == other.files.count else { return false }
        return zip(files, other.files).allSatisfy { before, after in
            before.relativePath == after.relativePath
                && before.byteSize == after.byteSize
                && before.modificationDate == after.modificationDate
                && before.sha256 == after.sha256
        }
    }

}

extension SourceFingerprint: SourceFingerprinting {}
