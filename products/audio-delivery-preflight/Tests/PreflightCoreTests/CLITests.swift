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

    func testInvalidCommandsMissingFolderDuplicateFlagAndUnknownOptionExitThree() async {
        let output = OutputCapture()
        let invalidArguments = [["scan"], ["unknown"], ["scan", "Fixture", "--unknown", "value"], ["scan", "Fixture", "--preset", "general-audio", "--preset", "digital-release"]]
        for arguments in invalidArguments {
            output.reset()
            let exitCode = await CLI().run(arguments: arguments, environment: environment(output: output))
            XCTAssertEqual(exitCode, 3, "\(arguments)")
            XCTAssertTrue(output.stderr.contains("Invalid command or configuration"))
        }
    }

    func testEmptyScanFolderIsInvalidWithoutInspectingOrScanningTheWorkingDirectory() async throws {
        let output = OutputCapture()
        let calls = CallCapture()
        let fallbackResult = try scanResult(status: .ready)
        var testEnvironment = environment(output: output)
        testEnvironment.folderExists = { _ in
            calls.recordFolderInspection()
            return true
        }
        testEnvironment.scan = { _ in
            calls.recordScan()
            return fallbackResult
        }

        let exitCode = await CLI().run(arguments: ["scan", ""], environment: testEnvironment)

        XCTAssertEqual(exitCode, 3)
        XCTAssertEqual(calls.folderInspectionCalls, 0)
        XCTAssertEqual(calls.scanCalls, 0)
        XCTAssertTrue(output.stderr.contains("Invalid command or configuration"))
        XCTAssertFalse(output.stdout.contains("Scan summary"))
    }

    func testUnknownScanPresetIdentifiesPresetFieldWithoutEchoingValueOrScanning() async throws {
        let output = OutputCapture()
        let calls = CallCapture()
        let privatePresetValue = "/Users/example/private-preset"
        let fallbackResult = try scanResult(status: .ready)
        var testEnvironment = environment(output: output)
        testEnvironment.scan = { _ in
            calls.recordScan()
            return fallbackResult
        }

        let exitCode = await CLI().run(
            arguments: ["scan", "Fixture", "--preset", privatePresetValue],
            environment: testEnvironment
        )

        XCTAssertEqual(exitCode, 3)
        XCTAssertEqual(calls.scanCalls, 0)
        XCTAssertTrue(output.stderr.localizedCaseInsensitiveContains("unknown preset"))
        XCTAssertTrue(output.stderr.contains("--preset"))
        XCTAssertFalse(output.stderr.contains(privatePresetValue))
    }

    func testUnknownPresetShowIdentifiesCommandWithoutEchoingValue() async {
        let output = OutputCapture()
        let privatePresetValue = "/Users/example/private-preset"

        let exitCode = await CLI().run(
            arguments: ["preset", "show", privatePresetValue],
            environment: environment(output: output)
        )

        XCTAssertEqual(exitCode, 3)
        XCTAssertTrue(output.stderr.localizedCaseInsensitiveContains("unknown preset"))
        XCTAssertTrue(output.stderr.contains("preset show"))
        XCTAssertFalse(output.stderr.contains(privatePresetValue))
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
        var exportEnvironment = environment(output: output, result: result, writer: writes.write)
        exportEnvironment.inspectReportDestination = { _ in .absent }
        let exportCode = await CLI().run(arguments: ["scan", "Fixture", "--report-html", "/tmp/report.html", "--report-json", "/tmp/report.json", "--checksums", "/tmp/SHA256SUMS.txt"], environment: exportEnvironment)
        XCTAssertEqual(exportCode, 0)
        XCTAssertEqual(writes.destinations, ["/tmp/report.html", "/tmp/report.json", "/tmp/SHA256SUMS.txt"])
        XCTAssertEqual(writes.data.count, 3)
        XCTAssertTrue(String(decoding: writes.data[1], as: UTF8.self).contains("\"schemaVersion\""))
        XCTAssertFalse(String(decoding: writes.data[1], as: UTF8.self).contains("/Users/example/private-delivery"))
        output.reset()
        var blockedEnvironment = environment(output: output, result: result, writer: { _, _ in throw CLI.RuntimeError.unexpected })
        blockedEnvironment.inspectReportDestination = { _ in .absent }
        let blockedExportCode = await CLI().run(arguments: ["scan", "Fixture", "--report-json", "/tmp/blocked.json"], environment: blockedEnvironment)
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

    func testNormalizedReportDestinationsMustBePairwiseDistinctBeforeScan() async throws {
        let aliases = [
            ("/private/tmp/preflight/report", "/private/tmp/preflight/./report"),
            ("/private/tmp/preflight/Report.JSON", "/private/tmp/preflight/report.json"),
            ("/private/tmp/preflight/Café.json", "/private/tmp/preflight/Cafe\u{301}.json"),
            ("/private/tmp/preflight/ss.json", "/private/tmp/preflight/ß.json"),
            ("/private/tmp/preflight/σ.json", "/private/tmp/preflight/ς.json"),
            ("/private/tmp/preflight/s.json", "/private/tmp/preflight/ſ.json"),
            ("/private/tmp/preflight/μ.json", "/private/tmp/preflight/µ.json"),
            ("/private/tmp/preflight/ff.json", "/private/tmp/preflight/ﬀ.json"),
        ]

        for (first, second) in aliases {
            let output = OutputCapture()
            let calls = CallCapture()
            let fallbackResult = try scanResult(status: .ready)
            var testEnvironment = environment(output: output)
            testEnvironment.scan = { _ in calls.recordScan(); return fallbackResult }
            testEnvironment.writeAtomically = { _, _ in calls.recordWrite() }

            let exitCode = await CLI().run(
                arguments: ["scan", "Fixture", "--report-html", first, "--report-json", second],
                environment: testEnvironment
            )

            XCTAssertEqual(exitCode, 3, "aliases: \(first), \(second)")
            XCTAssertEqual(calls.scanCalls, 0)
            XCTAssertEqual(calls.writeCalls, 0)
            XCTAssertTrue(output.stderr.contains("Invalid command or configuration"))
            XCTAssertFalse(output.stderr.contains(first))
        }
    }

    func testUnicodeFoldedDestinationAliasesCollideWithSourceInventory() async throws {
        let aliases = [
            ("ss.json", "ß.json"),
            ("σ.json", "ς.json"),
            ("s.json", "ſ.json"),
            ("μ.json", "µ.json"),
            ("ff.json", "ﬀ.json"),
        ]
        let root = URL(fileURLWithPath: "/private/tmp/Selected Delivery", isDirectory: true)

        for (sourceName, destinationName) in aliases {
            let output = OutputCapture()
            let calls = CallCapture()
            let result = try scanResult(
                status: .ready,
                inventory: [
                    InventoryEntry(
                        relativePath: try RelativePath("Reports/\(sourceName)"),
                        normalizedFilename: "source",
                        normalizedExtension: "json",
                        category: .other,
                        kind: .regular
                    ),
                ]
            )
            var testEnvironment = environment(output: output, result: result)
            testEnvironment.inspectReportDestination = { _ in .absent }
            testEnvironment.scan = { _ in calls.recordScan(); return result }
            testEnvironment.writeAtomically = { _, _ in calls.recordWrite() }

            let exitCode = await CLI().run(
                arguments: [
                    "scan", root.path,
                    "--report-json", root.appendingPathComponent("Reports/\(destinationName)").path,
                ],
                environment: testEnvironment
            )

            XCTAssertEqual(exitCode, 3, "aliases: \(sourceName), \(destinationName)")
            XCTAssertEqual(calls.scanCalls, 1, "aliases: \(sourceName), \(destinationName)")
            XCTAssertEqual(calls.writeCalls, 0, "aliases: \(sourceName), \(destinationName)")
            XCTAssertFalse(output.stderr.contains(root.path), "aliases: \(sourceName), \(destinationName)")
        }
    }

    func testReportDestinationInsideRootCannotOverwriteAnyInventoriedEntryKind() async throws {
        let root = URL(fileURLWithPath: "/private/tmp/Selected Delivery", isDirectory: true)

        for kind in [FileKind.regular, .directory, .symbolicLink, .special] {
            let output = OutputCapture()
            let calls = CallCapture()
            let collidingPath = try RelativePath("Reports/report.json")
            let result = try scanResult(
                status: .ready,
                inventory: [
                    InventoryEntry(
                        relativePath: collidingPath,
                        normalizedFilename: "report",
                        normalizedExtension: "json",
                        category: .other,
                        kind: kind
                    ),
                ]
            )
            var testEnvironment = environment(output: output, result: result)
            testEnvironment.scan = { _ in calls.recordScan(); return result }
            testEnvironment.writeAtomically = { _, _ in calls.recordWrite() }

            let exitCode = await CLI().run(
                arguments: [
                    "scan", root.path,
                    "--report-json", root.appendingPathComponent("Reports/./REPORT.JSON").path,
                ],
                environment: testEnvironment
            )

            XCTAssertEqual(exitCode, 3, "kind: \(kind)")
            XCTAssertEqual(calls.scanCalls, 1, "kind: \(kind)")
            XCTAssertEqual(calls.writeCalls, 0, "kind: \(kind)")
            XCTAssertFalse(output.stderr.contains(root.path), "kind: \(kind)")
        }
    }

    func testIncompleteResultExitsFourAndExplicitlyLeavesRequirementsUndetermined() async throws {
        let output = OutputCapture()
        let result = try scanResult(status: .incomplete)

        let exitCode = await CLI().run(
            arguments: ["scan", "Fixture"],
            environment: environment(output: output, result: result)
        )

        XCTAssertEqual(exitCode, 4)
        XCTAssertTrue(output.stdout.contains("Status: incomplete"))
        XCTAssertTrue(output.stdout.contains("Requirements outcome: not determined"))
        XCTAssertFalse(output.stdout.contains("Status: ready"))
        XCTAssertFalse(output.stdout.localizedCaseInsensitiveContains("requirements passed"))
    }

    func testSymlinkedOrUnsafeReportDestinationIsRejectedBeforeScanWithoutPathLeakage() async throws {
        for state in [CLI.ReportDestinationState.symbolicLinkInPath, .unsafe] {
            let output = OutputCapture()
            let calls = CallCapture()
            let privateDestination = "/Users/example/private-output/report.json"
            let fallbackResult = try scanResult(status: .ready)
            var testEnvironment = environment(output: output)
            testEnvironment.inspectReportDestination = { _ in state }
            testEnvironment.scan = { _ in calls.recordScan(); return fallbackResult }
            testEnvironment.writeAtomically = { _, _ in calls.recordWrite() }

            let exitCode = await CLI().run(
                arguments: ["scan", "Fixture", "--report-json", privateDestination],
                environment: testEnvironment
            )

            XCTAssertEqual(exitCode, 3)
            XCTAssertEqual(calls.scanCalls, 0)
            XCTAssertEqual(calls.writeCalls, 0)
            XCTAssertFalse(output.stderr.contains(privateDestination))
        }
    }

    func testExistingInsideRootDestinationIsRejectedBeforeScan() async throws {
        let output = OutputCapture()
        let calls = CallCapture()
        let root = URL(fileURLWithPath: "/private/tmp/Selected Delivery", isDirectory: true)
        let fallbackResult = try scanResult(status: .ready)
        var testEnvironment = environment(output: output)
        testEnvironment.inspectReportDestination = { _ in .existingItem }
        testEnvironment.scan = { _ in calls.recordScan(); return fallbackResult }
        testEnvironment.writeAtomically = { _, _ in calls.recordWrite() }

        let exitCode = await CLI().run(
            arguments: ["scan", root.path, "--report-json", root.appendingPathComponent("report.json").path],
            environment: testEnvironment
        )

        XCTAssertEqual(exitCode, 3)
        XCTAssertEqual(calls.scanCalls, 0)
        XCTAssertEqual(calls.writeCalls, 0)
        XCTAssertFalse(output.stderr.contains(root.path))
    }

    func testDestinationThatAppearsInsideRootAfterScanIsRejectedBeforeAnyWrite() async throws {
        let output = OutputCapture()
        let calls = CallCapture()
        let states = DestinationStateSequence([.absent, .existingItem])
        let root = URL(fileURLWithPath: "/private/tmp/Selected Delivery", isDirectory: true)
        let result = try scanResult(status: .ready)
        var testEnvironment = environment(output: output, result: result)
        testEnvironment.inspectReportDestination = states.next
        testEnvironment.scan = { _ in calls.recordScan(); return result }
        testEnvironment.writeAtomically = { _, _ in calls.recordWrite() }

        let exitCode = await CLI().run(
            arguments: ["scan", root.path, "--report-json", root.appendingPathComponent("new-report.json").path],
            environment: testEnvironment
        )

        XCTAssertEqual(exitCode, 3)
        XCTAssertEqual(calls.scanCalls, 1)
        XCTAssertEqual(calls.writeCalls, 0)
    }

    func testNewNonCollidingInsideRootDestinationMayBeWrittenExplicitly() async throws {
        let output = OutputCapture()
        let writes = AtomicWriteCapture()
        let root = URL(fileURLWithPath: "/private/tmp/Selected Delivery", isDirectory: true)
        let result = try scanResult(status: .ready)
        var testEnvironment = environment(output: output, result: result, writer: writes.write)
        testEnvironment.inspectReportDestination = { _ in .absent }

        let destination = root.appendingPathComponent("Reports/new-report.json")
        let exitCode = await CLI().run(
            arguments: ["scan", root.path, "--report-json", destination.path],
            environment: testEnvironment
        )

        XCTAssertEqual(exitCode, 0)
        XCTAssertEqual(writes.destinations, [destination.path])
    }

    func testProductionDestinationInspectorUsesLstatAndDoesNotFollowSymlinkAncestor() throws {
        let base = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
            .appendingPathComponent("CLIDestination-\(UUID().uuidString)", isDirectory: true)
        let realDirectory = base.appendingPathComponent("real", isDirectory: true)
        let linkedDirectory = base.appendingPathComponent("linked", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: base) }
        try FileManager.default.createDirectory(at: realDirectory, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: linkedDirectory, withDestinationURL: realDirectory)

        let destination = linkedDirectory.appendingPathComponent("report.json")

        XCTAssertEqual(CLI.reportDestinationState(at: destination), .symbolicLinkInPath)
        XCTAssertFalse(FileManager.default.fileExists(atPath: realDirectory.appendingPathComponent("report.json").path))
    }

    func testProductionAtomicWriterCannotWriteThroughSymlinkAncestorOrReplaceWhenExclusive() throws {
        let base = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("CLIAtomicWrite-\(UUID().uuidString)", isDirectory: true)
        let realDirectory = base.appendingPathComponent("real", isDirectory: true)
        let linkedDirectory = base.appendingPathComponent("linked", isDirectory: true)
        let existing = realDirectory.appendingPathComponent("existing.json")
        defer { try? FileManager.default.removeItem(at: base) }
        try FileManager.default.createDirectory(at: realDirectory, withIntermediateDirectories: true)
        try Data("SOURCE".utf8).write(to: existing)
        try FileManager.default.createSymbolicLink(at: linkedDirectory, withDestinationURL: realDirectory)

        XCTAssertThrowsError(
            try CLI.writeReportAtomically(
                Data("REPORT".utf8),
                to: linkedDirectory.appendingPathComponent("escaped.json"),
                allowReplacingExisting: false
            )
        )
        XCTAssertFalse(FileManager.default.fileExists(atPath: realDirectory.appendingPathComponent("escaped.json").path))

        XCTAssertThrowsError(
            try CLI.writeReportAtomically(
                Data("REPORT".utf8),
                to: existing,
                allowReplacingExisting: false
            )
        )
        XCTAssertEqual(try Data(contentsOf: existing), Data("SOURCE".utf8))

        let newReport = realDirectory.appendingPathComponent("new-report.json")
        try CLI.writeReportAtomically(
            Data("REPORT".utf8),
            to: newReport,
            allowReplacingExisting: false
        )
        XCTAssertEqual(try Data(contentsOf: newReport), Data("REPORT".utf8))
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

    private func scanResult(
        status: OverallStatus,
        preset: ResolvedPreset? = nil,
        inventory: [InventoryEntry]? = nil
    ) throws -> ScanResult {
        let resolved = try preset ?? PresetResolver().resolve(BuiltInPresets.generalAudio)
        let findings: [Finding]
        switch status {
        case .ready: findings = []
        case .needsReview: findings = [Finding(ruleID: "test.warning", severity: .warning, title: "Warning", explanation: "Warning", affectedPaths: [], evidence: [], expected: "Expected", suggestedAction: "Review", origin: .engine, engineVersion: "0.1.0")]
        case .requirementsNotMet: findings = [Finding(ruleID: "test.error", severity: .error, title: "Error", explanation: "Error", affectedPaths: [], evidence: [], expected: "Expected", suggestedAction: "Fix", origin: .engine, engineVersion: "0.1.0")]
        case .incomplete: findings = []
        }
        let defaultInventory = [InventoryEntry(relativePath: try RelativePath("Masters/Main Master.wav"), normalizedFilename: "main master", normalizedExtension: "wav", category: .audio, byteSize: 4, kind: .regular, sha256: String(repeating: "a", count: 64))]
        return ScanResult(selectedFolderName: "Fixture", preset: resolved, applicationVersion: "0.1.0", engineVersion: "0.1.0", startedAt: Date(timeIntervalSince1970: 0), completedAt: Date(timeIntervalSince1970: 1), inventory: inventory ?? defaultInventory, findings: findings, overallStatus: status)
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

private final class CallCapture: @unchecked Sendable {
    private let lock = NSLock()
    private var capturedFolderInspectionCalls = 0
    private var capturedScanCalls = 0
    private var capturedWriteCalls = 0
    var folderInspectionCalls: Int { lock.lock(); defer { lock.unlock() }; return capturedFolderInspectionCalls }
    var scanCalls: Int { lock.lock(); defer { lock.unlock() }; return capturedScanCalls }
    var writeCalls: Int { lock.lock(); defer { lock.unlock() }; return capturedWriteCalls }
    func recordFolderInspection() { lock.lock(); capturedFolderInspectionCalls += 1; lock.unlock() }
    func recordScan() { lock.lock(); capturedScanCalls += 1; lock.unlock() }
    func recordWrite() { lock.lock(); capturedWriteCalls += 1; lock.unlock() }
}

private final class DestinationStateSequence: @unchecked Sendable {
    private let lock = NSLock()
    private var states: [CLI.ReportDestinationState]
    init(_ states: [CLI.ReportDestinationState]) { self.states = states }
    func next(_ destination: URL) -> CLI.ReportDestinationState {
        lock.lock()
        defer { lock.unlock() }
        return states.isEmpty ? .unsafe : states.removeFirst()
    }
}
