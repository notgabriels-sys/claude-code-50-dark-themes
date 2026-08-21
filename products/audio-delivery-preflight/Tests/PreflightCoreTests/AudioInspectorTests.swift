import AudioToolbox
import AVFoundation
import Foundation
import XCTest
@testable import PreflightCore

final class AudioInspectorTests: XCTestCase {
    func testPCMMonoWAVReportsMeasuredPropertiesFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/Track.wav")

        let outcome = try await AudioInspector().inspect(source: fixture.source(path))
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.container, "WAV")
        XCTAssertEqual(try XCTUnwrap(properties.durationSeconds), 1, accuracy: 0.001)
        XCTAssertEqual(properties.channelCount, 1)
        XCTAssertEqual(properties.sampleRate, 44_100)
        XCTAssertEqual(properties.pcmBitDepth, 16)
        XCTAssertEqual(properties.encoding, "Linear PCM")
    }

    func testPCM24BitStereoWAVReportsMeasuredPropertiesFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 2, sampleRate: 48_000, bitDepth: 24, frameCount: 48_000), to: "Masters/Track.wav")

        let outcome = try await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(outcome.value?.channelCount, 2)
        XCTAssertEqual(outcome.value?.sampleRate, 48_000)
        XCTAssertEqual(outcome.value?.pcmBitDepth, 24)
    }

    func testAACM4AReportsCompressedEncodingFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let mediaURL = try FixtureFactory.aacM4A(sampleRate: 44_100, channels: 1, frameCount: 4_410)
        defer { try? FileManager.default.removeItem(at: mediaURL) }
        let path = try fixture.write(Data(contentsOf: mediaURL), to: "Masters/Track.m4a")

        let outcome = try await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(outcome.value?.container, "M4A")
        XCTAssertEqual(outcome.value?.encoding, "AAC")
        XCTAssertEqual(outcome.value?.channelCount, 1)
        XCTAssertEqual(outcome.value?.sampleRate, 44_100)
        XCTAssertNil(outcome.value?.pcmBitDepth)
    }

    func testFrameworkProvenCompressedIdentifiersMapToStableNamesAndUnknownRemainsNil() {
        XCTAssertEqual(AudioInspector.encodingName(for: kAudioFormatAppleLossless), "ALAC")
        XCTAssertEqual(AudioInspector.encodingName(for: kAudioFormatMPEGLayer3), "MP3")
        XCTAssertEqual(AudioInspector.encodingName(for: kAudioFormatFLAC), "FLAC")
        XCTAssertNil(AudioInspector.encodingName(for: 0x3F3F3F3F))
    }

    func testCommonEmbeddedMetadataMapsToStableTextFields() async throws {
        let title = AVMutableMetadataItem()
        title.identifier = .commonIdentifierTitle
        title.value = "Fixture Title" as NSString
        let artist = AVMutableMetadataItem()
        artist.identifier = .commonIdentifierArtist
        artist.value = "Fixture Artist" as NSString

        let metadata = try await AudioInspector.metadataDictionary(from: [artist, title])

        XCTAssertEqual(metadata, ["artist": "Fixture Artist", "title": "Fixture Title"])
    }

    func testWAVBytesNamedMP3ReportValidatedWAVContainer() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/Track.mp3")

        let outcome = try await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(outcome.value?.container, "WAV")
    }

    func testTruncatedWAVIsAnUnreadableFailure() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(Data("RIFF\u{00}\u{00}\u{00}\u{00}WAVE".utf8), to: "Masters/Track.wav")

        let outcome = try await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[path]])
    }

    func testRejectsNonFileRoot() async throws {
        let source = TrustedMediaSource(
            root: try XCTUnwrap(URL(string: "https://example.invalid/delivery")),
            relativePath: try RelativePath("Track.wav")
        )

        let outcome = try await AudioInspector().inspect(source: source)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[source.relativePath]])
    }

    func testSwappedLeafCannotCauseExternalAudioToBeInspected() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/Track.wav")
        let externalURL = try fixture.writeExternal(FixtureFactory.wavData(channels: 2, sampleRate: 48_000, bitDepth: 24, frameCount: 48_000), to: "sentinel.wav")
        let inspector = AudioInspector(onBeforeOpeningPathComponent: { relativePath, componentIndex in
            guard relativePath == path, componentIndex == 1 else { return }
            try? fixture.replaceLeaf(path, with: externalURL)
        })

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[path]])
    }

    func testSwappedAncestorCannotCauseExternalAudioToBeInspected() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/Track.wav")
        _ = try fixture.writeExternal(FixtureFactory.wavData(channels: 2, sampleRate: 48_000, bitDepth: 24, frameCount: 48_000), to: "Track.wav")
        let inspector = AudioInspector(onBeforeOpeningPathComponent: { relativePath, componentIndex in
            guard relativePath == path, componentIndex == 0 else { return }
            try? fixture.replaceFirstAncestor(with: fixture.externalRoot)
        })

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[path]])
    }

    func testStagingFileIsDeletedAfterSuccessAndFailure() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let validPath = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/valid.wav")
        let invalidPath = try fixture.write(Data("not audio".utf8), to: "Masters/invalid.wav")
        let inspector = AudioInspector(stagingDirectory: fixture.stagingDirectory)
        let successOutcome = try await inspector.inspect(source: fixture.source(validPath))
        let failureOutcome = try await inspector.inspect(source: fixture.source(invalidPath))

        XCTAssertEqual(successOutcome.status, .succeeded)
        XCTAssertEqual(try fixture.stagingFiles(), [])
        XCTAssertEqual(failureOutcome.status, .failed)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }

    func testGrowingAudioSourceIsRejectedWithoutCopyingBeyondInitialSnapshot() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let originalData = FixtureFactory.wavData(
            channels: 1,
            sampleRate: 44_100,
            bitDepth: 16,
            frameCount: 44_100
        )
        let path = try fixture.write(originalData, to: "Masters/growing.wav")
        let mutation = OneShotMutation()
        let progress = CopyProgressRecorder()
        let appendedData = Data(repeating: 0xA5, count: 32 * 1_024)
        let inspector = AudioInspector(
            stagingDirectory: fixture.stagingDirectory,
            onAfterCopyingChunk: { relativePath, copiedByteCount in
                guard relativePath == path else { return }
                progress.record(copiedByteCount)
                mutation.perform {
                    try fixture.append(appendedData, to: path)
                }
            }
        )

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertTrue(mutation.didPerform)
        XCTAssertNil(mutation.error)
        XCTAssertEqual(progress.maximumByteCount, Int64(originalData.count))
        XCTAssertEqual(try fixture.byteSize(of: path), Int64(originalData.count + appendedData.count))
        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }

    func testSameSizeAudioSourceMutationIsRejected() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let originalData = FixtureFactory.wavData(
            channels: 1,
            sampleRate: 44_100,
            bitDepth: 16,
            frameCount: 44_100
        )
        let path = try fixture.write(originalData, to: "Masters/mutating.wav")
        let mutation = OneShotMutation()
        let inspector = AudioInspector(
            stagingDirectory: fixture.stagingDirectory,
            onAfterCopyingChunk: { relativePath, _ in
                guard relativePath == path else { return }
                mutation.perform {
                    try fixture.overwriteLastByte(of: path, with: 0x7F)
                }
            }
        )

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertTrue(mutation.didPerform)
        XCTAssertNil(mutation.error)
        XCTAssertEqual(try fixture.byteSize(of: path), Int64(originalData.count))
        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }

    func testCancellationAfterAStagingChunkPropagatesAndCleansStaging() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(
            FixtureFactory.wavData(channels: 2, sampleRate: 48_000, bitDepth: 24, frameCount: 96_000),
            to: "Masters/cancellable.wav"
        )
        let gate = InspectionCopyGate()
        let inspector = AudioInspector(
            stagingDirectory: fixture.stagingDirectory,
            onAfterCopyingChunk: { relativePath, _ in
                guard relativePath == path else { return }
                gate.blockOnceUntilReleased()
            }
        )

        let task = Task { () -> Bool in
            do {
                _ = try await inspector.inspect(source: fixture.source(path))
                return false
            } catch is CancellationError {
                return true
            } catch {
                return false
            }
        }
        await fulfillment(of: [gate.copyStarted], timeout: 2)
        task.cancel()
        gate.release()
        let didPropagateCancellation = await task.value

        XCTAssertTrue(didPropagateCancellation)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }
}

private final class InspectionCopyGate: @unchecked Sendable {
    let copyStarted = XCTestExpectation(description: "staging copy started")
    private let lock = NSLock()
    private let releaseSemaphore = DispatchSemaphore(value: 0)
    private var didBlock = false

    func blockOnceUntilReleased() {
        lock.lock()
        guard !didBlock else {
            lock.unlock()
            return
        }
        didBlock = true
        lock.unlock()
        copyStarted.fulfill()
        releaseSemaphore.wait()
    }

    func release() {
        releaseSemaphore.signal()
    }
}
