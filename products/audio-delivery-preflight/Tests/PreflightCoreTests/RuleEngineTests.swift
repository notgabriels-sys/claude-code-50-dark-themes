import Foundation
import XCTest
@testable import PreflightCore

final class RuleEngineTests: XCTestCase {
    private let engineVersion = "test-engine"

    func testMixedSampleRatesWarnOnlyWhenPresetEnablesConsistency() throws {
        let entries = [
            audio("Masters/One.wav", sampleRate: 44_100),
            audio("Masters/Two.wav", sampleRate: 48_000),
        ]
        let disabled = try preset(identifier: "disabled")
        let enabled = try preset(identifier: "enabled", audio: AudioRequirement(requireConsistentSampleRate: true))

        XCTAssertFalse(evaluate(entries, preset: disabled).contains { $0.ruleID == "audio.mixed-sample-rate" })
        let finding = try XCTUnwrap(evaluate(entries, preset: enabled).first { $0.ruleID == "audio.mixed-sample-rate" })
        XCTAssertEqual(finding.severity, .warning)
        XCTAssertEqual(finding.origin, .preset)
    }

    func testAmbiguousVersionFilenameProducesFinding() throws {
        let preset = try preset(identifier: "versions", filename: FilenameRequirement(ambiguousVersionPattern: "(?i)final\\s*\\d+", ambiguousVersionSeverity: .warning))

        let finding = try XCTUnwrap(evaluate([audio("Masters/Track FINAL2.wav")], preset: preset).first { $0.ruleID == "filename.ambiguous-version" })

        XCTAssertEqual(finding.affectedPaths.map(\.value), ["Masters/Track FINAL2.wav"])
        XCTAssertEqual(finding.origin, .preset)
    }

    func testCaseInsensitiveFilenameCollisionProducesWarning() throws {
        let preset = try preset(identifier: "collision")

        let finding = try XCTUnwrap(evaluate([audio("Masters/Track.wav"), audio("Masters/track.wav")], preset: preset).first { $0.ruleID == "filename.case-insensitive-collision" })

        XCTAssertEqual(finding.severity, .warning)
        XCTAssertEqual(finding.origin, .engine)
        XCTAssertEqual(finding.affectedPaths.map(\.value), ["Masters/Track.wav", "Masters/track.wav"])
    }

