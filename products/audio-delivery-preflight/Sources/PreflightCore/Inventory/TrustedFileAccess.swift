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

struct TrustedFileContents: Sendable {
    let data: Data
    let byteSize: Int64
}

enum TrustedFileAccess {
    typealias OpenPathComponentHook = @Sendable (RelativePath, Int) -> Void

    static func readRegularFile(
        source: TrustedMediaSource,
        onBeforeOpeningPathComponent: OpenPathComponentHook? = nil
    ) throws -> TrustedFileContents {
        let rootDescriptor = try openTrustedRoot(at: source.root)
        defer { Darwin.close(rootDescriptor) }
        let fileDescriptor = try openRegularFile(
            relativePath: source.relativePath,
            from: rootDescriptor,
            onBeforeOpeningPathComponent: onBeforeOpeningPathComponent
        )
        defer { Darwin.close(fileDescriptor) }

        var fileStatus = stat()
        guard Darwin.fstat(fileDescriptor, &fileStatus) == 0 else {
            throw TrustedFileAccessError.statusFailed
        }

        let handle = FileHandle(fileDescriptor: fileDescriptor, closeOnDealloc: false)
        var data = Data()
        while let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty {
            data.append(chunk)
        }

        return TrustedFileContents(data: data, byteSize: Int64(fileStatus.st_size))
    }

    static func openTrustedRoot(at root: URL) throws -> Int32 {
        guard root.isFileURL else {
            throw TrustedFileAccessError.nonFileRoot
        }
        let descriptor = try openURL(root.standardizedFileURL, flags: O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        do {
            try requireDirectory(descriptor)
        } catch {
            Darwin.close(descriptor)
            throw error
        }
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
    case invalidRelativePath
    case nonFileRoot
    case openFailed
    case statusFailed
    case unexpectedFileKind
}
