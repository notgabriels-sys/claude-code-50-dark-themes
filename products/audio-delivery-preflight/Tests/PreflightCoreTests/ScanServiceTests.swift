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

    func testSourceMutationBetweenFingerprintsProducesErrorAndCannotBeReady() async throws {
        let fixture = try ScanMutationFixture.make()
        defer { fixture.remove() }
        let preset = try PresetResolver().resolve(Preset(identifier: "test", name: "Test"))
        let master = try entry("Masters/Main Master.wav", category: .audio)
        let service = ScanService(
            inventory: ScanInventorySpy(entries: [master]),
            checksums: ScanChecksumSpy(),
            audioInspector: ScanMutatingAudioInspector(),
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

private struct ScanMutatingAudioInspector: AudioInspecting {
    func inspect(source: TrustedMediaSource) async -> InspectionOutcome<AudioProperties> {
        try? Data("changed-source-bytes".utf8).write(to: source.root.appendingPathComponent(source.relativePath.value))
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
        return SourceFingerprint(entries: entries)
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
        let root = FileManager.default.temporaryDirectory
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
        let root = FileManager.default.temporaryDirectory
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
