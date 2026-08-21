import Foundation
import PreflightCore
import XCTest
@testable import AudioDeliveryPreflightApp

@MainActor
final class AppModelTests: XCTestCase {
    func testSelectionMovesToRequirementsWithoutScanningAndShowsOnlyFolderName() async throws {
        let scan = ScanCapture(result: try result(status: .ready))
        let model = AppModel(environment: environment(scan: scan))
        let privateURL = URL(fileURLWithPath: "/Users/example/Private/Delivery", isDirectory: true)

        XCTAssertTrue(model.selectFolder(privateURL))

        XCTAssertEqual(model.phase, .requirements)
        XCTAssertEqual(model.selectedFolderName, "Delivery")
        XCTAssertFalse(model.selectedFolderName?.contains("/Users/example") ?? true)
        XCTAssertFalse(model.resolvedRequirements.isEmpty)
        let scanCount = await scan.callCount
        XCTAssertEqual(scanCount, 0)
    }

    func testStartScanMovesThroughScanningToResults() async throws {
        let scan = ControlledScan(result: try result(status: .ready))
        let model = AppModel(environment: environment(scan: scan))
        XCTAssertTrue(model.selectFolder(folderURL()))

        model.startScan()
        await scan.waitUntilCalled()

        XCTAssertEqual(model.phase, .scanning)
        await scan.finish()
        await waitUntil { model.phase == .results }
        XCTAssertEqual(model.result?.overallStatus, .ready)
    }

    func testCancellationSettlesAsIncompleteAndNeverReady() async throws {
        let scan = CancellationScan(preset: try PresetResolver().resolve(BuiltInPresets.generalAudio))
        let model = AppModel(environment: environment(scan: scan))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await scan.waitUntilCalled()

        model.cancelScan()
        await waitUntil { model.phase == .results }

        XCTAssertEqual(model.result?.overallStatus, .incomplete)
        XCTAssertNotEqual(model.result?.overallStatus, .ready)
        XCTAssertEqual(model.result?.findings.first?.ruleID, "scan.cancelled")
    }

    func testCancellationSettlesImmediatelyWhenScannerDoesNotCooperate() async throws {
        let scan = UncooperativeScan()
        let model = AppModel(environment: environment(scan: scan))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await scan.waitUntilCalled()

        model.cancelScan()

        XCTAssertEqual(model.phase, .results)
        XCTAssertEqual(model.result?.overallStatus, .incomplete)
        XCTAssertEqual(model.result?.findings.first?.ruleID, "scan.cancelled")
        XCTAssertNotEqual(model.result?.overallStatus, .ready)
        await scan.release(with: try result(status: .ready))
        await Task.yield()
        XCTAssertEqual(model.result?.overallStatus, .incomplete)
    }

    func testChoosingAnotherFolderClearsStaleSessionState() async throws {
        let scan = ScanCapture(result: try result(status: .needsReview))
        let model = AppModel(environment: environment(scan: scan))
        XCTAssertTrue(model.selectFolder(folderURL(name: "First")))
        model.startScan()
        await waitUntil { model.phase == .results }
        model.selectedFindingID = 0
        model.activeSeverities = [.warning]
        model.showExport()
        model.lastExportedFormat = .json
        model.errorMessage = "Old error"

        XCTAssertTrue(model.selectFolder(folderURL(name: "Second")))

        XCTAssertEqual(model.phase, .requirements)
        XCTAssertEqual(model.selectedFolderName, "Second")
        XCTAssertNil(model.result)
        XCTAssertNil(model.selectedFindingID)
        XCTAssertEqual(model.activeSeverities, Set(FindingSeverity.allCases))
        XCTAssertNil(model.lastExportedFormat)
        XCTAssertNil(model.errorMessage)
    }

    func testClearSelectionReturnsToStartAndForgetsFolder() {
        let model = AppModel(environment: environment(scan: ScanCapture(result: nil)))
        XCTAssertTrue(model.selectFolder(folderURL(name: "ForgetMe")))

        model.clearSelection()

        XCTAssertEqual(model.phase, .start)
        XCTAssertNil(model.selectedFolderName)
        XCTAssertNil(model.result)
        XCTAssertTrue(model.resolvedRequirements.isEmpty)
        XCTAssertFalse(model.canStartScan)
    }

