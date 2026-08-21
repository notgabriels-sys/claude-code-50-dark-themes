import Darwin
import Foundation

public struct TrustedMediaSource: Sendable {
    public let root: URL
    public let relativePath: RelativePath

    public init(root: URL, relativePath: RelativePath) {
        self.root = root
        self.relativePath = relativePath
    }
}

struct TrustedFileSnapshot: Sendable {
    let stagingURL: URL
    let byteSize: Int64
    let header: Data
}

enum TrustedFileAccess {
    private static let copyChunkSize = 64 * 1_024
    private static let headerByteCount = 12

    typealias OpenPathComponentHook = @Sendable (RelativePath, Int) -> Void
    typealias OpenRootPathComponentHook = @Sendable (String, Int) -> Void
    typealias CopyProgressHook = @Sendable (RelativePath, Int64) -> Void

    static func stageRegularFile(
        source: TrustedMediaSource,
        in stagingDirectory: URL,
        onBeforeOpeningPathComponent: OpenPathComponentHook? = nil,
        onAfterCopyingChunk: CopyProgressHook? = nil
    ) throws -> TrustedFileSnapshot {
        try Task.checkCancellation()
        let rootDescriptor = try openTrustedRoot(at: source.root)
        defer { Darwin.close(rootDescriptor) }
        try Task.checkCancellation()
        let sourceDescriptor = try openRegularFile(
            relativePath: source.relativePath,
            from: rootDescriptor,
            onBeforeOpeningPathComponent: onBeforeOpeningPathComponent
        )
        defer { Darwin.close(sourceDescriptor) }
        try Task.checkCancellation()

        let initialStatus = try status(of: sourceDescriptor)
        guard initialStatus.st_size >= 0 else {
            throw TrustedFileAccessError.invalidFileSize
        }

        let stagingFile = try createStagingFile(in: stagingDirectory)
        var completed = false
        defer {
            Darwin.close(stagingFile.descriptor)
            if !completed {
                try? FileManager.default.removeItem(at: stagingFile.url)
            }
        }

        try Task.checkCancellation()
        try requireSufficientCapacity(
            for: Int64(initialStatus.st_size),
            onFileSystemContaining: stagingFile.descriptor
        )
        let header = try copyExactly(
            Int64(initialStatus.st_size),
            from: sourceDescriptor,
            to: stagingFile.descriptor,
            relativePath: source.relativePath,
            onAfterCopyingChunk: onAfterCopyingChunk
        )
        try Task.checkCancellation()
        let finalSourceStatus = try status(of: sourceDescriptor)
        guard sourceIsUnchanged(from: initialStatus, to: finalSourceStatus) else {
            throw TrustedFileAccessError.sourceChanged
        }
        let stagingStatus = try status(of: stagingFile.descriptor)
        guard stagingStatus.st_size == initialStatus.st_size else {
            throw TrustedFileAccessError.incompleteCopy
        }
        guard Darwin.fsync(stagingFile.descriptor) == 0 else {
            throw TrustedFileAccessError.writeFailed
        }
        try Task.checkCancellation()

        completed = true
        return TrustedFileSnapshot(
            stagingURL: stagingFile.url,
            byteSize: Int64(initialStatus.st_size),
            header: header
        )
    }

    static func openTrustedRoot(
        at root: URL,
        onBeforeOpeningPathComponent: OpenRootPathComponentHook? = nil
    ) throws -> Int32 {
        guard root.isFileURL else {
            throw TrustedFileAccessError.nonFileRoot
        }

        let components = root.pathComponents
        guard components.first == "/",
              components.dropFirst().allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
        else {
            throw TrustedFileAccessError.nonFileRoot
        }
        var descriptor = try openURL(
            URL(fileURLWithPath: "/", isDirectory: true),
            flags: O_RDONLY | O_DIRECTORY | O_NOFOLLOW
        )
        var shouldClose = true
        defer {
            if shouldClose {
                Darwin.close(descriptor)
            }
        }

        for (componentIndex, componentSubstring) in components.dropFirst().enumerated() {
            try Task.checkCancellation()
            let component = String(componentSubstring)
            onBeforeOpeningPathComponent?(component, componentIndex)
            try Task.checkCancellation()

            let childDescriptor: Int32
            do {
                childDescriptor = try openAt(
                    descriptor,
                    name: component,
                    flags: O_RDONLY | O_DIRECTORY | O_NOFOLLOW
                )
            } catch {
                if isSymbolicLink(name: component, from: descriptor) {
                    throw TrustedFileAccessError.symbolicLinkNotAllowed
                }
                throw error
            }
            do {
                try requireDirectory(childDescriptor)
            } catch {
                Darwin.close(childDescriptor)
                throw error
            }
            Darwin.close(descriptor)
            descriptor = childDescriptor
        }

        shouldClose = false
        return descriptor
    }

