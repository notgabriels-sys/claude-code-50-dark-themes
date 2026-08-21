import Foundation
import XCTest
@testable import AudioPreflightCLI
@testable import PreflightCore

final class CLITests: XCTestCase {
    func testSupportingCommandsListPresetsShowResolvedRequirementsAndVersion() async throws {
        let output = OutputCapture()
        let cli = CLI()
        let presetsCode = await cli.run(arguments: ["presets"], environment: environment(output: output))
        XCTAssertEqual(presetsCode, 0)
        XCTAssertTrue(output.stdout.contains("general-audio"))
        XCTAssertTrue(output.stdout.contains("digital-release"))
        output.reset()
        let showCode = await cli.run(arguments: ["preset", "show", "digital-release"], environment: environment(output: output))
        XCTAssertEqual(showCode, 0)
        XCTAssertTrue(output.stdout.contains("Resolved requirements"))
        XCTAssertTrue(output.stdout.contains("metadata or credits"))
        output.reset()
        let versionCode = await cli.run(arguments: ["version"], environment: environment(output: output))
        XCTAssertEqual(versionCode, 0)
        XCTAssertTrue(output.stdout.contains("Audio Delivery Preflight 0.1.0"))
    }

    func testInvalidCommandsMissingFolderDuplicateFlagAndUnknownPresetExitThree() async {
        let output = OutputCapture()
        let invalidArguments = [["scan"], ["unknown"], ["scan", "Fixture", "--unknown", "value"], ["scan", "Fixture", "--preset", "general-audio", "--preset", "digital-release"], ["scan", "Fixture", "--preset", "not-a-preset"]]
        for arguments in invalidArguments {
            output.reset()
            let exitCode = await CLI().run(arguments: arguments, environment: environment(output: output))
            XCTAssertEqual(exitCode, 3, "\(arguments)")
            XCTAssertTrue(output.stderr.contains("Invalid command or configuration"))
        }
    }

    func testUnavailableFolderAndInjectedScanStartFailureExitFourWithoutPathLeakage() async {
        let output = OutputCapture()
        let privatePath = "/Users/example/private-delivery"
        let unavailableCode = await CLI().run(arguments: ["scan", privatePath], environment: environment(output: output, folderExists: false))
        XCTAssertEqual(unavailableCode, 4)
        XCTAssertFalse(output.stderr.contains(privatePath))
        output.reset()
        let startFailureCode = await CLI().run(arguments: ["scan", "Fixture"], environment: environment(output: output, scanError: .scanCouldNotStart))
        XCTAssertEqual(startFailureCode, 4)
        XCTAssertTrue(output.stderr.contains("Scan could not start safely"))
    }

    func testReadyWarningAndErrorResultsUseDocumentedExitCodesAndPrintRequirementsBeforeSummary() async throws {
        for (status, expectedCode) in [(OverallStatus.ready, Int32(0)), (.needsReview, Int32(1)), (.requirementsNotMet, Int32(2))] {
            let output = OutputCapture()
            let result = try scanResult(status: status)
            let exitCode = await CLI().run(arguments: ["scan", "Fixture"], environment: environment(output: output, result: result))
            XCTAssertEqual(exitCode, expectedCode)
            let text = output.stdout
            XCTAssertLessThan(try XCTUnwrap(text.range(of: "Resolved requirements")?.lowerBound), try XCTUnwrap(text.range(of: "Scan summary")?.lowerBound))
            XCTAssertTrue(text.contains("Status: \(status.rawValue)"))
            XCTAssertTrue(text.contains("Masters/Main Master.wav"))
            XCTAssertFalse(text.contains("/Users/example/private-delivery"))
        }
    }

    func testExplicitReportWritesAreInjectedAtomicAndExportFailureDoesNotRewriteScanVerdict() async throws {
        let output = OutputCapture()
        let writes = AtomicWriteCapture()
        let result = try scanResult(status: .ready)
        let exportCode = await CLI().run(arguments: ["scan", "Fixture", "--report-html", "/tmp/report.html", "--report-json", "/tmp/report.json", "--checksums", "/tmp/SHA256SUMS.txt"], environment: environment(output: output, result: result, writer: writes.write))
        XCTAssertEqual(exportCode, 0)
        XCTAssertEqual(writes.destinations, ["/tmp/report.html", "/tmp/report.json", "/tmp/SHA256SUMS.txt"])
        XCTAssertEqual(writes.data.count, 3)
        XCTAssertTrue(String(decoding: writes.data[1], as: UTF8.self).contains("\"schemaVersion\""))
        XCTAssertFalse(String(decoding: writes.data[1], as: UTF8.self).contains("/Users/example/private-delivery"))
        output.reset()
        let blockedExportCode = await CLI().run(arguments: ["scan", "Fixture", "--report-json", "/tmp/blocked.json"], environment: environment(output: output, result: result, writer: { _, _ in throw CLI.RuntimeError.unexpected }))
        XCTAssertEqual(blockedExportCode, 5)
        XCTAssertTrue(output.stdout.contains("Status: ready"))
        XCTAssertTrue(output.stderr.contains("completed scan result is unchanged"))
    }