    func testExportFailurePreservesResultAndReturnsToUsableResults() async throws {
        let expected = try result(status: .ready)
        let scan = ScanCapture(result: expected)
        let export = ExportCapture(error: TestError.exportFailed)
        let model = AppModel(environment: environment(scan: scan, export: export))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await waitUntil { model.phase == .results }
        model.showExport()

        await model.export(.html, to: URL(fileURLWithPath: "/private/tmp/report.html"))

        XCTAssertEqual(model.phase, .results)
        XCTAssertEqual(model.result, expected)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertNil(model.lastExportedFormat)
    }

    func testDefaultModelDoesNotPersistOrRestoreRecentFolderPaths() {
        let defaultsName = "AppModelTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: defaultsName)!
        defer { defaults.removePersistentDomain(forName: defaultsName) }
        let before = defaults.dictionaryRepresentation()

        let model = AppModel(environment: environment(scan: ScanCapture(result: nil)))
        XCTAssertTrue(model.selectFolder(folderURL(name: "NeverPersist")))
        let newModel = AppModel(environment: environment(scan: ScanCapture(result: nil)))

        XCTAssertNil(newModel.selectedFolderName)
        XCTAssertEqual(defaults.dictionaryRepresentation() as NSDictionary, before as NSDictionary)
    }

    func testDropRejectsNonFileAndNonFolderInputsWithoutScanning() async {
        let scan = ScanCapture(result: nil)
        let model = AppModel(environment: environment(scan: scan))

        XCTAssertFalse(model.acceptDroppedFolder(URL(string: "https://example.com/private")!))
        XCTAssertFalse(model.acceptDroppedFolder(URL(fileURLWithPath: "/private/tmp/not-a-folder")))

        XCTAssertEqual(model.phase, .start)
        let scanCount = await scan.callCount
        XCTAssertEqual(scanCount, 0)
    }

    func testUnresolvedRequirementsPreventScan() async {
        let scan = ScanCapture(result: nil)
        var environment = environment(scan: scan)
        environment.resolvePreset = { _ in throw TestError.invalidPreset }
        let model = AppModel(environment: environment)

        XCTAssertTrue(model.selectFolder(folderURL()))
        XCTAssertEqual(model.phase, .requirements)
        XCTAssertFalse(model.canStartScan)
        XCTAssertNotNil(model.errorMessage)
        model.startScan()

        XCTAssertEqual(model.phase, .requirements)
        let scanCount = await scan.callCount
        XCTAssertEqual(scanCount, 0)
    }

    func testResultFiltersPreserveOriginalFindingIdentityAndDetailSelection() async throws {
        let warningPath = try RelativePath("Masters/Main Master.wav")
        let secondWarningPath = try RelativePath("Masters/Alternate Master.wav")
        let errorPath = try RelativePath("Artwork/Cover.png")
        let firstWarning = finding(
            id: "audio.sample-rate",
            severity: .warning,
            path: warningPath,
            evidenceValue: "44100 Hz"
        )
        let secondWarning = finding(
            id: "audio.sample-rate",
            severity: .warning,
            path: secondWarningPath,
            evidenceValue: "48000 Hz"
        )
        let error = finding(id: "artwork.dimensions", severity: .error, path: errorPath)
        let scan = ScanCapture(result: try result(status: .requirementsNotMet, findings: [firstWarning, secondWarning, error]))
        let model = AppModel(environment: environment(scan: scan))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await waitUntil { model.phase == .results }

        XCTAssertEqual(model.findingRows.map(\.id), [0, 1, 2])
        XCTAssertNotEqual(model.findingRows[0].id, model.findingRows[1].id)

        model.activeSeverities = [.warning]

        XCTAssertEqual(model.filteredFindingRows.map(\.id), [0, 1])
        XCTAssertEqual(model.filteredFindingRows.map(\.finding.ruleID), ["audio.sample-rate", "audio.sample-rate"])
        XCTAssertEqual(model.filteredFindingRows.first?.finding.affectedPaths.map(\.value), ["Masters/Main Master.wav"])
        XCTAssertFalse(model.filteredFindingRows.first!.finding.affectedPaths[0].value.hasPrefix("/"))

        model.selectedFindingID = model.filteredFindingRows[1].id

        XCTAssertEqual(model.selectedFindingRow?.finding.affectedPaths.map(\.value), ["Masters/Alternate Master.wav"])
        XCTAssertEqual(model.findingForDetail?.evidence.first?.value, .string("48000 Hz"))
    }

