import AVFoundation
import AudioToolbox
import CoreMedia
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
    func inspect(source: TrustedMediaSource) async throws -> InspectionOutcome<AudioProperties>
}

public struct AudioInspector: AudioInspecting {
    private static let metadataItemLimit = 64
    private static let metadataKeyUTF8ByteLimit = 128
    private static let metadataValueUTF8ByteLimit = 4_096
    private static let metadataAggregateJSONUTF8ByteLimit = 32_768

    private let stagingDirectory: URL
    private let onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook?
    private let onAfterCopyingChunk: TrustedFileAccess.CopyProgressHook?

    public init() {
        self.stagingDirectory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        self.onBeforeOpeningPathComponent = nil
        self.onAfterCopyingChunk = nil
    }

    init(onBeforeOpeningPathComponent: @escaping TrustedFileAccess.OpenPathComponentHook) {
        self.stagingDirectory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
        self.onAfterCopyingChunk = nil
    }

    init(
        stagingDirectory: URL,
        onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook? = nil,
        onAfterCopyingChunk: TrustedFileAccess.CopyProgressHook? = nil
    ) {
        self.stagingDirectory = stagingDirectory
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
        self.onAfterCopyingChunk = onAfterCopyingChunk
    }

    public func inspect(source: TrustedMediaSource) async throws -> InspectionOutcome<AudioProperties> {
        do {
            try Task.checkCancellation()
            let snapshot = try TrustedFileAccess.stageRegularFile(
                source: source,
                in: stagingDirectory,
                onBeforeOpeningPathComponent: onBeforeOpeningPathComponent,
                onAfterCopyingChunk: onAfterCopyingChunk
            )
            defer { try? FileManager.default.removeItem(at: snapshot.stagingURL) }
            try Task.checkCancellation()
            let candidate = Self.contentCandidate(for: snapshot.header)

            let asset: AVURLAsset
            if let candidate {
                asset = AVURLAsset(
                    url: snapshot.stagingURL,
                    options: [AVURLAssetOverrideMIMETypeKey: candidate.mimeType]
                )
            } else {
                asset = AVURLAsset(url: snapshot.stagingURL)
            }
            try Task.checkCancellation()
            return try await Self.inspect(asset: asset, container: candidate?.container)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            return Self.unreadableOutcome(path: source.relativePath)
        }
    }

    private static func inspect(asset: AVURLAsset, container: String?) async throws -> InspectionOutcome<AudioProperties> {
        try Task.checkCancellation()
        let duration = try await asset.load(.duration)
        try Task.checkCancellation()
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        try Task.checkCancellation()
        guard let audioTrack = audioTracks.first else {
            throw InspectionError.noAudioTrack
        }
        let formatDescriptions = try await audioTrack.load(.formatDescriptions)
        try Task.checkCancellation()
        let streamDescription = formatDescriptions.lazy.compactMap(Self.streamDescription(from:)).first
        let durationSeconds = CMTimeGetSeconds(duration)
        let metadata = try await loadCommonMetadata(from: asset)

        return InspectionOutcome(
            status: .succeeded,
            value: AudioProperties(
                container: container,
                encoding: streamDescription.flatMap(Self.encodingName(from:)),
                durationSeconds: durationSeconds.isFinite && durationSeconds >= 0 ? durationSeconds : nil,
                channelCount: streamDescription.flatMap { $0.mChannelsPerFrame > 0 ? Int($0.mChannelsPerFrame) : nil },
                sampleRate: streamDescription.flatMap { $0.mSampleRate > 0 ? $0.mSampleRate : nil },
                pcmBitDepth: streamDescription.flatMap(Self.pcmBitDepth(from:)),
                isReadable: true,
                metadata: metadata
            ),
            findings: []
        )
    }

    private static func loadCommonMetadata(from asset: AVURLAsset) async throws -> [String: String] {
        do {
            try Task.checkCancellation()
            let items = try await asset.load(.commonMetadata)
            try Task.checkCancellation()
            return try await metadataDictionary(from: items)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            try Task.checkCancellation()
            return [:]
        }
    }

    static func metadataDictionary(from items: [AVMetadataItem]) async throws -> [String: String] {
        var fields: [(key: String, value: String)] = []
        for item in items.prefix(metadataItemLimit) {
            try Task.checkCancellation()
            guard let key = item.commonKey?.rawValue.trimmingCharacters(in: .whitespacesAndNewlines),
                  !key.isEmpty
            else {
                continue
            }

            let stringValue: String?
            do {
                stringValue = try await item.load(.stringValue)
            } catch {
                try Task.checkCancellation()
                continue
            }
            try Task.checkCancellation()
            guard let value = stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !value.isEmpty
            else {
                continue
            }
            let boundedKey = utf8Prefix(
                key.lowercased(),
                maximumByteCount: metadataKeyUTF8ByteLimit
            )
            let boundedValue = utf8Prefix(
                value,
                maximumByteCount: metadataValueUTF8ByteLimit
            )
            guard !boundedKey.isEmpty, !boundedValue.isEmpty else {
                continue
            }
            fields.append((boundedKey, boundedValue))
        }

        let sortedFields = fields.sorted {
            $0.key == $1.key ? $0.value.unicodeScalars.lexicographicallyPrecedes($1.value.unicodeScalars) : $0.key.unicodeScalars.lexicographicallyPrecedes($1.key.unicodeScalars)
        }
        var result: [String: String] = [:]
        for field in sortedFields {
            guard result[field.key] == nil else {
                continue
            }

            var candidate = result
            candidate[field.key] = field.value
            guard let serialized = try? JSONSerialization.data(
                withJSONObject: candidate,
                options: [.sortedKeys]
            ), serialized.count <= metadataAggregateJSONUTF8ByteLimit
            else {
                break
            }
            result = candidate
        }
        return result
    }

    private static func utf8Prefix(_ value: String, maximumByteCount: Int) -> String {
        var result = ""
        result.reserveCapacity(min(value.utf8.count, maximumByteCount))
        var byteCount = 0

        for scalar in value.unicodeScalars {
            let scalarByteCount = String(scalar).utf8.count
            guard byteCount + scalarByteCount <= maximumByteCount else {
                break
            }
            result.unicodeScalars.append(scalar)
            byteCount += scalarByteCount
        }

        return result
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
        encodingName(for: streamDescription.mFormatID)
    }

    static func encodingName(for formatID: AudioFormatID) -> String? {
        switch formatID {
        case kAudioFormatLinearPCM:
            "Linear PCM"
        case kAudioFormatMPEG4AAC:
            "AAC"
        case kAudioFormatAppleLossless:
            "ALAC"
        case kAudioFormatMPEGLayer3:
            "MP3"
        case kAudioFormatFLAC:
            "FLAC"
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

    private static func unreadableOutcome(path: RelativePath) -> InspectionOutcome<AudioProperties> {
        InspectionOutcome(
            status: .failed,
            value: AudioProperties(isReadable: false),
            findings: [
                Finding(
                    ruleID: "inspection.audio-unreadable",
                    severity: .error,
                    title: "Audio file could not be read",
                    explanation: "The selected audio file could not be read safely.",
                    affectedPaths: [path],
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
        case noAudioTrack
    }
}