    static func openRegularFile(
        relativePath: RelativePath,
        from rootDescriptor: Int32,
        onBeforeOpeningPathComponent: OpenPathComponentHook? = nil
    ) throws -> Int32 {
        let components = relativePath.value.split(separator: "/")
        guard let finalComponent = components.last else {
            throw TrustedFileAccessError.invalidRelativePath
        }

        var parentDescriptor = Darwin.dup(rootDescriptor)
        guard parentDescriptor >= 0 else {
            throw TrustedFileAccessError.openFailed
        }
        defer { Darwin.close(parentDescriptor) }

        for (componentIndex, component) in components.dropLast().enumerated() {
            onBeforeOpeningPathComponent?(relativePath, componentIndex)
            let childDescriptor = try openAt(
                parentDescriptor,
                name: String(component),
                flags: O_RDONLY | O_DIRECTORY | O_NOFOLLOW
            )
            do {
                try requireDirectory(childDescriptor)
            } catch {
                Darwin.close(childDescriptor)
                throw error
            }
            Darwin.close(parentDescriptor)
            parentDescriptor = childDescriptor
        }

        onBeforeOpeningPathComponent?(relativePath, components.count - 1)
        let fileDescriptor = try openAt(
            parentDescriptor,
            name: String(finalComponent),
            flags: O_RDONLY | O_NOFOLLOW
        )
        do {
            try requireRegularFile(fileDescriptor)
        } catch {
            Darwin.close(fileDescriptor)
            throw error
        }
        return fileDescriptor
    }

    static func openRegularFile(at fileURL: URL) throws -> Int32 {
        guard fileURL.isFileURL else {
            throw TrustedFileAccessError.nonFileRoot
        }
        let descriptor = try openURL(fileURL.standardizedFileURL, flags: O_RDONLY | O_NOFOLLOW)
        do {
            try requireRegularFile(descriptor)
        } catch {
            Darwin.close(descriptor)
            throw error
        }
        return descriptor
    }

