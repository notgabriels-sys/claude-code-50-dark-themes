import Foundation
import XCTest
@testable import PreflightCore

final class ScanServiceTests: XCTestCase {
    func testOrchestratesStablePhasesAndContinuesAfterOneInspectorFails() async throws {
        let recorder = ScanPhaseRecorder()
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let audio = try entry("Masters/Main Master.wav", category: .audio)
        let artwork = try entry("Artwork/Cover.png", category: .artwork)
        let credits = try entry("credits.md", category: .document)
        let sourceFingerprint = ScanFingerprintSpy(recorder: recorder)
        let service = ScanService(
            inventory: ScanInventorySpy(entries: [audio, artwork, credits], recorder: recorder),
            checksums: ScanChecksumSpy(recorder: recorder),
            audioInspector: ScanAudioInspectorSpy(recorder: recorder, failurePaths: [audio.relativePath]),
            imageInspector: ScanImageInspectorSpy(recorder: recorder),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset, recorder: recorder),
            ruleEngine: ScanRuleEngineSpy(recorder: recorder),
            fingerprinting: sourceFingerprint,
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset))

        XCTAssertEqual(
            recorder.events,
            [
                "resolve",
                "inventory",
                "fingerprint.before",
                "audio:Masters/Main Master.wav",
                "image:Artwork/Cover.png",
                "checksum",
                "rules",
                "inventory",
                "fingerprint.after",
            ]
        )
        XCTAssertEqual(result.overallStatus, .needsReview)
        XCTAssertEqual(result.inventory.first { $0.relativePath == audio.relativePath }?.inspectionStatus, .failed)
        XCTAssertEqual(result.inventory.first { $0.relativePath == artwork.relativePath }?.inspectionStatus, .succeeded)
        XCTAssertEqual(result.inventory.first { $0.relativePath == credits.relativePath }?.inspectionStatus, .notInspected)
        XCTAssertEqual(result.inventory.filter { $0.sha256 != nil }.count, 3)
        XCTAssertTrue(result.findings.contains { $0.ruleID == "test.audio-failed" })
        XCTAssertTrue(result.findings.allSatisfy { !$0.affectedPaths.contains { $0.value.hasPrefix("/") } })
    }

    func testCancellationAfterInventoryYieldReturnsIncompleteWithCancelledFinding() async throws {
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let inventory = CancellableInventorySpy(entries: [try entry("Masters/Main Master.wav", category: .audio)])
        let service = ScanService(
            inventory: inventory,
            checksums: ScanChecksumSpy(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: ScanFingerprintSpy(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let scanRequest = request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset)
        let task = Task { await service.scan(scanRequest) }
        await inventory.waitUntilEntered()
        task.cancel()
        await inventory.allowReturn()
        let result = await task.value

        XCTAssertEqual(result.overallStatus, .incomplete)
        XCTAssertTrue(result.findings.contains { $0.ruleID == "scan.cancelled" })
        XCTAssertNotEqual(result.overallStatus, .ready)
        XCTAssertNil(result.completedAt)
    }

    func testInvalidPresetAndRootFailuresBecomeTypedIncompleteFindings() async throws {
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let invalidPresetService = ScanService(
            inventory: ScanInventorySpy(entries: []),
            checksums: ScanChecksumSpy(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ThrowingPresetResolver(),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: ScanFingerprintSpy(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )
        let invalidRootService = ScanService(
            inventory: ThrowingInventorySpy(),
            checksums: ScanChecksumSpy(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: ScanFingerprintSpy(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let invalidPreset = await invalidPresetService.scan(request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset))
        let invalidRoot = await invalidRootService.scan(request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset))

        XCTAssertEqual(invalidPreset.overallStatus, .incomplete)
        XCTAssertEqual(invalidPreset.findings.map(\.ruleID), ["preset.resolution-failed"])
        XCTAssertTrue(invalidPreset.findings[0].affectedPaths.isEmpty)
        XCTAssertEqual(invalidRoot.overallStatus, .incomplete)
        XCTAssertEqual(invalidRoot.findings.map(\.ruleID), ["filesystem.root-access-failed"])
        XCTAssertTrue(invalidRoot.findings[0].affectedPaths.isEmpty)
    }

    func testInventoryBudgetFailureReturnsExactVisibleIncompleteFinding() async throws {
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let service = ScanService(
            inventory: InventoryLimitThrowingSpy(resource: .totalEntries, limit: 50_000),
            checksums: ScanChecksumSpy(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: ScanFingerprintSpy(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(
            request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset)
        )

        XCTAssertEqual(result.overallStatus, .incomplete)
        XCTAssertEqual(result.findings.map(\.ruleID), ["filesystem.inventory-limit.total-entries"])
        XCTAssertEqual(result.findings.first?.severity, .error)
        XCTAssertEqual(result.findings.first?.title, "Inventory total-entry budget exceeded")
        XCTAssertEqual(result.findings.first?.evidence, [
            Evidence(label: "resource", value: .string("totalEntries")),
            Evidence(label: "limit", value: .integer(50_000)),
        ])
        XCTAssertTrue(result.inventory.isEmpty)
        XCTAssertNil(result.completedAt)
        XCTAssertNotEqual(result.overallStatus, .ready)
    }

    func testEveryInventoryBudgetMapsToItsSpecificVisibleFinding() async throws {
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let cases: [(InventoryLimitResource, Int, String)] = [
            (.totalEntries, 50_000, "filesystem.inventory-limit.total-entries"),
            (.depth, 32, "filesystem.inventory-limit.depth"),
            (.namesPerDirectory, 20_000, "filesystem.inventory-limit.names-per-directory"),
            (.relativePathBytes, 4_096, "filesystem.inventory-limit.relative-path-bytes"),
            (
                .aggregateRelativePathBytes,
                16 * 1_024 * 1_024,
                "filesystem.inventory-limit.aggregate-relative-path-bytes"
            ),
        ]

        for (resource, limit, expectedRuleID) in cases {
            let service = ScanService(
                inventory: InventoryLimitThrowingSpy(resource: resource, limit: limit),
                checksums: ScanChecksumSpy(),
                audioInspector: ScanAudioInspectorSpy(),
                imageInspector: ScanImageInspectorSpy(),
                presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
                ruleEngine: ScanRuleEngineSpy(),
                fingerprinting: ScanFingerprintSpy(),
                now: { Date(timeIntervalSince1970: 1_000) }
            )

            let result = await service.scan(
                request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset)
            )

            XCTAssertEqual(result.overallStatus, .incomplete, resource.rawValue)
            XCTAssertEqual(result.findings.map(\.ruleID), [expectedRuleID], resource.rawValue)
            XCTAssertEqual(result.findings.first?.evidence, [
                Evidence(label: "resource", value: .string(resource.rawValue)),
                Evidence(label: "limit", value: .integer(limit)),
            ])
        }
    }

    func testBudgetExceededDuringPostInventoryKeepsSpecificIncompleteFinding() async throws {
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let service = ScanService(
            inventory: PostInventoryLimitThrowingSpy(resource: .depth, limit: 32),
            checksums: ScanChecksumSpy(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: ScanFingerprintSpy(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(
            request(root: URL(fileURLWithPath: "/tmp/Delivery", isDirectory: true), preset: preset)
        )

        XCTAssertEqual(result.overallStatus, .incomplete)
        XCTAssertEqual(result.findings.map(\.ruleID), ["filesystem.inventory-limit.depth"])
        XCTAssertEqual(result.findings.first?.evidence, [
            Evidence(label: "resource", value: .string("depth")),
            Evidence(label: "limit", value: .integer(32)),
        ])
        XCTAssertTrue(result.inventory.isEmpty)
    }

    func testSameLengthSourceMutationWithRestoredMtimeProducesErrorAndCannotBeReady() async throws {
        let fixture = try ScanMutationFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let master = try entry("Masters/Main Master.wav", category: .audio)
        let service = ScanService(
            inventory: ScanInventorySpy(entries: [master]),
            checksums: ScanChecksumSpy(),
            audioInspector: SameLengthMtimeRestoringAudioInspector(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        let finding = try XCTUnwrap(result.findings.first { $0.ruleID == "filesystem.source-changed-during-scan" })
        XCTAssertEqual(finding.severity, .error)
        XCTAssertEqual(result.overallStatus, .requirementsNotMet)
        XCTAssertNotEqual(result.overallStatus, .ready)
    }

    func testFileAddedDuringScanProducesErrorWithoutEvaluatingTheNewFile() async throws {
        let fixture = try ScanPackageFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(BuiltInPresets.generalAudio)
        let service = ScanService(
            inventory: FileInventory(),
            checksums: ChecksumService(),
            audioInspector: ScanAddingAudioInspector(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: PresetResolver(),
            ruleEngine: RuleEngine(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        XCTAssertTrue(result.findings.contains { $0.ruleID == "filesystem.source-changed-during-scan" && $0.severity == .error })
        XCTAssertNotEqual(result.overallStatus, .ready)
        XCTAssertFalse(result.inventory.contains { $0.relativePath.value == "Added/during-scan.txt" })
    }

    func testRootRemovedAfterInventoryReturnsTypedIncompleteResultWithoutPaths() async throws {
        let fixture = try ScanMutationFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let service = ScanService(
            inventory: RootRemovingInventory(),
            checksums: ScanChecksumSpy(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        XCTAssertEqual(result.overallStatus, .incomplete)
        XCTAssertEqual(result.findings.map(\.ruleID), ["filesystem.root-access-failed"])
        XCTAssertTrue(result.findings[0].affectedPaths.isEmpty)
        XCTAssertFalse(result.findings[0].explanation.contains(fixture.root.path))
    }

    func testRootRemovedImmediatelyBeforeSecondInventoryReturnsTypedIncompleteResult() async throws {
        let fixture = try ScanMutationFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let service = ScanService(
            inventory: SecondInventoryRootRemoving(),
            checksums: ChecksumService(),
            audioInspector: ScanAudioInspectorSpy(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        XCTAssertEqual(result.overallStatus, .incomplete)
        XCTAssertEqual(result.findings.map(\.ruleID), ["filesystem.root-access-failed"])
        XCTAssertTrue(result.findings[0].affectedPaths.isEmpty)
        XCTAssertFalse(result.findings[0].explanation.contains(fixture.root.path))
    }

    func testPartialPostInventoryEnumerationFailureReturnsTypedIncompleteResult() async throws {
        let fixture = try ScanPackageFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        let service = ScanService(
            inventory: PartialPostInventoryWithEnumerationFailure(),
            checksums: ChecksumService(),
            audioInspector: AudioInspector(),
            imageInspector: ImageInspector(),
            presetResolver: PresetResolver(),
            ruleEngine: RuleEngine(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        XCTAssertNoThrow(try FileManager.default.destinationOfSymbolicLink(atPath: fixture.root.appendingPathComponent("Masters/.post-scan-hidden-link").path))
        XCTAssertEqual(result.overallStatus, .incomplete)
        XCTAssertEqual(result.findings.map(\.ruleID), ["filesystem.root-access-failed"])
        let rootFinding = result.findings.first { $0.ruleID == "filesystem.root-access-failed" }
        XCTAssertTrue(rootFinding?.affectedPaths.isEmpty ?? false)
        XCTAssertFalse(rootFinding?.explanation.contains(fixture.root.path) ?? true)
        XCTAssertFalse(result.findings.contains { $0.explanation.contains("/dev/null") })
        XCTAssertNotEqual(result.overallStatus, .ready)
    }

    func testPartialPostInventoryInvalidRelativePathReturnsTypedIncompleteResult() async throws {
        try await assertPartialPostInventoryFindingIsIncomplete(
            ruleID: "filesystem.invalid-relative-path"
        )
    }

    func testPartialPostInventoryMetadataUnreadableReturnsTypedIncompleteResult() async throws {
        try await assertPartialPostInventoryFindingIsIncomplete(
            ruleID: "filesystem.metadata-unreadable"
        )
    }

    func testPublicSourceFingerprintInitializerUsesCanonicalOrdering() throws {
        let master = try entry("Masters/Main Master.wav", category: .audio)
        let artwork = try entry("Artwork/Cover.png", category: .artwork)

        let first = SourceFingerprint(entries: [master, artwork])
        let reordered = SourceFingerprint(entries: [artwork, master])

        XCTAssertEqual(first.files.map(\.relativePath.value), ["Artwork/Cover.png", "Masters/Main Master.wav"])
        XCTAssertEqual(first.inventoryWitness.map(\.relativePath.value), ["Artwork/Cover.png", "Masters/Main Master.wav"])
        XCTAssertTrue(first.matches(reordered))
    }

    func testSymlinkAddedDuringScanProducesSourceChangedWithoutFollowingTarget() async throws {
        let fixture = try ScanPackageFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(BuiltInPresets.generalAudio)
        let service = ScanService(
            inventory: FileInventory(),
            checksums: ChecksumService(),
            audioInspector: ScanAddingSymlinkAudioInspector(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: PresetResolver(),
            ruleEngine: RuleEngine(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        XCTAssertNoThrow(try FileManager.default.destinationOfSymbolicLink(atPath: fixture.root.appendingPathComponent("Added/during-scan-link").path))
        let liveInventory = try await FileInventory().inventory(root: fixture.root)
        XCTAssertEqual(liveInventory.entries.first { $0.relativePath.value == "Added/during-scan-link" }?.kind, .symbolicLink)
        XCTAssertTrue(result.findings.contains { $0.ruleID == "filesystem.source-changed-during-scan" && $0.severity == .error })
        XCTAssertNotEqual(result.overallStatus, .ready)
        XCTAssertFalse(result.inventory.contains { $0.relativePath.value == "Added/during-scan-link" })
    }

    func testRegularFileReplacedBySymlinkDuringScanProducesSourceChangedWithoutFollowingTarget() async throws {
        let fixture = try ScanMutationFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let service = ScanService(
            inventory: FileInventory(),
            checksums: ChecksumService(),
            audioInspector: ScanReplacingRegularWithSymlinkAudioInspector(),
            imageInspector: ScanImageInspectorSpy(),
            presetResolver: ScanPresetResolverSpy(resolvedPreset: preset),
            ruleEngine: ScanRuleEngineSpy(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))

        XCTAssertNoThrow(try FileManager.default.destinationOfSymbolicLink(atPath: fixture.root.appendingPathComponent("Masters/Main Master.wav").path))
        XCTAssertTrue(result.findings.contains { $0.ruleID == "filesystem.source-changed-during-scan" && $0.severity == .error })
        XCTAssertNotEqual(result.overallStatus, .ready)
        XCTAssertFalse(result.findings.contains { $0.explanation.contains("/dev/null") })
    }

    func testFailedInspectionSurvivesSuccessfulProductionChecksum() async throws {
        let fixture = try ScanMutationFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(BuiltInPresets.generalAudio)

        let result = await ScanService().scan(request(root: fixture.root, preset: preset))

        let entry = try XCTUnwrap(result.inventory.first { $0.relativePath.value == "Masters/Main Master.wav" })
        XCTAssertEqual(entry.inspectionStatus, .failed)
        XCTAssertNotNil(entry.sha256)
        XCTAssertTrue(result.findings.contains { $0.ruleID == "inspection.audio-unreadable" })
        XCTAssertEqual(result.overallStatus, .requirementsNotMet)
    }

    func testProductionScanRejectsAACContentRenamedAsMainMasterWAVWithMismatchEvidence() async throws {
        let fixture = try ScanPackageFixture.make()
        defer { fixture.remove() }
        let mediaURL = try FixtureFactory.aacM4A(sampleRate: 44_100, channels: 1, frameCount: 4_410)
        defer { try? FileManager.default.removeItem(at: mediaURL) }
        try Data(contentsOf: mediaURL).write(
            to: fixture.root.appendingPathComponent("Masters/Main Master.wav")
        )
        let before = try fixture.snapshots()
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)

        let result = await ScanService().scan(request(root: fixture.root, preset: preset))
        let after = try fixture.snapshots()

        let masterPath = try RelativePath("Masters/Main Master.wav")
        let master = try XCTUnwrap(result.inventory.first { $0.relativePath == masterPath })
        XCTAssertEqual(master.audioProperties?.container, "M4A")
        XCTAssertEqual(master.audioProperties?.encoding, "AAC")
        let mismatch = try XCTUnwrap(result.findings.first { $0.ruleID == "audio.filename-content-mismatch" })
        XCTAssertEqual(mismatch.affectedPaths, [masterPath])
        XCTAssertEqual(mismatch.evidence, [
            Evidence(label: "extension", value: .string("wav")),
            Evidence(label: "container", value: .string("M4A")),
        ])
        let lossy = try XCTUnwrap(result.findings.first { $0.ruleID == "role.disallowed-encoding.main-master" })
        XCTAssertEqual(lossy.affectedPaths, [masterPath])
        XCTAssertTrue(lossy.evidence.contains(Evidence(label: "encoding", value: .string("AAC"))))
        XCTAssertFalse(result.findings.contains { $0.ruleID == "inspection.audio-unreadable" })
        XCTAssertEqual(result.overallStatus, .requirementsNotMet)
        XCTAssertEqual(after, before)
    }

    func testProductionServiceReadiesDigitalReleaseWithoutChangingSourceFiles() async throws {
        let fixture = try ScanPackageFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        let before = try fixture.snapshots()

        let result = await ScanService().scan(request(root: fixture.root, preset: preset))
        let after = try fixture.snapshots()

        let regularSourceFiles = result.inventory.filter { $0.kind == .regular }

        XCTAssertEqual(result.overallStatus, .ready)
        XCTAssertEqual(regularSourceFiles.map(\.relativePath.value), ["Artwork/Cover.png", "Credits/credits.md", "Masters/Main Master.wav"])
        XCTAssertTrue(result.inventory.allSatisfy { $0.relativePath.value.hasPrefix("/") == false })
        XCTAssertTrue(regularSourceFiles.allSatisfy { $0.sha256 != nil })
        XCTAssertFalse(result.findings.contains { $0.ruleID.hasPrefix("role.missing") || $0.ruleID.hasPrefix("role.ambiguous") })
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(result)) as? [String: Any])
        let assignments = try XCTUnwrap(encoded["roleAssignments"] as? [[String: Any]])
        XCTAssertEqual(assignments.compactMap { $0["roleIdentifier"] as? String }, [
            "main-master", "artwork", "metadata-or-credits",
        ])
        XCTAssertEqual(assignments.compactMap { $0["matchedPath"] as? String }, [
            "Masters/Main Master.wav", "Artwork/Cover.png", "Credits/credits.md",
        ])
        XCTAssertEqual(assignments.compactMap { $0["pattern"] as? String }, preset.definition.roles.map(\.pattern))
        XCTAssertEqual(assignments.compactMap { $0["schemaVersion"] as? String }, ["1.0", "1.0", "1.0"])
        XCTAssertEqual(after, before)
    }

    private func request(root: URL, preset: ResolvedPreset) -> ScanRequest {
        ScanRequest(
            selectedFolderURL: root,
            preset: preset,
            applicationVersion: "test-app",
            engineVersion: "test-engine"
        )
    }

    private func entry(_ path: String, category: FileCategory) throws -> InventoryEntry {
        let relativePath = try RelativePath(path)
        return InventoryEntry(
            relativePath: relativePath,
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: URL(fileURLWithPath: path).pathExtension.lowercased(),
            category: category,
            byteSize: 1,
            modificationDate: Date(timeIntervalSince1970: 1),
            kind: .regular
        )
    }

    private func assertPartialPostInventoryFindingIsIncomplete(
        ruleID: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async throws {
        let fixture = try ScanPackageFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        let service = ScanService(
            inventory: PartialPostInventoryWithFinding(ruleID: ruleID),
            checksums: ChecksumService(),
            audioInspector: AudioInspector(),
            imageInspector: ImageInspector(),
            presetResolver: PresetResolver(),
            ruleEngine: RuleEngine(),
            fingerprinting: SourceFingerprint(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )

        let result = await service.scan(request(root: fixture.root, preset: preset))
        let omittedDescendant = fixture.root.appendingPathComponent(
            "Masters/.post-scan-omitted/descendant-link"
        )
        let findingText = result.findings.flatMap {
            [$0.title, $0.explanation, $0.expected, $0.suggestedAction]
        }.joined(separator: " ")

        XCTAssertEqual(
            try FileManager.default.destinationOfSymbolicLink(atPath: omittedDescendant.path),
            "/dev/null",
            file: file,
            line: line
        )
        XCTAssertEqual(result.overallStatus, .incomplete, file: file, line: line)
        XCTAssertEqual(result.findings.map(\.ruleID), ["filesystem.root-access-failed"], file: file, line: line)
        XCTAssertTrue(result.inventory.isEmpty, file: file, line: line)
        XCTAssertTrue(result.findings.allSatisfy { $0.affectedPaths.isEmpty }, file: file, line: line)
        XCTAssertTrue(result.findings.allSatisfy { $0.evidence.isEmpty }, file: file, line: line)
        XCTAssertFalse(findingText.contains(fixture.root.path), file: file, line: line)
        XCTAssertFalse(findingText.contains("/dev/null"), file: file, line: line)
        XCTAssertFalse(findingText.contains(".post-scan-omitted"), file: file, line: line)
        XCTAssertNotEqual(result.overallStatus, .ready, file: file, line: line)
    }
}

private final class ScanPhaseRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var storedEvents: [String] = []

    var events: [String] {
        lock.lock()
        defer { lock.unlock() }
        return storedEvents
    }

    func record(_ event: String) {
        lock.lock()
        storedEvents.append(event)
        lock.unlock()
    }
}

private struct ScanInventorySpy: FileInventorying {
    let entries: [InventoryEntry]
    let recorder: ScanPhaseRecorder?

    init(entries: [InventoryEntry], recorder: ScanPhaseRecorder? = nil) {
        self.entries = entries
        self.recorder = recorder
    }

    func inventory(root: URL) async throws -> InventorySnapshot {
        recorder?.record("inventory")
        return InventorySnapshot(entries: entries, findings: [])
    }
}

private struct ThrowingInventorySpy: FileInventorying {
    func inventory(root: URL) async throws -> InventorySnapshot {
        throw PreflightError.invalidScanRequest(reason: "Root is unavailable.")
    }
}

private struct InventoryLimitThrowingSpy: FileInventorying {
    let resource: InventoryLimitResource
    let limit: Int

    func inventory(root: URL) async throws -> InventorySnapshot {
        throw PreflightError.inventoryLimitExceeded(resource: resource, limit: limit)
    }
}

private actor PostInventoryLimitThrowingSpy: FileInventorying {
    let resource: InventoryLimitResource
    let limit: Int
    private var callCount = 0

    init(resource: InventoryLimitResource, limit: Int) {
        self.resource = resource
        self.limit = limit
    }

    func inventory(root: URL) async throws -> InventorySnapshot {
        callCount += 1
        if callCount == 2 {
            throw PreflightError.inventoryLimitExceeded(resource: resource, limit: limit)
        }
        return InventorySnapshot(entries: [], findings: [])
    }
}

private struct RootRemovingInventory: FileInventorying {
    func inventory(root: URL) async throws -> InventorySnapshot {
        let snapshot = try await FileInventory().inventory(root: root)
        try FileManager.default.removeItem(at: root)
        return snapshot
    }
}

private actor SecondInventoryRootRemoving: FileInventorying {
    private var callCount = 0

    func inventory(root: URL) async throws -> InventorySnapshot {
        callCount += 1
        let call = callCount
        if call == 2 {
            try FileManager.default.removeItem(at: root)
        }
        return try await FileInventory().inventory(root: root)
    }
}

private actor PartialPostInventoryWithEnumerationFailure: FileInventorying {
    private var firstSnapshot: InventorySnapshot?

    func inventory(root: URL) async throws -> InventorySnapshot {
        if let firstSnapshot {
            let hiddenLink = root.appendingPathComponent("Masters/.post-scan-hidden-link")
            try FileManager.default.createSymbolicLink(
                at: hiddenLink,
                withDestinationURL: URL(fileURLWithPath: "/dev/null")
            )
            return InventorySnapshot(
                entries: firstSnapshot.entries,
                findings: [Finding(
                    ruleID: "filesystem.enumeration-failed",
                    severity: .warning,
                    title: "Directory entry could not be enumerated",
                    explanation: "The directory entry could not be enumerated safely.",
                    affectedPaths: [try RelativePath("Masters")],
                    evidence: [],
                    expected: "A bounded inventory of the selected root.",
                    suggestedAction: "Review the affected filesystem entry.",
                    origin: .engine,
                    engineVersion: "test-engine"
                )]
            )
        }

        let snapshot = try await FileInventory().inventory(root: root)
        firstSnapshot = snapshot
        return snapshot
    }
}

private actor PartialPostInventoryWithFinding: FileInventorying {
    let ruleID: String
    private var firstSnapshot: InventorySnapshot?

    init(ruleID: String) {
        self.ruleID = ruleID
    }

    func inventory(root: URL) async throws -> InventorySnapshot {
        if let firstSnapshot {
            let omittedDescendant = root.appendingPathComponent(
                "Masters/.post-scan-omitted/descendant-link"
            )
            try FileManager.default.createDirectory(
                at: omittedDescendant.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.createSymbolicLink(
                at: omittedDescendant,
                withDestinationURL: URL(fileURLWithPath: "/dev/null")
            )
            return InventorySnapshot(
                entries: firstSnapshot.entries,
                findings: [Finding(
                    ruleID: ruleID,
                    severity: .warning,
                    title: "Post inventory is incomplete",
                    explanation: "The entry at \(root.path) could expose /dev/null.",
                    affectedPaths: [],
                    evidence: [],
                    expected: "A complete bounded inventory of the selected root.",
                    suggestedAction: "Review the omitted .post-scan-omitted subtree.",
                    origin: .engine,
                    engineVersion: "test-engine"
                )]
            )
        }

        let snapshot = try await FileInventory().inventory(root: root)
        firstSnapshot = snapshot
        return snapshot
    }
}

private actor CancellableInventorySpy: FileInventorying {
    private let entries: [InventoryEntry]
    private var didEnter = false
    private var entryWaiter: CheckedContinuation<Void, Never>?
    private var returnWaiter: CheckedContinuation<Void, Never>?
    private var mayReturn = false

    init(entries: [InventoryEntry]) {
        self.entries = entries
    }

    func inventory(root: URL) async throws -> InventorySnapshot {
        didEnter = true
        entryWaiter?.resume()
        entryWaiter = nil
        if !mayReturn {
            await withCheckedContinuation { returnWaiter = $0 }
        }
        return InventorySnapshot(entries: entries, findings: [])
    }

    func waitUntilEntered() async {
        guard !didEnter else { return }
        await withCheckedContinuation { entryWaiter = $0 }
    }

    func allowReturn() {
        mayReturn = true
        returnWaiter?.resume()
        returnWaiter = nil
    }
}

private struct ScanChecksumSpy: InventoryChecksumming {
    let recorder: ScanPhaseRecorder?

    init(recorder: ScanPhaseRecorder? = nil) {
        self.recorder = recorder
    }

    func sha256(for fileURL: URL) async throws -> String { "unused" }

    func checksummedInventory(entries: [InventoryEntry], root: URL) async -> InventorySnapshot {
        recorder?.record("checksum")
        return InventorySnapshot(
            entries: entries.map { entry in
                InventoryEntry(
                    relativePath: entry.relativePath,
                    normalizedFilename: entry.normalizedFilename,
                    normalizedExtension: entry.normalizedExtension,
                    category: entry.category,
                    byteSize: entry.byteSize,
                    modificationDate: entry.modificationDate,
                    kind: entry.kind,
                    sha256: "digest-\(entry.relativePath.value)",
                    inspectionStatus: entry.inspectionStatus,
                    audioProperties: entry.audioProperties,
                    imageProperties: entry.imageProperties,
                    evidence: entry.evidence
                )
            },
            findings: []
        )
    }
}

private struct ScanAudioInspectorSpy: AudioInspecting {
    let recorder: ScanPhaseRecorder?
    let failurePaths: Set<RelativePath>

    init(recorder: ScanPhaseRecorder? = nil, failurePaths: Set<RelativePath> = []) {
        self.recorder = recorder
        self.failurePaths = failurePaths
    }

    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        recorder?.record("audio:\(source.relativePath.value)")
        if failurePaths.contains(source.relativePath) {
            return InspectionOutcome(status: .failed, value: AudioProperties(isReadable: false), findings: [])
        }
        return InspectionOutcome(status: .succeeded, value: AudioProperties(isReadable: true), findings: [])
    }
}

private struct ScanImageInspectorSpy: ImageInspecting {
    let recorder: ScanPhaseRecorder?

    init(recorder: ScanPhaseRecorder? = nil) {
        self.recorder = recorder
    }

    func inspect(source: TrustedMediaSource) -> InspectionOutcome<ImageProperties> {
        recorder?.record("image:\(source.relativePath.value)")
        return InspectionOutcome(status: .succeeded, value: ImageProperties(isReadable: true), findings: [])
    }
}

private struct SameLengthMtimeRestoringAudioInspector: AudioInspecting {
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        let url = source.root.appendingPathComponent(source.relativePath.value)
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let modificationDate = attributes[.modificationDate] as? Date
        else {
            return InspectionOutcome(status: .failed, value: AudioProperties(isReadable: false), findings: [])
        }
        try? Data("changed--source-bytes".utf8).write(to: url)
        try? FileManager.default.setAttributes([.modificationDate: modificationDate], ofItemAtPath: url.path)
        return InspectionOutcome(status: .succeeded, value: AudioProperties(isReadable: true), findings: [])
    }
}

private struct ScanAddingAudioInspector: AudioInspecting {
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        let added = source.root.appendingPathComponent("Added/during-scan.txt")
        try? FileManager.default.createDirectory(at: added.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? Data("added during scan".utf8).write(to: added)
        return InspectionOutcome(status: .succeeded, value: AudioProperties(isReadable: true), findings: [])
    }
}

private struct ScanAddingSymlinkAudioInspector: AudioInspecting {
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        let link = source.root.appendingPathComponent("Added/during-scan-link")
        try? FileManager.default.createDirectory(at: link.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? FileManager.default.createSymbolicLink(
            at: link,
            withDestinationURL: source.root.appendingPathComponent("Masters/Main Master.wav")
        )
        return InspectionOutcome(status: .succeeded, value: AudioProperties(isReadable: true), findings: [])
    }
}

private struct ScanReplacingRegularWithSymlinkAudioInspector: AudioInspecting {
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        let url = source.root.appendingPathComponent(source.relativePath.value)
        try? FileManager.default.removeItem(at: url)
        try? FileManager.default.createSymbolicLink(at: url, withDestinationURL: URL(fileURLWithPath: "/dev/null"))
        return InspectionOutcome(status: .succeeded, value: AudioProperties(isReadable: true), findings: [])
    }
}

private struct ScanPresetResolverSpy: PresetResolving {
    let resolvedPreset: ResolvedPreset
    let recorder: ScanPhaseRecorder?

    init(resolvedPreset: ResolvedPreset, recorder: ScanPhaseRecorder? = nil) {
        self.resolvedPreset = resolvedPreset
        self.recorder = recorder
    }

    func resolve(_ preset: Preset) throws -> ResolvedPreset {
        recorder?.record("resolve")
        return resolvedPreset
    }
}

private struct ThrowingPresetResolver: PresetResolving {
    func resolve(_ preset: Preset) throws -> ResolvedPreset {
        throw PreflightError.invalidPreset(field: "roles", reason: "The preset cannot be resolved.")
    }
}

private struct ScanRuleEngineSpy: RuleEvaluating {
    let recorder: ScanPhaseRecorder?

    init(recorder: ScanPhaseRecorder? = nil) {
        self.recorder = recorder
    }

    func evaluate(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [Finding] {
        recorder?.record("rules")
        return snapshot.entries.compactMap { entry in
            guard entry.inspectionStatus == .failed else { return nil }
            return Finding(
                ruleID: "test.audio-failed",
                severity: .warning,
                title: "Audio inspection failed",
                explanation: "The affected file was not readable.",
                affectedPaths: [entry.relativePath],
                evidence: [],
                expected: "A readable audio file.",
                suggestedAction: "Replace the file.",
                origin: .engine,
                engineVersion: engineVersion
            )
        }
    }
}

private final class ScanFingerprintSpy: @unchecked Sendable, SourceFingerprinting {
    private let recorder: ScanPhaseRecorder?
    private let lock = NSLock()
    private var callCount = 0

    init(recorder: ScanPhaseRecorder? = nil) {
        self.recorder = recorder
    }

    func fingerprint(root: URL, entries: [InventoryEntry]) throws -> SourceFingerprint {
        lock.lock()
        callCount += 1
        let ordinal = callCount
        lock.unlock()
        recorder?.record(ordinal == 1 ? "fingerprint.before" : "fingerprint.after")
        return SourceFingerprint()
    }
}

private final class ScanPackageFixture {
    struct Snapshot: Equatable {
        let data: Data
        let attributes: [FileAttributeKey: AnyHashable]
    }

    let root: URL

    private init(root: URL) {
        self.root = root
    }

    static func make() throws -> ScanPackageFixture {
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("ScanServiceTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let fixture = ScanPackageFixture(root: root)
        try fixture.write(FixtureFactory.wavData(channels: 2, sampleRate: 48_000, bitDepth: 24, frameCount: 48_000), to: "Masters/Main Master.wav")
        let generatedArtwork = try FixtureFactory.png(width: 3_000, height: 3_000, alpha: false)
        defer { try? FileManager.default.removeItem(at: generatedArtwork) }
        try fixture.write(Data(contentsOf: generatedArtwork), to: "Artwork/Cover.png")
        try fixture.write(Data("Artist: Test\nTitle: Test".utf8), to: "Credits/credits.md")
        return fixture
    }

    func snapshots() throws -> [String: Snapshot] {
        try relativePaths().reduce(into: [:]) { snapshots, path in
            let url = root.appendingPathComponent(path)
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            var preservedAttributes: [FileAttributeKey: AnyHashable] = [:]
            if let size = attributes[.size] as? NSNumber {
                preservedAttributes[.size] = AnyHashable(size)
            }
            if let modificationDate = attributes[.modificationDate] as? Date {
                preservedAttributes[.modificationDate] = AnyHashable(modificationDate)
            }
            if let permissions = attributes[.posixPermissions] as? NSNumber {
                preservedAttributes[.posixPermissions] = AnyHashable(permissions)
            }
            snapshots[path] = Snapshot(
                data: try Data(contentsOf: url),
                attributes: preservedAttributes
            )
        }
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
    }

    private func write(_ data: Data, to path: String) throws {
        let url = root.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
    }

    private func relativePaths() throws -> [String] {
        try FileManager.default.subpathsOfDirectory(atPath: root.path).filter { path in
            var isDirectory: ObjCBool = false
            FileManager.default.fileExists(atPath: root.appendingPathComponent(path).path, isDirectory: &isDirectory)
            return !isDirectory.boolValue
        }.sorted()
    }
}

private final class ScanMutationFixture {
    let root: URL

    private init(root: URL) {
        self.root = root
    }

    static func make() throws -> ScanMutationFixture {
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("ScanMutationFixture-\(UUID().uuidString)", isDirectory: true)
        let url = root.appendingPathComponent("Masters/Main Master.wav")
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("original-source-bytes".utf8).write(to: url)
        return ScanMutationFixture(root: root)
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
    }
}
