import XCTest
@testable import PreflightCore

final class DomainModelTests: XCTestCase {
    func testFindingRoundTripPreservesEvidenceAndOrigin() throws {
        let finding = Finding(
            ruleID: "audio.mixed-sample-rates",
            severity: .warning,
            title: "Mixed sample rates",
            explanation: "The package contains more than one sample rate.",
            affectedPaths: [try RelativePath("Masters/Track.wav")],
            evidence: [.init(label: "sampleRate", value: .number(48_000))],
            expected: "One sample rate for matched masters",
            suggestedAction: "Confirm that the difference is intentional.",
            origin: .preset,
            engineVersion: "0.1.0"
        )

        let data = try JSONEncoder().encode(finding)

        XCTAssertEqual(try JSONDecoder().decode(Finding.self, from: data), finding)
    }

    func testOverallStatusUsesMostSevereCompletedFinding() {
        XCTAssertEqual(OverallStatus.completed(findings: []), .ready)
        XCTAssertEqual(OverallStatus.completed(findings: [.fixture(.warning)]), .needsReview)
        XCTAssertEqual(OverallStatus.completed(findings: [.fixture(.error)]), .requirementsNotMet)
    }

    func testOverallStatusKeepsPassAndInformationReadyAndErrorsOutrankWarnings() {
        XCTAssertEqual(OverallStatus.completed(findings: [.fixture(.pass)]), .ready)
        XCTAssertEqual(OverallStatus.completed(findings: [.fixture(.information)]), .ready)
        XCTAssertEqual(
            OverallStatus.completed(findings: [.fixture(.warning), .fixture(.pass), .fixture(.error)]),
            .requirementsNotMet
        )
    }

    func testOverallStatusCompletedFindingsNeverProduceIncomplete() {
        let statuses = [
            OverallStatus.completed(findings: []),
            OverallStatus.completed(findings: [.fixture(.pass)]),
            OverallStatus.completed(findings: [.fixture(.information)]),
            OverallStatus.completed(findings: [.fixture(.warning)]),
            OverallStatus.completed(findings: [.fixture(.error)]),
        ]

        XCTAssertFalse(statuses.contains(.incomplete))
    }

    func testEvidenceValueRoundTripsEverySupportedValue() throws {
        let values: [EvidenceValue] = [
            .string("WAV"),
            .number(48_000),
            .integer(24),
            .boolean(true),
            .unknown,
        ]

        let data = try JSONEncoder().encode(values)

        XCTAssertEqual(try JSONDecoder().decode([EvidenceValue].self, from: data), values)
    }

    func testRelativePathRejectsAbsoluteTraversalAndNonCanonicalValues() {
        for path in ["/Users/gabriel/Masters/Track.wav", "../Track.wav", "Masters/../Track.wav", "Masters//Track.wav", "./Track.wav"] {
            XCTAssertThrowsError(try RelativePath(path))
        }

        XCTAssertThrowsError(try JSONDecoder().decode(RelativePath.self, from: Data("\"../Track.wav\"".utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(RelativePath.self, from: Data("\"/Users/gabriel/Masters/Track.wav\"".utf8)))
    }

    func testEncodedScanResultContainsOnlyValidatedRelativeSourcePaths() throws {
        let master = try RelativePath("Masters/Track.wav")
        let artwork = try RelativePath("Artwork/cover.png")
        let result = ScanResult(
            selectedFolderName: "Delivery",
            preset: .fixture,
            applicationVersion: "0.1.0",
            engineVersion: "0.1.0",
            startedAt: Date(timeIntervalSince1970: 0),
            inventory: [
                InventoryEntry(
                    relativePath: master,
                    normalizedFilename: "track.wav",
                    normalizedExtension: "wav",
                    category: .audio,
                    kind: .regular
                ),
            ],
            findings: [
                Finding(
                    ruleID: "artwork.present",
                    severity: .pass,
                    title: "Artwork present",
                    explanation: "The required artwork file is present.",
                    affectedPaths: [artwork],
                    evidence: [],
                    expected: "An artwork file",
                    suggestedAction: "None.",
                    origin: .preset,
                    engineVersion: "0.1.0"
                ),
            ],
            overallStatus: .ready
        )

        let data = try JSONEncoder().encode(result)
        let decoded = try JSONDecoder().decode(ScanResult.self, from: data)

        XCTAssertEqual(decoded.inventory.map(\.relativePath.value), ["Masters/Track.wav"])
        XCTAssertEqual(decoded.findings.flatMap(\.affectedPaths).map(\.value), ["Artwork/cover.png"])
        XCTAssertEqual(decoded, result)
    }

    func testPathBearingPreflightErrorsRequireValidatedRelativePaths() throws {
        let path = try RelativePath("Masters/Track.wav")
        let error = PreflightError.inspectionFailed(relativePath: path, reason: "Unreadable")

        let data = try JSONEncoder().encode(error)

        XCTAssertEqual(try JSONDecoder().decode(PreflightError.self, from: data), error)
    }
}

private extension Finding {
    static func fixture(_ severity: FindingSeverity) -> Finding {
        Finding(
            ruleID: "test.fixture",
            severity: severity,
            title: "Fixture",
            explanation: "Test fixture.",
            affectedPaths: [],
            evidence: [],
            expected: "Fixture expectation",
            suggestedAction: "Fixture action",
            origin: .engine,
            engineVersion: "0.1.0"
        )
    }
}

private extension ResolvedPreset {
    static let fixture = ResolvedPreset(
        identifier: "test",
        name: "Test preset",
        requirements: []
    )
}
