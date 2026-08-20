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
    private static let fallbackMIMETypes = [
        (mimeType: "audio/vnd.wave", container: "WAV"),
        (mimeType: "audio/aiff", container: "AIFF"),
        (mimeType: "audio/flac", container: "FLAC"),
        (mimeType: "audio/mpeg", container: "MP3"),
        (mimeType: "audio/mp4", container: "M4A"),
    ]

    public init() {}

    public func inspect(url: URL) async -> InspectionOutcome<AudioProperties> {
        guard !Self.isSymbolicLink(url) else {
            return Self.unreadableOutcome()
        }

        do {
            return try await Self.inspect(
                asset: AVURLAsset(url: url),
                container: Self.containerName(for: url)
            )
        } catch {
            for fallback in Self.fallbackMIMETypes {
                do {
                    return try await Self.inspect(
                        asset: AVURLAsset(
                            url: url,
                            options: [AVURLAssetOverrideMIMETypeKey: fallback.mimeType]
                        ),
                        container: Self.containerName(for: url) ?? fallback.container
                    )
                } catch {
                    continue
                }
            }
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

    private static func isSymbolicLink(_ url: URL) -> Bool {
        (try? url.standardizedFileURL.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
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
