import Foundation
import XCTest
@testable import PreflightCore

final class AudioInspectorTests: XCTestCase {
    func testPCMMonoWAVReportsMeasuredPropertiesFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/Track.wav")

        let outcome = await AudioInspector().inspect(source: fixture.source(path))
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

        let outcome = await AudioInspector().inspect(source: fixture.source(path))

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

        let outcome = await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(outcome.value?.container, "M4A")
        XCTAssertEqual(outcome.value?.encoding, "AAC")
        XCTAssertEqual(outcome.value?.channelCount, 1)
        XCTAssertEqual(outcome.value?.sampleRate, 44_100)
        XCTAssertNil(outcome.value?.pcmBitDepth)
    }

    func testWAVBytesNamedMP3ReportValidatedWAVContainer() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/Track.mp3")

        let outcome = await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(outcome.value?.container, "WAV")
    }

    func testTruncatedWAVIsAnUnreadableFailure() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(Data("RIFF\u{00}\u{00}\u{00}\u{00}WAVE".utf8), to: "Masters/Track.wav")

        let outcome = await AudioInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
    }

    func testRejectsNonFileRoot() async throws {
        let source = TrustedMediaSource(
            root: try XCTUnwrap(URL(string: "https://example.invalid/delivery")),
            relativePath: try RelativePath("Track.wav")
        )

        let outcome = await AudioInspector().inspect(source: source)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
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

        let outcome = await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
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

        let outcome = await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
    }

    func testStagingFileIsDeletedAfterSuccessAndFailure() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let validPath = try fixture.write(FixtureFactory.wavData(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100), to: "Masters/valid.wav")
        let invalidPath = try fixture.write(Data("not audio".utf8), to: "Masters/invalid.wav")
        let inspector = AudioInspector(stagingDirectory: fixture.stagingDirectory)
        let successOutcome = await inspector.inspect(source: fixture.source(validPath))
        let failureOutcome = await inspector.inspect(source: fixture.source(invalidPath))

        XCTAssertEqual(successOutcome.status, .succeeded)
        XCTAssertEqual(try fixture.stagingFiles(), [])
        XCTAssertEqual(failureOutcome.status, .failed)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }
}