    func testUnexpectedInjectedFailureExitsFive() async {
        let output = OutputCapture()
        let exitCode = await CLI().run(arguments: ["scan", "Fixture"], environment: environment(output: output, scanError: .unexpected))
        XCTAssertEqual(exitCode, 5)
        XCTAssertTrue(output.stderr.contains("internal failure"))
    }

    private func environment(output: OutputCapture, result: ScanResult? = nil, folderExists: Bool = true, scanError: CLI.RuntimeError? = nil, writer: @escaping @Sendable (Data, URL) throws -> Void = { _, _ in }) -> CLI.Environment {
        let defaultResult = try! scanResult(status: .ready)
        return CLI.Environment(
            scan: { request in
                if let scanError { throw scanError }
                if let result { return result }
                return ScanResult(selectedFolderName: defaultResult.selectedFolderName, preset: request.preset, applicationVersion: defaultResult.applicationVersion, engineVersion: defaultResult.engineVersion, startedAt: defaultResult.startedAt, completedAt: defaultResult.completedAt, inventory: defaultResult.inventory, findings: defaultResult.findings, overallStatus: defaultResult.overallStatus)
            },
            folderExists: { _ in folderExists },
            writeAtomically: writer,
            writeStandardOutput: output.writeStandardOutput,
            writeStandardError: output.writeStandardError,
            applicationVersion: "0.1.0",
            engineVersion: "0.1.0"
        )
    }

    private func scanResult(status: OverallStatus, preset: ResolvedPreset? = nil) throws -> ScanResult {
        let resolved = try preset ?? PresetResolver().resolve(BuiltInPresets.generalAudio)
        let findings: [Finding]
        switch status {
        case .ready: findings = []
        case .needsReview: findings = [Finding(ruleID: "test.warning", severity: .warning, title: "Warning", explanation: "Warning", affectedPaths: [], evidence: [], expected: "Expected", suggestedAction: "Review", origin: .engine, engineVersion: "0.1.0")]
        case .requirementsNotMet: findings = [Finding(ruleID: "test.error", severity: .error, title: "Error", explanation: "Error", affectedPaths: [], evidence: [], expected: "Expected", suggestedAction: "Fix", origin: .engine, engineVersion: "0.1.0")]
        case .incomplete: findings = []
        }
        return ScanResult(selectedFolderName: "Fixture", preset: resolved, applicationVersion: "0.1.0", engineVersion: "0.1.0", startedAt: Date(timeIntervalSince1970: 0), completedAt: Date(timeIntervalSince1970: 1), inventory: [InventoryEntry(relativePath: try RelativePath("Masters/Main Master.wav"), normalizedFilename: "main master", normalizedExtension: "wav", category: .audio, byteSize: 4, kind: .regular, sha256: String(repeating: "a", count: 64))], findings: findings, overallStatus: status)
    }
}

private final class OutputCapture: @unchecked Sendable {
    private let lock = NSLock()
    private var capturedStandardOutput = ""
    private var capturedStandardError = ""
    var stdout: String { value(standardOutput: true) }
    var stderr: String { value(standardOutput: false) }
    func reset() { lock.lock(); capturedStandardOutput = ""; capturedStandardError = ""; lock.unlock() }
    func writeStandardOutput(_ value: String) { lock.lock(); capturedStandardOutput += value + "\n"; lock.unlock() }
    func writeStandardError(_ value: String) { lock.lock(); capturedStandardError += value + "\n"; lock.unlock() }
    private func value(standardOutput: Bool) -> String { lock.lock(); defer { lock.unlock() }; return standardOutput ? capturedStandardOutput : capturedStandardError }
}

private final class AtomicWriteCapture: @unchecked Sendable {
    private let lock = NSLock()
    private var capturedDestinations: [String] = []
    private var capturedData: [Data] = []
    var destinations: [String] { lock.lock(); defer { lock.unlock() }; return capturedDestinations }
    var data: [Data] { lock.lock(); defer { lock.unlock() }; return capturedData }
    func write(_ data: Data, to url: URL) { lock.lock(); capturedDestinations.append(url.path); capturedData.append(data); lock.unlock() }
}
