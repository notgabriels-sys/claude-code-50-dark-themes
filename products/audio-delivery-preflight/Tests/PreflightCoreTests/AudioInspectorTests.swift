import XCTest
@testable import PreflightCore

final class AudioInspectorTests: XCTestCase {
    func testPCMMonoWAVReportsMeasuredProperties() async throws {
        let url = try FixtureFactory.wav(channels: 1, sampleRate: 44_100, bitDepth: 16, frameCount: 44_100)
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = await AudioInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)
        let duration = try XCTUnwrap(properties.durationSeconds)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.container, "WAV")
        XCTAssertEqual(duration, 1, accuracy: 0.001)
        XCTAssertEqual(properties.channelCount, 1)
        XCTAssertEqual(properties.sampleRate, 44_100)
        XCTAssertEqual(properties.pcmBitDepth, 16)
        XCTAssertEqual(properties.encoding, "Linear PCM")
        XCTAssertEqual(properties.isReadable, true)
    }

    func testPCMStereoWAVReports24BitProperties() async throws {
        let url = try FixtureFactory.wav(channels: 2, sampleRate: 48_000, bitDepth: 24, frameCount: 48_000)
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = await AudioInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)
        let duration = try XCTUnwrap(properties.durationSeconds)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.container, "WAV")
        XCTAssertEqual(duration, 1, accuracy: 0.001)
        XCTAssertEqual(properties.channelCount, 2)
        XCTAssertEqual(properties.sampleRate, 48_000)
        XCTAssertEqual(properties.pcmBitDepth, 24)
        XCTAssertEqual(properties.encoding, "Linear PCM")
        XCTAssertEqual(properties.isReadable, true)
    }

    func testTruncatedWAVIsAnUnreadableFailure() async throws {
        let url = try FixtureFactory.truncatedWAV()
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = await AudioInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(properties.isReadable, false)
        XCTAssertTrue(outcome.findings.contains { $0.ruleID == "audio.unreadable" })
        XCTAssertTrue(outcome.findings.allSatisfy { !$0.explanation.contains(url.path) })
    }

    func testTextNamedWAVIsAnUnreadableFailure() async throws {
        let url = try FixtureFactory.text(pathExtension: "WAV")
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = await AudioInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(properties.isReadable, false)
        XCTAssertTrue(outcome.findings.contains { $0.ruleID == "audio.unreadable" })
    }

    func testReadableWAVWithNonAudioExtensionIsIdentifiedBySuccessfulInspection() async throws {
        let url = try FixtureFactory.wav(
            channels: 1,
            sampleRate: 44_100,
            bitDepth: 16,
            frameCount: 44_100,
            pathExtension: "delivery"
        )
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = await AudioInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)
        let duration = try XCTUnwrap(properties.durationSeconds)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.container, "WAV")
        XCTAssertEqual(duration, 1, accuracy: 0.001)
        XCTAssertEqual(properties.channelCount, 1)
        XCTAssertEqual(properties.sampleRate, 44_100)
        XCTAssertEqual(properties.pcmBitDepth, 16)
        XCTAssertEqual(properties.isReadable, true)
    }

    func testSymbolicLinkIsRejectedWithoutInspectingTarget() async throws {
        let targetURL = try FixtureFactory.wav(
            channels: 1,
            sampleRate: 44_100,
            bitDepth: 16,
            frameCount: 44_100
        )
        let linkURL = try FixtureFactory.symbolicLink(to: targetURL, pathExtension: "wav")
        defer {
            try? FileManager.default.removeItem(at: linkURL)
            try? FileManager.default.removeItem(at: targetURL)
        }

        let outcome = await AudioInspector().inspect(url: linkURL)
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(properties.isReadable, false)
        XCTAssertTrue(outcome.findings.contains { $0.ruleID == "audio.unreadable" })
    }
}
