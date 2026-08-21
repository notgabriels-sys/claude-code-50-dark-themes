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

    func testSelectedCanonicalRootIdentityIsPreservedInScanRequest() async throws {
        let scan = ScanCapture(result: nil)
        let model = AppModel(environment: environment(scan: scan))
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("AppModelRootIdentity-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        XCTAssertTrue(model.selectFolder(root))
        model.startScan()
        await waitUntil { model.phase == .results }

        let selectedRoot = await scan.selectedFolderURL
        XCTAssertEqual(selectedRoot?.path, root.path)
        XCTAssertTrue(selectedRoot?.path.hasPrefix("/private/tmp/") == true)
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

    func testDigitalReleaseCanSeedEditableCustomPresetIncludingArtworkExpectations() throws {
        let model = AppModel(
            environment: environment(scan: ScanCapture(result: nil)),
            initialPresetID: BuiltInPresets.digitalRelease.identifier
        )

        model.editSelectedPresetAsCustom()

        XCTAssertEqual(model.selectedPresetID, BuiltInPresets.custom.identifier)
        XCTAssertEqual(model.customPresetDraft.artworkEnabled, true)
        XCTAssertEqual(model.customPresetDraft.artworkMinimumWidth, "3000")
        XCTAssertEqual(model.customPresetDraft.artworkMinimumHeight, "3000")
        XCTAssertEqual(model.customPresetDraft.artworkRequiresSquare, true)
        XCTAssertEqual(model.customPresetDraft.artworkSeverity, .error)
        XCTAssertEqual(model.customPresetDraft.roles.map(\.identifier), [
            "main-master", "artwork", "metadata-or-credits",
        ])

        model.customPresetDraft.artworkMinimumWidth = "4096"
        model.customPresetDraft.artworkMinimumHeight = "4096"
        XCTAssertTrue(model.applyCustomPreset())
        XCTAssertEqual(model.selectedPresetDefinition?.artwork?.minimumWidth, 4096)
        XCTAssertEqual(model.selectedPresetDefinition?.artwork?.minimumHeight, 4096)
        XCTAssertTrue(model.resolvedRequirements.contains { $0.description.contains("4096 px") })
    }

    func testCustomPresetDraftFormatsLargeFiniteIntegralAudioBoundsWithoutIntConversion() throws {
        let largeBound = 1e100
        let preset = Preset(
            identifier: "large-audio-bound",
            name: "Large Audio Bound",
            audio: AudioRequirement(
                sampleRate: NumericConstraint(minimum: 48_000, maximum: largeBound),
                bitDepth: NumericConstraint(exactly: largeBound)
            )
        )
        _ = try PresetResolver().resolve(preset)

        let draft = CustomPresetDraft(preset: preset)

        XCTAssertEqual(draft.audioSampleRateMinimum, "48000")
        XCTAssertEqual(Double(draft.audioSampleRateMaximum), largeBound)
        XCTAssertEqual(Double(draft.audioBitDepthMinimum), largeBound)
        XCTAssertEqual(Double(draft.audioBitDepthMaximum), largeBound)
    }

    func testCustomRoleDraftFormatsLargeFiniteIntegralBoundsWithoutIntConversion() throws {
        let largeBound = 1e100
        let role = DeliveryRole(
            identifier: "large-role-bound",
            name: "Large Role Bound",
            pattern: ".*\\.wav$",
            required: true,
            category: .audio,
            channelCount: NumericConstraint(exactly: 2),
            sampleRate: NumericConstraint(exactly: largeBound),
            bitDepth: NumericConstraint(exactly: 24)
        )
        let preset = Preset(
            identifier: "large-role-bound",
            name: "Large Role Bound",
            roles: [role]
        )
        _ = try PresetResolver().resolve(preset)

        let draft = CustomRoleDraft(role)

        XCTAssertEqual(draft.channelCountMinimum, "2")
        XCTAssertEqual(draft.channelCountMaximum, "2")
        XCTAssertEqual(Double(draft.sampleRateMinimum), largeBound)
        XCTAssertEqual(Double(draft.sampleRateMaximum), largeBound)
        XCTAssertEqual(draft.bitDepthMinimum, "24")
        XCTAssertEqual(draft.bitDepthMaximum, "24")
    }

    func testCustomPresetDraftRoundTripsRolesFormatsNumericFilenameAndSeverities() throws {
        let model = AppModel(environment: environment(scan: ScanCapture(result: nil)))
        model.choosePreset(BuiltInPresets.custom.identifier)
        model.customPresetDraft.name = "Vinyl Delivery"
        model.customPresetDraft.audioAllowedExtensions = "wav, aiff"
        model.customPresetDraft.audioAllowedEncodings = "Linear PCM, FLAC"
        model.customPresetDraft.audioSampleRateMinimum = "44100"
        model.customPresetDraft.audioSampleRateMaximum = "96000"
        model.customPresetDraft.audioBitDepthMinimum = "24"
        model.customPresetDraft.audioBitDepthMaximum = "32"
        model.customPresetDraft.requireConsistentSampleRate = true
        model.customPresetDraft.requireConsistentBitDepth = true
        model.customPresetDraft.requireConsistentChannelCount = true
        model.customPresetDraft.audioSeverity = .error
        model.customPresetDraft.filenamePattern = "(?i)final\\d+"
        model.customPresetDraft.filenameSeverity = .warning
        model.customPresetDraft.serviceFileSeverity = .information
        model.customPresetDraft.symbolicLinkSeverity = .error
        model.customPresetDraft.exactDuplicateSeverity = .warning
        model.customPresetDraft.roles = [CustomRoleDraft(
            identifier: "premaster",
            name: "Stereo Premaster",
            pattern: "(?i).*\\.(wav|aiff)$",
            required: true,
            category: .audio,
            allowedExtensions: "wav, aiff",
            allowedEncodings: "Linear PCM",
            channelCountMinimum: "2",
            channelCountMaximum: "2",
            sampleRateMinimum: "48000",
            sampleRateMaximum: "96000",
            bitDepthMinimum: "24",
            bitDepthMaximum: "32",
            readabilitySeverity: .error,
            requirementSeverity: .error,
            ambiguitySeverity: .warning
        )]

        XCTAssertTrue(model.applyCustomPreset())

        let definition = try XCTUnwrap(model.selectedPresetDefinition)
        XCTAssertEqual(definition.identifier, "custom")
        XCTAssertEqual(definition.name, "Vinyl Delivery")
        XCTAssertEqual(definition.audio.allowedExtensions, ["wav", "aiff"])
        XCTAssertEqual(definition.audio.allowedEncodings, ["Linear PCM", "FLAC"])
        XCTAssertEqual(definition.audio.sampleRate, NumericConstraint(minimum: 44_100, maximum: 96_000))
        XCTAssertEqual(definition.audio.bitDepth, NumericConstraint(minimum: 24, maximum: 32))
        XCTAssertTrue(definition.audio.requireConsistentChannelCount)
        XCTAssertEqual(definition.filename.ambiguousVersionPattern, "(?i)final\\d+")
        XCTAssertEqual(definition.symbolicLinkSeverity, .error)
        let role = try XCTUnwrap(definition.roles.first)
        XCTAssertEqual(role.allowedExtensions, ["wav", "aiff"])
        XCTAssertEqual(role.allowedEncodings, ["Linear PCM"])
        XCTAssertEqual(role.channelCount, NumericConstraint(exactly: 2))
        XCTAssertEqual(role.sampleRate, NumericConstraint(minimum: 48_000, maximum: 96_000))
        XCTAssertEqual(role.bitDepth, NumericConstraint(minimum: 24, maximum: 32))
        XCTAssertEqual(role.readability, .error)
        XCTAssertEqual(role.severity, .error)
        XCTAssertEqual(role.ambiguitySeverity, .warning)
    }

    func testInvalidCustomPresetCannotBecomeScannable() {
        let model = AppModel(environment: environment(scan: ScanCapture(result: nil)))
        model.choosePreset(BuiltInPresets.custom.identifier)
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.customPresetDraft.filenamePattern = "["

        XCTAssertFalse(model.applyCustomPreset())
        XCTAssertFalse(model.canStartScan)
        XCTAssertEqual(
            model.errorMessage,
            "Custom preset error. Filename version pattern: The regular expression is invalid."
        )
        XCTAssertEqual(model.customPresetDraft.filenamePattern, "[")
    }

    func testCustomRoleDraftRejectsAudioOnlyFieldsForAnyCategory() {
        let draft = CustomRoleDraft(
            identifier: "main",
            name: "Main",
            pattern: ".*",
            category: nil,
            allowedEncodings: "Linear PCM",
            channelCountMinimum: "2"
        )

        XCTAssertThrowsError(try draft.makeRole()) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(
                    field: "roles.main.allowedEncodings",
                    reason: "Audio-only role constraints require the Audio category."
                )
            )
        }
    }

    func testCustomPresetValidationIdentifiesTypedFieldAndPreservesDraft() {
        struct Case {
            let configure: (AppModel) -> Void
            let expectedMessage: String
            let preservedValue: (AppModel) -> String
            let expectedValue: String
        }

        let cases = [
            Case(
                configure: { model in
                    model.customPresetDraft.audioSampleRateMinimum = "96000"
                    model.customPresetDraft.audioSampleRateMaximum = "44100"
                },
                expectedMessage: "Custom preset error. Audio sample rate: The minimum cannot exceed the maximum.",
                preservedValue: { $0.customPresetDraft.audioSampleRateMinimum },
                expectedValue: "96000"
            ),
            Case(
                configure: { model in
                    model.customPresetDraft.roles = [CustomRoleDraft(
                        identifier: "main",
                        name: "Main",
                        pattern: ".*",
                        category: .audio,
                        allowedExtensions: "wav,"
                    )]
                },
                expectedMessage: "Custom preset error. Role allowed extensions: Comma-separated values cannot be empty.",
                preservedValue: { $0.customPresetDraft.roles.first?.allowedExtensions ?? "" },
                expectedValue: "wav,"
            ),
            Case(
                configure: { model in
                    model.customPresetDraft.roles = [
                        CustomRoleDraft(identifier: "duplicate", name: "First", pattern: ".*", category: .document),
                        CustomRoleDraft(identifier: "duplicate", name: "Second", pattern: ".*", category: .document),
                    ]
                },
                expectedMessage: "Custom preset error. Delivery roles: Role identifiers must be unique: duplicate.",
                preservedValue: { $0.customPresetDraft.roles.map(\.identifier).joined(separator: ",") },
                expectedValue: "duplicate,duplicate"
            ),
        ]

        for testCase in cases {
            let model = AppModel(environment: environment(scan: ScanCapture(result: nil)))
            model.choosePreset(BuiltInPresets.custom.identifier)
            testCase.configure(model)

            XCTAssertFalse(model.applyCustomPreset())
            XCTAssertEqual(model.errorMessage, testCase.expectedMessage)
            XCTAssertEqual(testCase.preservedValue(model), testCase.expectedValue)
            XCTAssertFalse(model.canStartScan)
        }
    }

    func testChoosingAnotherPresetClearsCustomValidationSummary() {
        let model = AppModel(environment: environment(scan: ScanCapture(result: nil)))
        model.choosePreset(BuiltInPresets.custom.identifier)
        model.customPresetDraft.filenamePattern = "["
        XCTAssertFalse(model.applyCustomPreset())
        XCTAssertNotNil(model.customPresetValidationMessage)

        model.choosePreset(BuiltInPresets.generalAudio.identifier)

        XCTAssertNil(model.customPresetValidationMessage)
        XCTAssertNil(model.errorMessage)
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

    func testResultExposesAuditableRoleAssignmentsToNativeResults() async throws {
        let assignment = RoleAssignment(
            roleIdentifier: "main",
            roleName: "Main master",
            pattern: "main\\.wav$",
            matchedPath: try RelativePath("Masters/Main.wav"),
            category: .audio,
            acceptedEvidence: [Evidence(label: "encoding", value: .string("Linear PCM"))]
        )
        let scan = ScanCapture(result: try result(status: .ready, roleAssignments: [assignment]))
        let model = AppModel(environment: environment(scan: scan))
        XCTAssertTrue(model.selectFolder(folderURL()))

        model.startScan()
        await waitUntil { model.phase == .results }

        XCTAssertEqual(model.roleAssignments, [assignment])
        XCTAssertEqual(model.roleAssignments.first?.matchedPath.value, "Masters/Main.wav")
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

    func testReopeningExportClearsPriorSuccessConfirmation() async throws {
        let scan = ScanCapture(result: try result(status: .ready))
        let model = AppModel(environment: environment(scan: scan, export: ExportCapture()))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await waitUntil { model.phase == .results }
        model.showExport()

        await model.export(.html, to: URL(fileURLWithPath: "/private/tmp/report.html"))

        XCTAssertEqual(model.exportConfirmationMessage, "Exported Accessible HTML.")
        model.showExport()

        XCTAssertEqual(model.phase, .export)
        XCTAssertNil(model.lastExportedFormat)
        XCTAssertNil(model.exportConfirmationMessage)
    }

    func testFailedExportAfterSuccessPreservesResultErrorAndClearsConfirmation() async throws {
        let expected = try result(status: .ready)
        let scan = ScanCapture(result: expected)
        let export = SequencedExportCapture(outcomes: [nil, TestError.exportFailed])
        let model = AppModel(environment: AppModel.Environment(
            scan: { request in await scan.scan(request) },
            resolvePreset: { try PresetResolver().resolve($0) },
            isFolder: { $0.lastPathComponent != "not-a-folder" },
            writeReport: export.write
        ))
        XCTAssertTrue(model.selectFolder(folderURL()))
        model.startScan()
        await waitUntil { model.phase == .results }
        model.showExport()

        await model.export(.json, to: URL(fileURLWithPath: "/private/tmp/report.json"))

        XCTAssertEqual(model.exportConfirmationMessage, "Exported Versioned JSON.")
        model.showExport()
        await model.export(.checksums, to: URL(fileURLWithPath: "/private/tmp/SHA256SUMS.txt"))

        XCTAssertEqual(model.phase, .results)
        XCTAssertEqual(model.result, expected)
        XCTAssertEqual(model.errorMessage, "Report export failed. The scan result is unchanged.")
        XCTAssertNil(model.lastExportedFormat)
        XCTAssertNil(model.exportConfirmationMessage)
    }

    func testDefaultExportWriterNeverOverwritesExistingSourceAsset() async throws {
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
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

    func testDefaultExportWriterCreatesNewReportThroughCanonicalPrivateTmpAncestors() async throws {
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("AppModelExportSuccess-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let destination = root.appendingPathComponent("report.json")
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

        await model.export(.json, to: destination)

        XCTAssertEqual(model.lastExportedFormat, .json)
        XCTAssertNil(model.errorMessage)
        XCTAssertTrue(FileManager.default.fileExists(atPath: destination.path))
        XCTAssertTrue(String(decoding: try Data(contentsOf: destination), as: UTF8.self).contains("\"schemaVersion\""))
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
        findings: [Finding]? = nil,
        roleAssignments: [RoleAssignment] = []
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
            roleAssignments: roleAssignments,
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
    private(set) var selectedFolderURL: URL?

    init(result: ScanResult?) {
        self.result = result
    }

    func scan(_ request: ScanRequest) async -> ScanResult {
        callCount += 1
        selectedFolderURL = request.selectedFolderURL
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

private actor SequencedExportCapture {
    private var outcomes: [Error?]

    init(outcomes: [Error?]) {
        self.outcomes = outcomes
    }

    func write(_ data: Data, _ destination: URL) async throws {
        guard !outcomes.isEmpty else { return }
        if let error = outcomes.removeFirst() {
            throw error
        }
    }
}
