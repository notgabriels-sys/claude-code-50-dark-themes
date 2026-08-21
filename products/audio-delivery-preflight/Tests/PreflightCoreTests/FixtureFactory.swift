import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
@testable import PreflightCore

enum FixtureFactory {
    static func wavData(
        channels: UInt16,
        sampleRate: UInt32,
        bitDepth: UInt16,
        frameCount: UInt32
    ) -> Data {
        let bytesPerSample = UInt32(bitDepth / 8)
        let blockAlign = channels * UInt16(bytesPerSample)
        let dataSize = frameCount * UInt32(blockAlign)
        var data = Data()
        data.append("RIFF".data(using: .ascii)!)
        appendLittleEndian(36 + dataSize, to: &data)
        data.append("WAVEfmt ".data(using: .ascii)!)
        appendLittleEndian(UInt32(16), to: &data)
        appendLittleEndian(UInt16(1), to: &data)
        appendLittleEndian(channels, to: &data)
        appendLittleEndian(sampleRate, to: &data)
        appendLittleEndian(sampleRate * UInt32(blockAlign), to: &data)
        appendLittleEndian(blockAlign, to: &data)
        appendLittleEndian(bitDepth, to: &data)
        data.append("data".data(using: .ascii)!)
        appendLittleEndian(dataSize, to: &data)
        data.append(Data(repeating: 0, count: Int(dataSize)))
        return data
    }

    static func wav(
        channels: UInt16,
        sampleRate: UInt32,
        bitDepth: UInt16,
        frameCount: UInt32,
        pathExtension: String = "wav"
    ) throws -> URL {
        let url = temporaryURL(pathExtension: pathExtension)
        try wavData(
            channels: channels,
            sampleRate: sampleRate,
            bitDepth: bitDepth,
            frameCount: frameCount
        ).write(to: url)
        return url
    }

    static func truncatedWAV() throws -> URL {
        let url = temporaryURL(pathExtension: "wav")
        try Data("RIFF\u{00}\u{00}\u{00}\u{00}WAVE".utf8).write(to: url)
        return url
    }

    static func text(pathExtension: String) throws -> URL {
        let url = temporaryURL(pathExtension: pathExtension)
        try Data("This is not media.".utf8).write(to: url)
        return url
    }

    static func aacM4A(sampleRate: Double, channels: AVAudioChannelCount, frameCount: AVAudioFrameCount) throws -> URL {
        guard sampleRate == 44_100, channels == 1, frameCount == 4_410 else {
            throw FixtureError.unsupportedAACFixtureConfiguration
        }
        let url = temporaryURL(pathExtension: "m4a")
        // Synthetic 0.1 s mono AAC-LC silence. Generated with FFmpeg 8.1.1 using:
        // ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.1 -c:a aac -b:a 64000
        //   -movflags +faststart -map_metadata -1 -fflags +bitexact -flags:a +bitexact silence.m4a
        // SHA-256: f995d9f26e1ea62f9f3a12e6569f870e28b25a0d1ee3da9169076a8137aed089
        let base64 = """
        AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAtZtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAZAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACJXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAZAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAGQAAAQAAAEAAAAAAZ1tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAKxEAAAVOlXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFIbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEMc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAKxEAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAPoAAAAGFgWAgIAFEghW5QAGgICAAQIAAAAgc3R0cwAAAAAAAAACAAAABQAABAAAAAABAAABOgAAABxzdHNjAAAAAAAAAAEAAAABAAAABgAAAAEAAAAUc3RzegAAAAAAAAAEAAAABgAAABRzdGNvAAAAAAAAAAEAAAMCAAAAGnNncGQBAAAAcm9sbAAAAAIAAAAB//8AAAAcc2JncAAAAAByb2xsAAAAAQAAAAYAAAABAAAAPXVkdGEAAAA1bWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAIaWxzdAAAAAhmcmVlAAAAIG1kYXQBGCAHARggBwEYIAcBGCAHARggBwEYIAc=
        """
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            throw FixtureError.audioFixtureDecodeFailed
        }
        try data.write(to: url)
        return url
    }

    static func symbolicLink(to targetURL: URL, pathExtension: String) throws -> URL {
        let url = temporaryURL(pathExtension: pathExtension)
        try FileManager.default.createSymbolicLink(at: url, withDestinationURL: targetURL)
        return url
    }

    static func png(width: Int, height: Int, alpha: Bool) throws -> URL {
        try image(width: width, height: height, alpha: alpha, type: .png, pathExtension: "png")
    }

    static func jpeg(width: Int, height: Int) throws -> URL {
        try image(width: width, height: height, alpha: false, type: .jpeg, pathExtension: "jpg")
    }

    private static func image(
        width: Int,
        height: Int,
        alpha: Bool,
        type: UTType,
        pathExtension: String
    ) throws -> URL {
        let alphaInfo: CGImageAlphaInfo = alpha ? .premultipliedLast : .noneSkipLast
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: alphaInfo.rawValue
        ), let image = context.makeImage() else {
            throw FixtureError.imageCreationFailed
        }

        let url = temporaryURL(pathExtension: pathExtension)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else {
            throw FixtureError.imageDestinationCreationFailed
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw FixtureError.imageWriteFailed
        }
        return url
    }

    private static func temporaryURL(pathExtension: String) -> URL {
        URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("PreflightFixture-\(UUID().uuidString)")
            .appendingPathExtension(pathExtension)
    }

    private static func appendLittleEndian<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
        var littleEndian = value.littleEndian
        withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
    }

    private enum FixtureError: Error {
        case imageCreationFailed
        case imageDestinationCreationFailed
        case imageWriteFailed
        case audioFixtureDecodeFailed
        case unsupportedAACFixtureConfiguration
    }
}