    func testDigitalReleaseMissingMainMasterIsAnError() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)

        let finding = try XCTUnwrap(evaluate([document("Metadata.txt")], preset: preset).first { $0.ruleID == "role.missing.main-master" })

        XCTAssertEqual(finding.severity, .error)
        XCTAssertEqual(finding.origin, .preset)
    }

    func testDigitalReleaseDoesNotTreatUnmasteredOrMasteringNotesAsMainMaster() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        let entries = [audio("Masters/Unmastered.wav"), audio("Masters/Mastering Notes.wav")]

        let finding = try XCTUnwrap(evaluate(entries, preset: preset).first { $0.ruleID == "role.missing.main-master" })

        XCTAssertEqual(finding.severity, .error)
        XCTAssertFalse(evaluate(entries, preset: preset).contains { $0.ruleID == "role.ambiguous.main-master" })
    }

    func testResolvedRoleBearingPresetRetainsRoleEvaluationAcrossCodableBoundary() throws {
        let preset = Preset(
            identifier: "custom-role",
            name: "Custom role",
            roles: [DeliveryRole(identifier: "required-file", pattern: "(?i)required\\.wav$", required: true, category: .audio, readability: .error, severity: .error, ambiguitySeverity: .warning)]
        )
        let resolved = try PresetResolver().resolve(preset)
        let decoded = try JSONDecoder().decode(ResolvedPreset.self, from: JSONEncoder().encode(resolved))

        XCTAssertFalse(evaluate([audio("Delivery/required.wav")], preset: decoded).contains { $0.ruleID == "role.missing.required-file" })
    }

    func testMultipleMainMastersProduceAmbiguityWithoutSilentWinner() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        let entries = [audio("Masters/Main Master.wav"), audio("Masters/Main Master v2.wav")]

        let finding = try XCTUnwrap(evaluate(entries, preset: preset).first { $0.ruleID == "role.ambiguous.main-master" })

        XCTAssertEqual(finding.severity, .warning)
        XCTAssertEqual(finding.affectedPaths.map(\.value), ["Masters/Main Master v2.wav", "Masters/Main Master.wav"])
        XCTAssertFalse(finding.evidence.contains { $0.label == "selectedPath" })
    }

    func testArtworkRequirementsDetectNonSquareAndUndersizedFiles() throws {
        let preset = try preset(
            identifier: "artwork",
            artwork: ArtworkRequirement(minimumWidth: 3_000, minimumHeight: 3_000, requiresSquare: true, severity: .error)
        )
        let entry = artwork("Artwork/Cover.png", width: 2_000, height: 1_500)

        let findings = evaluate([entry], preset: preset)

        XCTAssertTrue(findings.contains { $0.ruleID == "artwork.not-square" && $0.origin == .preset })
        XCTAssertTrue(findings.contains { $0.ruleID == "artwork.undersized" && $0.origin == .preset })
    }

    func testExactDuplicatesIncludeRelativePathsAndDuplicateByteTotal() throws {
        let preset = try preset(identifier: "duplicates")
        let entries = [audio("Masters/One.wav", byteSize: 2_048, sha256: "abc"), audio("Masters/Two.wav", byteSize: 2_048, sha256: "abc")]

        let finding = try XCTUnwrap(evaluate(entries, preset: preset).first { $0.ruleID == "duplicate.exact" })

        XCTAssertEqual(finding.affectedPaths.map(\.value), ["Masters/One.wav", "Masters/Two.wav"])
        XCTAssertTrue(finding.evidence.contains(Evidence(label: "duplicateByteTotal", value: .integer(2_048))))
    }

    func testEngineAndPresetOriginsRemainDistinct() throws {
        let preset = try preset(identifier: "origins", audio: AudioRequirement(requireConsistentSampleRate: true))
        let findings = evaluate([audio("Masters/Track.wav", sampleRate: 44_100), audio("Masters/track.wav", sampleRate: 48_000)], preset: preset)

        XCTAssertEqual(findings.first { $0.ruleID == "audio.mixed-sample-rate" }?.origin, .preset)
        XCTAssertEqual(findings.first { $0.ruleID == "filename.case-insensitive-collision" }?.origin, .engine)
    }

    func testFindingsSortBySeverityRuleIdentifierAndRelativePath() throws {
        let preset = try preset(
            identifier: "sorting",
            audio: AudioRequirement(requireConsistentSampleRate: true),
            filename: FilenameRequirement(ambiguousVersionPattern: "(?i)final", ambiguousVersionSeverity: .error)
        )
        let findings = evaluate([audio("Z/Track FINAL.wav", sampleRate: 44_100), audio("A/Track.wav", sampleRate: 48_000), audio("A/track.wav", sampleRate: 48_000)], preset: preset)

        XCTAssertEqual(findings.map(\.ruleID), ["filename.ambiguous-version", "audio.mixed-sample-rate", "filename.case-insensitive-collision"])
    }

    private func evaluate(_ entries: [InventoryEntry], preset: ResolvedPreset) -> [Finding] {
        RuleEngine().evaluate(snapshot: InventorySnapshot(entries: entries, findings: []), preset: preset, engineVersion: engineVersion)
    }

    private func preset(
        identifier: String,
        audio: AudioRequirement = AudioRequirement(),
        artwork: ArtworkRequirement? = nil,
        filename: FilenameRequirement = FilenameRequirement()
    ) throws -> ResolvedPreset {
        try PresetResolver().resolve(Preset(identifier: identifier, name: identifier, audio: audio, artwork: artwork, filename: filename))
    }

    private func audio(
        _ path: String,
        sampleRate: Double = 48_000,
        byteSize: Int64 = 1_024,
        sha256: String? = nil
    ) -> InventoryEntry {
        InventoryEntry(
            relativePath: try! RelativePath(path),
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: "wav",
            category: .audio,
            byteSize: byteSize,
            kind: .regular,
            sha256: sha256,
            inspectionStatus: .succeeded,
            audioProperties: AudioProperties(container: "WAV", encoding: "Linear PCM", channelCount: 2, sampleRate: sampleRate, pcmBitDepth: 24, isReadable: true)
        )
    }

    private func artwork(_ path: String, width: Int, height: Int) -> InventoryEntry {
        InventoryEntry(
            relativePath: try! RelativePath(path),
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: "png",
            category: .artwork,
            kind: .regular,
            inspectionStatus: .succeeded,
            imageProperties: ImageProperties(pixelWidth: width, pixelHeight: height, aspectRatio: Double(width) / Double(height), format: "public.png", isReadable: true)
        )
    }

    private func document(_ path: String) -> InventoryEntry {
        InventoryEntry(
            relativePath: try! RelativePath(path),
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: "txt",
            category: .document,
            kind: .regular
        )
    }
}