    func testExportUsesReviewedWritersAndRequiresExplicitDestination() async throws {
        let scanResult = try result(status: .ready)
        let scan = ScanCapture(result: scanResult)
        let export = ExportCapture()
        let model = AppModel(environment: environment(scan: scan, export: export))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await waitUntil { model.phase == .results }

        let callsBeforeExport = await export.callCount
        XCTAssertEqual(callsBeforeExport, 0)
        model.showExport()
        await model.export(.json, to: URL(fileURLWithPath: "/private/tmp/report.json"))

        let callsAfterExport = await export.callCount
        XCTAssertEqual(callsAfterExport, 1)
        XCTAssertEqual(model.lastExportedFormat, .json)
        XCTAssertEqual(model.phase, .results)
        let data = await export.lastData
        XCTAssertTrue(String(decoding: data ?? Data(), as: UTF8.self).contains("\"schemaVersion\""))
    }

    func testSuccessfulExportExposesImmediateFormatSpecificResultsConfirmation() async throws {
        let scan = ScanCapture(result: try result(status: .ready))
        let model = AppModel(environment: environment(scan: scan, export: ExportCapture()))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await waitUntil { model.phase == .results }
        model.showExport()

        await model.export(.checksums, to: URL(fileURLWithPath: "/private/tmp/SHA256SUMS.txt"))

        XCTAssertEqual(model.phase, .results)
        XCTAssertEqual(model.lastExportedFormat, .checksums)
        XCTAssertEqual(model.exportConfirmationMessage, "Exported SHA-256 checksums.")
    }

    func testDefaultExportWriterNeverOverwritesExistingSourceAsset() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("AppModelSourceSafety-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("Main.wav")
        let original = Data("ORIGINAL SOURCE BYTES".utf8)
        try original.write(to: source)

        let scan = ScanCapture(result: try result(status: .ready))
        let model = AppModel(environment: AppModel.Environment(
            scan: { request in await scan.scan(request) },
            resolvePreset: { try PresetResolver().resolve($0) },
            isFolder: { $0 == root }
        ))
        XCTAssertTrue(model.selectFolder(root))
        model.startScan()
        await waitUntil { model.phase == .results }
        model.showExport()

        await model.export(.json, to: source)

        XCTAssertEqual(try Data(contentsOf: source), original)
        XCTAssertEqual(model.phase, .results)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertNil(model.lastExportedFormat)
    }

    private func environment(
        scan: any ScanServicing,
        export: ExportCapture = ExportCapture()
    ) -> AppModel.Environment {
        AppModel.Environment(
            scan: { request in await scan.scan(request) },
            resolvePreset: { try PresetResolver().resolve($0) },
            isFolder: { $0.lastPathComponent != "not-a-folder" },
            writeReport: export.write
        )
    }

    private func folderURL(name: String = "Delivery") -> URL {
        URL(fileURLWithPath: "/private/tmp/\(name)", isDirectory: true)
    }

    private func result(
        status: OverallStatus,
        findings: [Finding]? = nil
    ) throws -> ScanResult {
        let resolved = try PresetResolver().resolve(BuiltInPresets.generalAudio)
        let resolvedFindings: [Finding]
        if let findings {
            resolvedFindings = findings
        } else {
            switch status {
            case .ready, .incomplete: resolvedFindings = []
            case .needsReview: resolvedFindings = [finding(id: "test.warning", severity: .warning)]
            case .requirementsNotMet: resolvedFindings = [finding(id: "test.error", severity: .error)]
            }
        }
        return ScanResult(
            selectedFolderName: "Delivery",
            preset: resolved,
            applicationVersion: "0.1.0",
            engineVersion: "0.1.0",
            startedAt: Date(timeIntervalSince1970: 0),
            completedAt: status == .incomplete ? nil : Date(timeIntervalSince1970: 1),
            inventory: [],
            findings: resolvedFindings,
            overallStatus: status
        )
    }