final class InspectionFixture: @unchecked Sendable {
    let root: URL
    let externalRoot: URL
    let stagingDirectory: URL

    private init(root: URL, externalRoot: URL, stagingDirectory: URL) {
        self.root = root
        self.externalRoot = externalRoot
        self.stagingDirectory = stagingDirectory
    }

    static func make() throws -> InspectionFixture {
        let temporaryDirectory = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
        let root = temporaryDirectory.appendingPathComponent("InspectionFixture-\(UUID().uuidString)", isDirectory: true)
        let externalRoot = temporaryDirectory.appendingPathComponent("InspectionFixtureExternal-\(UUID().uuidString)", isDirectory: true)
        let stagingDirectory = temporaryDirectory.appendingPathComponent("InspectionFixtureStage-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        return InspectionFixture(root: root, externalRoot: externalRoot, stagingDirectory: stagingDirectory)
    }

    func write(_ data: Data, to relativePath: String) throws -> RelativePath {
        let relativePath = try RelativePath(relativePath)
        let url = root.appendingPathComponent(relativePath.value)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
        return relativePath
    }

    func writeExternal(_ data: Data, to relativePath: String) throws -> URL {
        let url = externalRoot.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
        return url
    }

    func append(_ data: Data, to relativePath: RelativePath) throws {
        let handle = try FileHandle(forWritingTo: root.appendingPathComponent(relativePath.value))
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }

    func overwriteLastByte(of relativePath: RelativePath, with byte: UInt8) throws {
        let url = root.appendingPathComponent(relativePath.value)
        let byteSize = try byteSize(of: relativePath)
        guard byteSize > 0 else {
            throw InspectionFixtureError.emptyFile
        }
        let handle = try FileHandle(forWritingTo: url)
        try handle.seek(toOffset: UInt64(byteSize - 1))
        try handle.write(contentsOf: Data([byte]))
        try handle.close()
        try FileManager.default.setAttributes(
            [.modificationDate: Date(timeIntervalSince1970: 946_684_800)],
            ofItemAtPath: url.path
        )
    }

    func byteSize(of relativePath: RelativePath) throws -> Int64 {
        let values = try root.appendingPathComponent(relativePath.value)
            .resourceValues(forKeys: [.fileSizeKey])
        guard let fileSize = values.fileSize else {
            throw InspectionFixtureError.missingFileSize
        }
        return Int64(fileSize)
    }

    func source(_ relativePath: RelativePath) -> TrustedMediaSource {
        TrustedMediaSource(root: root, relativePath: relativePath)
    }

    func replaceLeaf(_ relativePath: RelativePath, with externalURL: URL) throws {
        let destination = root.appendingPathComponent(relativePath.value)
        try FileManager.default.removeItem(at: destination)
        try FileManager.default.createSymbolicLink(at: destination, withDestinationURL: externalURL)
    }

    func replaceFirstAncestor(with externalURL: URL) throws {
        let ancestor = root.appendingPathComponent("Masters", isDirectory: true)
        try FileManager.default.removeItem(at: ancestor)
        try FileManager.default.createSymbolicLink(at: ancestor, withDestinationURL: externalURL)
    }

    func stagingFiles() throws -> [URL] {
        try FileManager.default.contentsOfDirectory(at: stagingDirectory, includingPropertiesForKeys: nil)
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: externalRoot)
        try? FileManager.default.removeItem(at: stagingDirectory)
    }
}

private enum InspectionFixtureError: Error {
    case emptyFile
    case missingFileSize
}

final class OneShotMutation: @unchecked Sendable {
    private let lock = NSLock()
    private var hasPerformed = false
    private var storedError: Error?

    var didPerform: Bool {
        lock.lock()
        defer { lock.unlock() }
        return hasPerformed
    }

    var error: Error? {
        lock.lock()
        defer { lock.unlock() }
        return storedError
    }

    func perform(_ operation: () throws -> Void) {
        lock.lock()
        guard !hasPerformed else {
            lock.unlock()
            return
        }
        hasPerformed = true
        lock.unlock()

        do {
            try operation()
        } catch {
            lock.lock()
            storedError = error
            lock.unlock()
        }
    }
}

final class CopyProgressRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var byteCounts: [Int64] = []

    var maximumByteCount: Int64? {
        lock.lock()
        defer { lock.unlock() }
        return byteCounts.max()
    }

    func record(_ byteCount: Int64) {
        lock.lock()
        byteCounts.append(byteCount)
        lock.unlock()
    }
}

final class InvocationRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var invocationCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }

    func record() {
        lock.lock()
        count += 1
        lock.unlock()
    }
}
