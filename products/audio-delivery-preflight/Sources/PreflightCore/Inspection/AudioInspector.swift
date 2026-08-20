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
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties>
}

public struct AudioInspector: AudioInspecting {
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

    public func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        do {
            let snapshot = try TrustedFileAccess.stageRegularFile(
                source: source,
                in: stagingDirectory,
                onBeforeOpeningPathComponent: onBeforeOpeningPathComponent,
                onAfterCopyingChunk: onAfterCopyingChunk
            )
            defer { try? FileManager.default.removeItem(at: snapshot.stagingURL) }
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
        case noAudioTrack
    }
}