    static func readBoundedRegularFile(at fileURL: URL, maximumByteCount: Int) throws -> Data {
        guard maximumByteCount >= 0, fileURL.isFileURL else {
            throw TrustedFileAccessError.invalidFileSize
        }
        let components = fileURL.pathComponents
        guard components.first == "/",
              components.count > 1,
              components.dropFirst().allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }),
              let filename = components.last
        else {
            throw TrustedFileAccessError.nonFileRoot
        }

        try Task.checkCancellation()
        let parentDescriptor = try openTrustedRoot(at: fileURL.deletingLastPathComponent())
        defer { Darwin.close(parentDescriptor) }
        try Task.checkCancellation()

        let descriptor: Int32
        do {
            descriptor = try openAt(parentDescriptor, name: filename, flags: O_RDONLY | O_NOFOLLOW)
        } catch {
            if isSymbolicLink(name: filename, from: parentDescriptor) {
                throw TrustedFileAccessError.symbolicLinkNotAllowed
            }
            throw error
        }
        defer { Darwin.close(descriptor) }
        try requireRegularFile(descriptor)

        let initialStatus = try status(of: descriptor)
        guard initialStatus.st_size >= 0,
              UInt64(initialStatus.st_size) <= UInt64(maximumByteCount)
        else {
            throw TrustedFileAccessError.fileTooLarge
        }

        var data = Data()
        data.reserveCapacity(Int(initialStatus.st_size))
        var buffer = [UInt8](repeating: 0, count: copyChunkSize)
        while true {
            try Task.checkCancellation()
            let remainingCapacity = maximumByteCount - data.count
            guard remainingCapacity >= 0 else {
                throw TrustedFileAccessError.fileTooLarge
            }
            let requestedByteCount = min(buffer.count, remainingCapacity + 1)
            let readByteCount = try read(
                from: descriptor,
                into: &buffer,
                byteCount: requestedByteCount
            )
            guard readByteCount > 0 else { break }
            guard data.count + readByteCount <= maximumByteCount else {
                throw TrustedFileAccessError.fileTooLarge
            }
            data.append(contentsOf: buffer.prefix(readByteCount))
        }
        try Task.checkCancellation()

        let finalStatus = try status(of: descriptor)
        guard sourceIsUnchanged(from: initialStatus, to: finalStatus),
              data.count == Int(initialStatus.st_size)
        else {
            throw TrustedFileAccessError.sourceChanged
        }
        return data
    }

    private static func openURL(_ url: URL, flags: Int32) throws -> Int32 {
        let descriptor: Int32 = url.withUnsafeFileSystemRepresentation { representation in
            guard let representation else {
                return -1
            }
            return Darwin.open(representation, flags)
        }
        guard descriptor >= 0 else {
            throw TrustedFileAccessError.openFailed
        }
        return descriptor
    }

    private static func openAt(_ directoryDescriptor: Int32, name: String, flags: Int32) throws -> Int32 {
        let descriptor = name.withCString { representation in
            Darwin.openat(directoryDescriptor, representation, flags)
        }
        guard descriptor >= 0 else {
            throw TrustedFileAccessError.openFailed
        }
        return descriptor
    }

    private static func isSymbolicLink(name: String, from directoryDescriptor: Int32) -> Bool {
        var fileStatus = stat()
        let result = name.withCString { representation in
            Darwin.fstatat(directoryDescriptor, representation, &fileStatus, AT_SYMLINK_NOFOLLOW)
        }
        return result == 0 && fileStatus.st_mode & S_IFMT == S_IFLNK
    }

    private static func createStagingFile(in directory: URL) throws -> (url: URL, descriptor: Int32) {
        guard directory.isFileURL else {
            throw TrustedFileAccessError.nonFileStagingDirectory
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var template = directory.appendingPathComponent("media-inspector-XXXXXXXX").path.utf8CString
        let descriptor = template.withUnsafeMutableBufferPointer { buffer in
            Darwin.mkstemp(buffer.baseAddress!)
        }
        guard descriptor >= 0 else {
            throw TrustedFileAccessError.stagingCreationFailed
        }
        let path = template.withUnsafeBufferPointer { buffer in
            String(cString: buffer.baseAddress!)
        }
        let url = URL(fileURLWithPath: path)
        guard Darwin.fchmod(descriptor, S_IRUSR | S_IWUSR) == 0 else {
            Darwin.close(descriptor)
            try? FileManager.default.removeItem(at: url)
            throw TrustedFileAccessError.stagingPermissionFailed
        }
        return (url, descriptor)
    }

    private static func requireSufficientCapacity(
        for byteSize: Int64,
        onFileSystemContaining descriptor: Int32
    ) throws {
        guard byteSize >= 0 else {
            throw TrustedFileAccessError.invalidFileSize
        }
        var fileSystemStatus = statfs()
        guard Darwin.fstatfs(descriptor, &fileSystemStatus) == 0 else {
            throw TrustedFileAccessError.capacityCheckFailed
        }
        let (availableBytes, overflow) = UInt64(fileSystemStatus.f_bavail)
            .multipliedReportingOverflow(by: UInt64(fileSystemStatus.f_bsize))
        guard overflow || UInt64(byteSize) <= availableBytes else {
            throw TrustedFileAccessError.insufficientStagingCapacity
        }
    }

    private static func copyExactly(
        _ byteSize: Int64,
        from sourceDescriptor: Int32,
        to destinationDescriptor: Int32,
        relativePath: RelativePath,
        onAfterCopyingChunk: CopyProgressHook?
    ) throws -> Data {
        var buffer = [UInt8](repeating: 0, count: copyChunkSize)
        var remainingByteCount = byteSize
        var copiedByteCount: Int64 = 0
        var header = Data()

        while remainingByteCount > 0 {
            try Task.checkCancellation()
            let requestedByteCount = min(buffer.count, Int(remainingByteCount))
            let readByteCount = try read(
                from: sourceDescriptor,
                into: &buffer,
                byteCount: requestedByteCount
            )
            guard readByteCount > 0 else {
                throw TrustedFileAccessError.incompleteCopy
            }
            try Task.checkCancellation()

            if header.count < headerByteCount {
                let headerBytesNeeded = min(headerByteCount - header.count, readByteCount)
                header.append(contentsOf: buffer.prefix(headerBytesNeeded))
            }
            try write(
                buffer,
                byteCount: readByteCount,
                to: destinationDescriptor
            )
            try Task.checkCancellation()
            copiedByteCount += Int64(readByteCount)
            remainingByteCount -= Int64(readByteCount)
            onAfterCopyingChunk?(relativePath, copiedByteCount)
            try Task.checkCancellation()
        }

        return header
    }

    private static func read(
        from descriptor: Int32,
        into buffer: inout [UInt8],
        byteCount: Int
    ) throws -> Int {
        while true {
            try Task.checkCancellation()
            let result = buffer.withUnsafeMutableBytes { bytes in
                Darwin.read(descriptor, bytes.baseAddress, byteCount)
            }
            if result >= 0 {
                return result
            }
            guard errno == EINTR else {
                throw TrustedFileAccessError.readFailed
            }
        }
    }

    private static func write(
        _ buffer: [UInt8],
        byteCount: Int,
        to descriptor: Int32
    ) throws {
        var writtenByteCount = 0
        while writtenByteCount < byteCount {
            try Task.checkCancellation()
            let result = buffer.withUnsafeBytes { bytes in
                Darwin.write(
                    descriptor,
                    bytes.baseAddress?.advanced(by: writtenByteCount),
                    byteCount - writtenByteCount
                )
            }
            if result > 0 {
                writtenByteCount += result
                try Task.checkCancellation()
            } else if result < 0, errno == EINTR {
                continue
            } else {
                throw TrustedFileAccessError.writeFailed
            }
        }
    }

    private static func status(of descriptor: Int32) throws -> stat {
        var fileStatus = stat()
        guard Darwin.fstat(descriptor, &fileStatus) == 0 else {
            throw TrustedFileAccessError.statusFailed
        }
        return fileStatus
    }

    private static func sourceIsUnchanged(from initial: stat, to final: stat) -> Bool {
        initial.st_dev == final.st_dev
            && initial.st_ino == final.st_ino
            && initial.st_mode == final.st_mode
            && initial.st_nlink == final.st_nlink
            && initial.st_uid == final.st_uid
            && initial.st_gid == final.st_gid
            && initial.st_size == final.st_size
            && initial.st_mtimespec.tv_sec == final.st_mtimespec.tv_sec
            && initial.st_mtimespec.tv_nsec == final.st_mtimespec.tv_nsec
            && initial.st_ctimespec.tv_sec == final.st_ctimespec.tv_sec
            && initial.st_ctimespec.tv_nsec == final.st_ctimespec.tv_nsec
    }

    private static func requireDirectory(_ descriptor: Int32) throws {
        var fileStatus = stat()
        guard Darwin.fstat(descriptor, &fileStatus) == 0 else {
            throw TrustedFileAccessError.statusFailed
        }
        guard fileStatus.st_mode & S_IFMT == S_IFDIR else {
            throw TrustedFileAccessError.unexpectedFileKind
        }
    }

    private static func requireRegularFile(_ descriptor: Int32) throws {
        var fileStatus = stat()
        guard Darwin.fstat(descriptor, &fileStatus) == 0 else {
            throw TrustedFileAccessError.statusFailed
        }
        guard fileStatus.st_mode & S_IFMT == S_IFREG else {
            throw TrustedFileAccessError.unexpectedFileKind
        }
    }
}

enum TrustedFileAccessError: Error {
    case capacityCheckFailed
    case incompleteCopy
    case fileTooLarge
    case insufficientStagingCapacity
    case invalidRelativePath
    case invalidFileSize
    case nonFileRoot
    case nonFileStagingDirectory
    case openFailed
    case readFailed
    case sourceChanged
    case stagingCreationFailed
    case stagingPermissionFailed
    case statusFailed
    case symbolicLinkNotAllowed
    case unexpectedFileKind
    case writeFailed
}
