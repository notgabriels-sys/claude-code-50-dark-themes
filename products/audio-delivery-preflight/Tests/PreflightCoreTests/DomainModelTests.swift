import XCTest
@testable import PreflightCore

final class DomainModelTests: XCTestCase {
    func testFindingRoundTripPreservesEvidenceAndOrigin() throws {
        let finding = Finding(
            ruleID: "audio.mixed-sample-rates",
            severity: .warning,
            title: "Mixed sample rates",
            explanation: "The package contains more than one sample rate.",
            affectedPaths: ["Masters/Track.wav"],
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
