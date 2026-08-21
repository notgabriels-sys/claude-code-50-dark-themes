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

    func testConservativeUnicodeFilenameAliasesProduceCollisionWarnings() throws {
        let preset = try preset(identifier: "unicode-collision")
        let aliases = [
            ("Masters/ss.wav", "Masters/ß.wav"),
            ("Masters/σ.wav", "Masters/ς.wav"),
            ("Masters/s.wav", "Masters/ſ.wav"),
            ("Masters/μ.wav", "Masters/µ.wav"),
            ("Masters/ff.wav", "Masters/ﬀ.wav"),
        ]

        for (first, second) in aliases {
            let finding = try XCTUnwrap(
                evaluate([audio(first), audio(second)], preset: preset)
                    .first { $0.ruleID == "filename.case-insensitive-collision" },
                "Expected a portability collision for \(first) and \(second)."
            )
            XCTAssertEqual(Set(finding.affectedPaths.map(\.value)), Set([first, second]))
        }
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

    func testRenamedAACCannotSatisfyDigitalReleaseLosslessRole() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        let renamedAAC = audio(
            "Masters/Main Master.wav",
            encoding: "AAC",
            container: "M4A",
            normalizedExtension: "wav"
        )

        let findings = evaluate([renamedAAC], preset: preset)
        let encodingFinding = try XCTUnwrap(findings.first { $0.ruleID == "role.disallowed-encoding.main-master" })
        let mismatchFinding = try XCTUnwrap(findings.first { $0.ruleID == "audio.filename-content-mismatch" })

        XCTAssertEqual(encodingFinding.severity, .error)
        XCTAssertEqual(encodingFinding.affectedPaths.map(\.value), ["Masters/Main Master.wav"])
        XCTAssertTrue(encodingFinding.evidence.contains(Evidence(label: "encoding", value: .string("AAC"))))
        XCTAssertTrue(encodingFinding.evidence.contains(Evidence(label: "container", value: .string("M4A"))))
        XCTAssertTrue(encodingFinding.evidence.contains(Evidence(label: "extension", value: .string("wav"))))
        XCTAssertEqual(mismatchFinding.affectedPaths.map(\.value), ["Masters/Main Master.wav"])
        XCTAssertNotEqual(OverallStatus.completed(findings: findings), .ready)
    }

    func testUnknownRequiredAudioMeasurementsNeverPass() throws {
        let configured = try preset(
            identifier: "unknown-audio",
            audio: AudioRequirement(
                sampleRate: NumericConstraint(exactly: 48_000),
                bitDepth: NumericConstraint(exactly: 24),
                severity: .error
            ),
            roles: [
                DeliveryRole(
                    identifier: "main",
                    pattern: "(?i)main\\.wav$",
                    required: true,
                    category: .audio,
                    channelCount: NumericConstraint(exactly: 2),
                    sampleRate: NumericConstraint(exactly: 48_000),
                    bitDepth: NumericConstraint(exactly: 24),
                    severity: .error
                ),
            ]
        )
        let entry = audio(
            "Main.wav",
            channelCount: nil,
            sampleRate: nil,
            bitDepth: nil
        )

        let findings = evaluate([entry], preset: configured)

        XCTAssertEqual(
            Set(findings.filter { $0.ruleID.contains("unavailable") }.map(\.ruleID)),
            [
                "audio.sample-rate-unavailable",
                "audio.bit-depth-unavailable",
                "role.channel-count-unavailable.main",
                "role.sample-rate-unavailable.main",
                "role.bit-depth-unavailable.main",
            ]
        )
        XCTAssertTrue(findings.filter { $0.ruleID.contains("unavailable") }.allSatisfy {
            $0.severity == .error && $0.affectedPaths.map(\.value) == ["Main.wav"] && $0.evidence.contains(Evidence(label: "measured", value: .unknown))
        })
        XCTAssertEqual(OverallStatus.completed(findings: findings), .requirementsNotMet)
    }

    func testUnknownArtworkDimensionsNeverPassConfiguredRequirement() throws {
        let configured = try preset(
            identifier: "unknown-artwork",
            artwork: ArtworkRequirement(minimumWidth: 3_000, minimumHeight: 3_000, requiresSquare: true, severity: .error)
        )
        let entry = artwork("Artwork/Cover.png", width: nil, height: nil)

        let findings = evaluate([entry], preset: configured)
        let finding = try XCTUnwrap(findings.first { $0.ruleID == "artwork.dimensions-unavailable" })

        XCTAssertEqual(finding.severity, .error)
        XCTAssertEqual(finding.affectedPaths.map(\.value), ["Artwork/Cover.png"])
        XCTAssertTrue(finding.evidence.contains(Evidence(label: "pixelWidth", value: .unknown)))
        XCTAssertTrue(finding.evidence.contains(Evidence(label: "pixelHeight", value: .unknown)))
        XCTAssertEqual(OverallStatus.completed(findings: findings), .requirementsNotMet)
    }

    func testGeneralAndStereoBuiltInsWarnForMixedPropertiesAndUnknownConsistencyEvidence() throws {
        let entries = [
            audio("Masters/One.wav", channelCount: 2, sampleRate: 44_100, bitDepth: 16),
            audio("Masters/Two.wav", channelCount: 1, sampleRate: 48_000, bitDepth: nil),
        ]

        for definition in [BuiltInPresets.generalAudio, BuiltInPresets.stereoPremaster] {
            let findings = evaluate(entries, preset: try PresetResolver().resolve(definition))
            XCTAssertTrue(findings.contains { $0.ruleID == "audio.mixed-sample-rate" })
            XCTAssertTrue(findings.contains { $0.ruleID == "audio.mixed-channel-count" })
            XCTAssertTrue(findings.contains { $0.ruleID == "audio.consistent-bit-depth-unavailable" && $0.affectedPaths.map(\.value) == ["Masters/Two.wav"] })
            XCTAssertNotEqual(OverallStatus.completed(findings: findings), .ready)
        }
    }

    func testBuiltInConsistencyNeverPassesSingleReadablePCMFileWithUnknownMeasurements() throws {
        let entry = audio(
            "Masters/Main Master.wav",
            channelCount: nil,
            sampleRate: nil,
            bitDepth: nil
        )

        for definition in [BuiltInPresets.generalAudio, BuiltInPresets.stereoPremaster, BuiltInPresets.digitalRelease] {
            let findings = evaluate([entry], preset: try PresetResolver().resolve(definition))
            XCTAssertEqual(
                Set(findings.filter { $0.ruleID.hasPrefix("audio.consistent-") }.map(\.ruleID)),
                [
                    "audio.consistent-sample-rate-unavailable",
                    "audio.consistent-bit-depth-unavailable",
                    "audio.consistent-channel-count-unavailable",
                ],
                "Expected every unavailable consistency measurement to remain non-ready for \(definition.identifier)."
            )
            XCTAssertTrue(findings.filter { $0.ruleID.hasPrefix("audio.consistent-") }.allSatisfy {
                $0.affectedPaths.map(\.value) == ["Masters/Main Master.wav"]
            })
            XCTAssertNotEqual(OverallStatus.completed(findings: findings), .ready)
        }
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
        filename: FilenameRequirement = FilenameRequirement(),
        roles: [DeliveryRole] = []
    ) throws -> ResolvedPreset {
        try PresetResolver().resolve(Preset(identifier: identifier, name: identifier, audio: audio, artwork: artwork, filename: filename, roles: roles))
    }

    private func audio(
        _ path: String,
        encoding: String? = "Linear PCM",
        container: String? = "WAV",
        normalizedExtension: String = "wav",
        channelCount: Int? = 2,
        sampleRate: Double? = 48_000,
        bitDepth: Int? = 24,
        byteSize: Int64 = 1_024,
        sha256: String? = nil
    ) -> InventoryEntry {
        InventoryEntry(
            relativePath: try! RelativePath(path),
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: normalizedExtension,
            category: .audio,
            byteSize: byteSize,
            kind: .regular,
            sha256: sha256,
            inspectionStatus: .succeeded,
            audioProperties: AudioProperties(container: container, encoding: encoding, channelCount: channelCount, sampleRate: sampleRate, pcmBitDepth: bitDepth, isReadable: true)
        )
    }

    private func artwork(_ path: String, width: Int?, height: Int?) -> InventoryEntry {
        InventoryEntry(
            relativePath: try! RelativePath(path),
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: "png",
            category: .artwork,
            kind: .regular,
            inspectionStatus: .succeeded,
            imageProperties: ImageProperties(
                pixelWidth: width,
                pixelHeight: height,
                aspectRatio: width.flatMap { width in height.flatMap { height in height > 0 ? Double(width) / Double(height) : nil } },
                format: "public.png",
                isReadable: true
            )
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