    private func finding(
        id: String,
        severity: FindingSeverity,
        path: RelativePath? = nil,
        evidenceValue: String = "Value"
    ) -> Finding {
        Finding(
            ruleID: id,
            severity: severity,
            title: id.capitalized,
            explanation: "Measured technical evidence.",
            affectedPaths: path.map { [$0] } ?? [],
            evidence: [Evidence(label: "Measured", value: .string(evidenceValue))],
            expected: "Expected condition",
            suggestedAction: "Suggested action",
            origin: .engine,
            engineVersion: "0.1.0"
        )
    }

    private func waitUntil(
        timeoutNanoseconds: UInt64 = 2_000_000_000,
        condition: @escaping @MainActor () -> Bool
    ) async {
        let started = ContinuousClock.now
        while !condition(), ContinuousClock.now - started < .nanoseconds(Int64(timeoutNanoseconds)) {
            await Task.yield()
        }
        XCTAssertTrue(condition())
    }
}

private enum TestError: Error {
    case invalidPreset
    case exportFailed
}

private actor ScanCapture: ScanServicing {
    private let result: ScanResult?
    private(set) var callCount = 0

    init(result: ScanResult?) {
        self.result = result
    }

    func scan(_ request: ScanRequest) async -> ScanResult {
        callCount += 1
        return result ?? ScanResult(
            selectedFolderName: "Delivery",
            preset: request.preset,
            applicationVersion: request.applicationVersion,
            engineVersion: request.engineVersion,
            startedAt: Date(timeIntervalSince1970: 0),
            completedAt: Date(timeIntervalSince1970: 1),
            inventory: [],
            findings: [],
            overallStatus: .ready
        )
    }
}

private actor ControlledScan: ScanServicing {
    private let result: ScanResult
    private var called = false
    private var continuation: CheckedContinuation<Void, Never>?

    init(result: ScanResult) {
        self.result = result
    }

    func scan(_ request: ScanRequest) async -> ScanResult {
        called = true
        await withCheckedContinuation { continuation = $0 }
        return result
    }

    func waitUntilCalled() async {
        while !called { await Task.yield() }
    }

    func finish() {
        continuation?.resume()
        continuation = nil
    }
}

private actor CancellationScan: ScanServicing {
    private let preset: ResolvedPreset
    private var called = false

    init(preset: ResolvedPreset) {
        self.preset = preset
    }

    func scan(_ request: ScanRequest) async -> ScanResult {
        called = true
        do {
            try await Task.sleep(for: .seconds(30))
        } catch {}
        return ScanResult(
            selectedFolderName: "Delivery",
            preset: preset,
            applicationVersion: request.applicationVersion,
            engineVersion: request.engineVersion,
            startedAt: Date(timeIntervalSince1970: 0),
            inventory: [],
            findings: [Finding(
                ruleID: "scan.cancelled",
                severity: .information,
                title: "Scan cancelled",
                explanation: "The scan was cancelled.",
                affectedPaths: [],
                evidence: [],
                expected: "A complete scan.",
                suggestedAction: "Run again.",
                origin: .engine,
                engineVersion: request.engineVersion
            )],
            overallStatus: .incomplete
        )
    }

    func waitUntilCalled() async {
        while !called { await Task.yield() }
    }
}

private actor UncooperativeScan: ScanServicing {
    private var called = false
    private var continuation: CheckedContinuation<ScanResult, Never>?

    func scan(_ request: ScanRequest) async -> ScanResult {
        called = true
        return await withCheckedContinuation { continuation = $0 }
    }

    func waitUntilCalled() async {
        while !called { await Task.yield() }
    }

    func release(with result: ScanResult) {
        continuation?.resume(returning: result)
        continuation = nil
    }
}

private actor ExportCapture {
    private let error: Error?
    private(set) var callCount = 0
    private(set) var lastData: Data?

    init(error: Error? = nil) {
        self.error = error
    }

    func write(_ data: Data, _ destination: URL) async throws {
        callCount += 1
        lastData = data
        if let error { throw error }
    }
}
