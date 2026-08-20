import AVFoundation
import AudioToolbox
import CoreMedia
import Darwin
import Foundation

public struct InspectionOutcome<Value: Sendable>: Sendable {
    public let status: InspectionStatus
    public let value: Value?
    public let findings: [Finding]

    public init(status: InspectionStatus, value: Value?, findings: [Finding]) {
        self.status = status
        self.value = value
        self.findings = findings
    }
}

public protocol AudioInspecting: Sendable {
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties>
}

public struct AudioInspector: AudioInspecting {
    private let stagingDirectory: URL
    private let onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook?

    public init() {
        self.stagingDirectory = FileManager.default.temporaryDirectory
        self.onBeforeOpeningPathComponent = nil
    }

    init(onBeforeOpeningPathComponent: @escaping TrustedFileAccess.OpenPathComponentHook) {
        self.stagingDirectory = FileManager.default.temporaryDirectory
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
    }

    init(
        stagingDirectory: URL,
        onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook? = nil
    ) {
        self.stagingDirectory = stagingDirectory
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
    }

    public func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        do {
            let contents = try TrustedFileAccess.readRegularFile(
                source: source,
                onBeforeOpeningPathComponent: onBeforeOpeningPathComponent
            )
            let candidate = Self.contentCandidate(for: contents.data)
            let stagingURL = try Self.createStagingFile(data: contents.data, in: stagingDirectory)
            defer { try? FileManager.default.removeItem(at: stagingURL) }

            let asset: AVURLAsset
            if let candidate {
                asset = AVURLAsset(
                    url: stagingURL,
                    options: [AVURLAssetOverrideMIMETypeKey: candidate.mimeType]
                )
            } else {
                asset = AVURLAsset(url: stagingURL)
            }
            return try await Self.inspect(asset: asset, container: candidate?.container)
        } catch {
            return Self.unreadableOutcome()
        }
    }

    private static func inspect(asset: AVURLAsset, container: String?) async throws -> InspectionOutcome<AudioProperties> {
        let duration = try await asset.load(.duration)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        guard let audioTrack = audioTracks.first else {
            throw InspectionError.noAudioTrack
        }
        let formatDescriptions = try await audioTrack.load(.formatDescriptions)
        let streamDescription = formatDescriptions.lazy.compactMap(Self.streamDescription(from:)).first
        let durationSeconds = CMTimeGetSeconds(duration)

        return InspectionOutcome(
            status: .succeeded,
            value: AudioProperties(
                container: container,
                encoding: streamDescription.flatMap(Self.encodingName(from:)),
                durationSeconds: durationSeconds.isFinite && durationSeconds >= 0 ? durationSeconds : nil,
                channelCount: streamDescription.flatMap { $0.mChannelsPerFrame > 0 ? Int($0.mChannelsPerFrame) : nil },
                sampleRate: streamDescription.flatMap { $0.mSampleRate > 0 ? $0.mSampleRate : nil },
                pcmBitDepth: streamDescription.flatMap(Self.pcmBitDepth(from:)),
                isReadable: true
            ),
            findings: []
        )
    }

    private static func createStagingFile(data: Data, in directory: URL) throws -> URL {
        guard directory.isFileURL else {
            throw InspectionError.invalidStagingDirectory
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var template = directory.appendingPathComponent("audio-inspector-XXXXXXXX").path.utf8CString
        let descriptor = template.withUnsafeMutableBufferPointer { buffer in
            Darwin.mkstemp(buffer.baseAddress!)
        }
        guard descriptor >= 0 else {
            throw InspectionError.stagingCreationFailed
        }
        let path = template.withUnsafeBufferPointer { buffer in
            String(cString: buffer.baseAddress!)
        }
        let url = URL(fileURLWithPath: path)
        var completed = false
        defer {
            Darwin.close(descriptor)
            if !completed {
                try? FileManager.default.removeItem(at: url)
            }
        }
        guard Darwin.fchmod(descriptor, S_IRUSR | S_IWUSR) == 0 else {
            throw InspectionError.stagingPermissionFailed
        }
        try FileHandle(fileDescriptor: descriptor, closeOnDealloc: false).write(contentsOf: data)
        completed = true
        return url
    }

    private static func streamDescription(from description: CMFormatDescription) -> AudioStreamBasicDescription? {
        guard CMFormatDescriptionGetMediaType(description) == kCMMediaType_Audio else {
            return nil
        }
        return CMAudioFormatDescriptionGetStreamBasicDescription(description)?.pointee
    }

    private static func contentCandidate(for data: Data) -> (mimeType: String, container: String)? {
        if data.starts(with: Data("RIFF".utf8)), data.dropFirst(8).starts(with: Data("WAVE".utf8)) {
            return ("audio/vnd.wave", "WAV")
        }
        if data.starts(with: Data("FORM".utf8)), data.dropFirst(8).starts(with: Data("AIFF".utf8)) || data.dropFirst(8).starts(with: Data("AIFC".utf8)) {
            return ("audio/aiff", "AIFF")
        }
        if data.starts(with: Data("fLaC".utf8)) {
            return ("audio/flac", "FLAC")
        }
        if data.starts(with: Data("ID3".utf8)) || (data.count >= 2 && data[data.startIndex] == 0xFF && (data[data.index(after: data.startIndex)] & 0xE0) == 0xE0) {
            return ("audio/mpeg", "MP3")
        }
        if data.count >= 12,
           data.dropFirst(4).starts(with: Data("ftyp".utf8)),
           data.dropFirst(8).starts(with: Data("M4A".utf8)) {
            return ("audio/mp4", "M4A")
        }
        return nil
    }

    private static func encodingName(from streamDescription: AudioStreamBasicDescription) -> String? {
        switch streamDescription.mFormatID {
        case kAudioFormatLinearPCM:
            "Linear PCM"
        case kAudioFormatMPEG4AAC:
            "AAC"
        default:
            nil
        }
    }

    private static func pcmBitDepth(from streamDescription: AudioStreamBasicDescription) -> Int? {
        guard streamDescription.mFormatID == kAudioFormatLinearPCM, streamDescription.mBitsPerChannel > 0 else {
            return nil
        }
        return Int(streamDescription.mBitsPerChannel)
    }

    private static func unreadableOutcome() -> InspectionOutcome<AudioProperties> {
        InspectionOutcome(
            status: .failed,
            value: AudioProperties(isReadable: false),
            findings: [
                Finding(
                    ruleID: "audio.unreadable",
                    severity: .error,
                    title: "Audio file could not be read",
                    explanation: "The selected audio file could not be read safely.",
                    affectedPaths: [],
                    evidence: [.init(label: "isReadable", value: .boolean(false))],
                    expected: "A readable regular audio file inside the selected root.",
                    suggestedAction: "Replace or re-export the audio file.",
                    origin: .engine,
                    engineVersion: "0.1.0"
                ),
            ]
        )
    }

    private enum InspectionError: Error {
        case invalidStagingDirectory
        case stagingCreationFailed
        case stagingPermissionFailed
        case noAudioTrack
    }
}
