import AVFoundation
import AudioToolbox
import CoreMedia
import Foundation
import UniformTypeIdentifiers

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
    func inspect(url: URL) async -> InspectionOutcome<AudioProperties>
}

public struct AudioInspector: AudioInspecting {
    public init() {}

    public func inspect(url: URL) async -> InspectionOutcome<AudioProperties> {
        guard !Self.isSymbolicLink(url) else {
            return Self.unreadableOutcome()
        }

        let contentCandidate = Self.contentCandidate(for: url)
        let container = Self.containerName(for: url) ?? contentCandidate?.container
        do {
            return try await Self.inspect(
                asset: AVURLAsset(url: url),
                container: container
            )
        } catch {
            guard let contentCandidate else {
                return Self.unreadableOutcome()
            }

            do {
                return try await Self.inspect(
                    asset: AVURLAsset(
                        url: url,
                        options: [AVURLAssetOverrideMIMETypeKey: contentCandidate.mimeType]
                    ),
                    container: container
                )
            } catch {
                return Self.unreadableOutcome()
            }
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

    private static func isSymbolicLink(_ url: URL) -> Bool {
        (try? url.standardizedFileURL.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
    }

    private static func contentCandidate(for url: URL) -> (mimeType: String, container: String)? {
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            return nil
        }
        defer { try? handle.close() }

        guard let bytes = try? handle.read(upToCount: 12) else {
            return nil
        }

        if bytes.starts(with: Data("RIFF".utf8)), bytes.dropFirst(8).starts(with: Data("WAVE".utf8)) {
            return ("audio/vnd.wave", "WAV")
        }
        if bytes.starts(with: Data("FORM".utf8)), bytes.dropFirst(8).starts(with: Data("AIFF".utf8)) || bytes.dropFirst(8).starts(with: Data("AIFC".utf8)) {
            return ("audio/aiff", "AIFF")
        }
        if bytes.starts(with: Data("fLaC".utf8)) {
            return ("audio/flac", "FLAC")
        }
        if bytes.starts(with: Data("ID3".utf8)) || (bytes.count >= 2 && bytes[bytes.startIndex] == 0xFF && (bytes[bytes.index(after: bytes.startIndex)] & 0xE0) == 0xE0) {
            return ("audio/mpeg", "MP3")
        }
        if bytes.count >= 12,
           bytes.dropFirst(4).starts(with: Data("ftyp".utf8)),
           bytes.dropFirst(8).starts(with: Data("M4A".utf8)) {
            return ("audio/mp4", "M4A")
        }

        return nil
    }

    private static func encodingName(from streamDescription: AudioStreamBasicDescription) -> String? {
        guard streamDescription.mFormatID == kAudioFormatLinearPCM else {
            return nil
        }
        return "Linear PCM"
    }

    private static func pcmBitDepth(from streamDescription: AudioStreamBasicDescription) -> Int? {
        guard streamDescription.mFormatID == kAudioFormatLinearPCM, streamDescription.mBitsPerChannel > 0 else {
            return nil
        }
        return Int(streamDescription.mBitsPerChannel)
    }

    private static func containerName(for url: URL) -> String? {
        switch url.pathExtension.lowercased() {
        case "aif", "aiff": "AIFF"
        case "flac": "FLAC"
        case "m4a": "M4A"
        case "mp3": "MP3"
        case "wav": "WAV"
        default:
            contentTypeContainerName(for: url)
        }
    }

    private static func contentTypeContainerName(for url: URL) -> String? {
        guard let contentType = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType else {
            return nil
        }
        return switch contentType.preferredFilenameExtension?.lowercased() {
        case "aif", "aiff": "AIFF"
        case "flac": "FLAC"
        case "m4a": "M4A"
        case "mp3": "MP3"
        case "wav": "WAV"
        default: nil
        }
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
                    explanation: "The file could not be inspected as readable audio.",
                    affectedPaths: [],
                    evidence: [.init(label: "isReadable", value: .boolean(false))],
                    expected: "A readable audio file.",
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
