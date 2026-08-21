import XCTest
@testable import PreflightCore

final class JSONReportWriterTests: XCTestCase {
    func testJSONIsStableVersionedAndPrivate() throws {
        let result = try ReportFixture.result()
        let writer = JSONReportWriter()

        let first = try writer.data(for: result)
        let second = try writer.data(for: result)
        let text = try XCTUnwrap(String(data: first, encoding: .utf8))

        XCTAssertEqual(first, second)
        XCTAssertTrue(text.hasPrefix("{\n"))
        XCTAssertTrue(text.contains("\"schemaVersion\" : \"1.0\""))
        XCTAssertTrue(text.contains("\"engineVersion\" : \"0.1.0\""))
        XCTAssertTrue(text.contains("\"identifier\" : \"general-audio\""))
        XCTAssertTrue(text.contains("\"overallStatus\" : \"needsReview\""))
        XCTAssertTrue(text.contains("Track.wav"))
        XCTAssertTrue(text.contains("sampleRate"))
        XCTAssertTrue(text.contains("audio.mixed-sample-rates"))
        XCTAssertFalse(text.contains("/Users/example/private-delivery"))
    }

    func testJSONExportsOnlyValidatedRelativePaths() throws {
        let result = try ReportFixture.result(relativePath: "Masters/Track.wav")
        let unsafeEntry = InventoryEntry(
            relativePath: try RelativePath("Masters/Other.wav"),
            normalizedFilename: "other.wav",
            normalizedExtension: "wav",
            category: .audio,
            kind: .regular
        )
        let unsafeResult = ScanResult(
            selectedFolderName: result.selectedFolderName,
            preset: result.preset,
            applicationVersion: result.applicationVersion,
            engineVersion: result.engineVersion,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
            inventory: [unsafeEntry],
            findings: result.findings,
            overallStatus: result.overallStatus
        )

        let text = try XCTUnwrap(String(data: JSONReportWriter().data(for: unsafeResult), encoding: .utf8))
        XCTAssertTrue(text.contains("Masters"))
        XCTAssertFalse(text.contains("/Users/example/private-delivery"))
    }
}

enum ReportFixture {
    static func result(relativePath: String = "Masters/Track.wav") throws -> ScanResult {
        let path = try RelativePath(relativePath)
        let preset = try PresetResolver().resolve(BuiltInPresets.generalAudio)
        let entry = InventoryEntry(
            relativePath: path,
            normalizedFilename: "track.wav",
            normalizedExtension: "wav",
            category: .audio,
            byteSize: 1_024,
            modificationDate: Date(timeIntervalSince1970: 1_700_000_001),
            kind: .regular,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            inspectionStatus: .succeeded,
            audioProperties: AudioProperties(channelCount: 2, sampleRate: 48_000, isReadable: true),
            evidence: [Evidence(label: "sampleRate", value: .number(48_000))]
        )
        let finding = Finding(
            ruleID: "audio.mixed-sample-rates",
            severity: .warning,
            title: "Mixed sample rates",
            explanation: "The package contains more than one sample rate.",
            affectedPaths: [path],
            evidence: [Evidence(label: "sampleRate", value: .number(48_000))],
            expected: "One sample rate for matched masters.",
            suggestedAction: "Confirm the difference is intentional.",
            origin: .preset,
            engineVersion: "0.1.0"
        )
        return ScanResult(
            selectedFolderName: "private-delivery",
            preset: preset,
            applicationVersion: "0.1.0",
            engineVersion: "0.1.0",
            startedAt: Date(timeIntervalSince1970: 1_700_000_000),
            completedAt: Date(timeIntervalSince1970: 1_700_000_002),
            inventory: [entry],
            findings: [finding],
            overallStatus: .needsReview
        )
    }
}
