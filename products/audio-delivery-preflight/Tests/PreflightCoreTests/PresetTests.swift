import Foundation
import XCTest
@testable import PreflightCore

final class PresetTests: XCTestCase {
    func testBuiltInPresetsResolveWithExactIdentifiersAndSerializableRequirements() throws {
        let presets = BuiltInPresets.all

        XCTAssertEqual(presets.map(\.identifier), ["general-audio", "stereo-premaster", "digital-release", "custom"])

        let resolved = try presets.map { try PresetResolver().resolve($0) }
        let encoded = try JSONEncoder().encode(resolved)
        let decoded = try JSONDecoder().decode([ResolvedPreset].self, from: encoded)

        XCTAssertEqual(decoded, resolved)
        XCTAssertTrue(resolved.allSatisfy { !$0.requirements.isEmpty })
    }

    func testGeneralAudioDoesNotMandateSampleRateOrBitDepth() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.generalAudio)

        XCTAssertNil(preset.definition.audio.sampleRate)
        XCTAssertNil(preset.definition.audio.bitDepth)
    }

    func testStereoPremasterRequiresReadableLosslessStereoRole() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.stereoPremaster)
        let role = try XCTUnwrap(preset.definition.roles.first { $0.identifier == "stereo-premaster" })

        XCTAssertTrue(role.required)
        XCTAssertEqual(role.category, .audio)
        XCTAssertEqual(role.allowedExtensions, ["aif", "aiff", "flac", "m4a", "wav"])
        XCTAssertEqual(role.allowedEncodings, ["ALAC", "FLAC", "Linear PCM"])
        XCTAssertEqual(role.channelCount, NumericConstraint(exactly: 2))
        XCTAssertEqual(role.readability, .error)
        XCTAssertTrue(preset.definition.audio.requireConsistentSampleRate)
        XCTAssertTrue(preset.definition.audio.requireConsistentBitDepth)
        XCTAssertTrue(preset.definition.audio.requireConsistentChannelCount)
    }

    func testDigitalReleaseRequiresLosslessMainMasterArtworkAndMetadataOrCreditsDocument() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)

        XCTAssertEqual(
            Set(preset.definition.roles.filter(\.required).map(\.identifier)),
            ["main-master", "artwork", "metadata-or-credits"]
        )
        XCTAssertEqual(
            preset.definition.roles.first { $0.identifier == "main-master" }?.allowedExtensions,
            ["aif", "aiff", "flac", "m4a", "wav"]
        )
        XCTAssertEqual(
            preset.definition.roles.first { $0.identifier == "main-master" }?.allowedEncodings,
            ["ALAC", "FLAC", "Linear PCM"]
        )
        XCTAssertEqual(
            preset.definition.artwork,
            ArtworkRequirement(minimumWidth: 3_000, minimumHeight: 3_000, requiresSquare: true, severity: .error)
        )
    }

    func testGeneralAudioEnablesAllPromisedConsistencyDimensions() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.generalAudio)

        XCTAssertTrue(preset.definition.audio.requireConsistentSampleRate)
        XCTAssertTrue(preset.definition.audio.requireConsistentBitDepth)
        XCTAssertTrue(preset.definition.audio.requireConsistentChannelCount)
    }

    func testCustomPresetUsesTheSameCompleteEditableSchema() throws {
        let custom = BuiltInPresets.custom
        let configured = Preset(
            identifier: custom.identifier,
            name: custom.name,
            audio: AudioRequirement(
                allowedExtensions: ["wav"],
                allowedEncodings: ["Linear PCM"],
                sampleRate: NumericConstraint(exactly: 48_000),
                bitDepth: NumericConstraint(exactly: 24),
                requireConsistentSampleRate: true,
                requireConsistentBitDepth: true,
                requireConsistentChannelCount: true,
                severity: .error
            ),
            artwork: ArtworkRequirement(minimumWidth: 3_000, minimumHeight: 3_000, requiresSquare: true, severity: .error),
            filename: FilenameRequirement(ambiguousVersionPattern: "(?i)final\\d+", ambiguousVersionSeverity: .error),
            roles: [
                DeliveryRole(
                    identifier: "main",
                    name: "Main master",
                    pattern: "(?i)main\\.wav$",
                    required: true,
                    category: .audio,
                    allowedExtensions: ["wav"],
                    allowedEncodings: ["Linear PCM"],
                    channelCount: NumericConstraint(exactly: 2),
                    sampleRate: NumericConstraint(exactly: 48_000),
                    bitDepth: NumericConstraint(exactly: 24),
                    readability: .error,
                    severity: .error,
                    ambiguitySeverity: .error
                ),
            ],
            serviceFileSeverity: .warning,
            symbolicLinkSeverity: .error,
            exactDuplicateSeverity: .information
        )

        let resolved = try PresetResolver().resolve(configured)
        let roundTripped = try JSONDecoder().decode(ResolvedPreset.self, from: JSONEncoder().encode(resolved))

        XCTAssertEqual(roundTripped.definition, configured)
    }

    func testResolverRejectsInvalidRoleRegex() throws {
        let preset = Preset(
            identifier: "invalid",
            name: "Invalid",
            roles: [DeliveryRole(identifier: "main", pattern: "[", required: true, severity: .error)]
        )

        XCTAssertThrowsError(try PresetResolver().resolve(preset)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "roles.main.pattern", reason: "The regular expression is invalid."))
        }
    }

    func testResolverRejectsContradictoryNumericRange() throws {
        let preset = Preset(
            identifier: "invalid-range",
            name: "Invalid range",
            audio: AudioRequirement(sampleRate: NumericConstraint(minimum: 96_000, maximum: 44_100))
        )

        XCTAssertThrowsError(try PresetResolver().resolve(preset)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "audio.sampleRate", reason: "The minimum cannot exceed the maximum."))
        }
    }

    func testResolverRejectsAudioOnlyConstraintsWithoutAnAudioRoleCategory() {
        let invalidRoles: [(DeliveryRole, String)] = [
            (
                DeliveryRole(
                    identifier: "any-encoding",
                    pattern: ".*",
                    required: true,
                    allowedEncodings: ["Linear PCM"]
                ),
                "roles.any-encoding.allowedEncodings"
            ),
            (
                DeliveryRole(
                    identifier: "any-channels",
                    pattern: ".*",
                    required: true,
                    channelCount: NumericConstraint(exactly: 2)
                ),
                "roles.any-channels.channelCount"
            ),
            (
                DeliveryRole(
                    identifier: "document-rate",
                    pattern: ".*",
                    required: true,
                    category: .document,
                    sampleRate: NumericConstraint(exactly: 48_000)
                ),
                "roles.document-rate.sampleRate"
            ),
            (
                DeliveryRole(
                    identifier: "artwork-depth",
                    pattern: ".*",
                    required: true,
                    category: .artwork,
                    bitDepth: NumericConstraint(exactly: 24)
                ),
                "roles.artwork-depth.bitDepth"
            ),
        ]

        for (role, expectedField) in invalidRoles {
            let preset = Preset(identifier: role.identifier, name: role.name, roles: [role])
            XCTAssertThrowsError(try PresetResolver().resolve(preset), expectedField) { error in
                XCTAssertEqual(
                    error as? PreflightError,
                    .invalidPreset(
                        field: expectedField,
                        reason: "Audio-only role constraints require the Audio category."
                    )
                )
            }
        }
    }

    func testResolverRejectsActiveReadabilitySeverityForNonMediaRole() {
        let preset = Preset(
            identifier: "document-readability",
            name: "Document readability",
            roles: [DeliveryRole(
                identifier: "credits",
                pattern: "credits\\.txt$",
                required: true,
                category: .document,
                readability: .error
            )]
        )

        XCTAssertThrowsError(try PresetResolver().resolve(preset)) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(
                    field: "roles.credits.readability",
                    reason: "Unreadable-media severity is only applicable to Audio or Artwork roles."
                )
            )
        }
    }

    func testResolvedRoleRequirementDescribesEveryActiveProperty() throws {
        let preset = Preset(
            identifier: "transparent-role",
            name: "Transparent role",
            roles: [DeliveryRole(
                identifier: "main",
                name: "Main master",
                pattern: "(?i)main\\.wav$",
                required: true,
                category: .audio,
                allowedExtensions: ["wav"],
                allowedEncodings: ["Linear PCM"],
                channelCount: NumericConstraint(exactly: 2),
                sampleRate: NumericConstraint(exactly: 48_000),
                bitDepth: NumericConstraint(minimum: 24, maximum: 32),
                readability: .error,
                severity: .error,
                ambiguitySeverity: .warning
            )]
        )

        let resolved = try PresetResolver().resolve(preset)
        let requirement = try XCTUnwrap(resolved.requirements.first { $0.identifier == "role.main" })

        XCTAssertEqual(
            requirement.description,
            "Required role Main master (identifier: main); pattern: (?i)main\\.wav$; category: audio; allowed extensions: wav; allowed inspected audio encodings: Linear PCM; channel count: exactly 2; sample rate: exactly 48000 Hz; PCM bit depth: 24 to 32; unreadable media severity: error; missing or constrained value severity: error; multiple matches severity: warning."
        )
    }

    func testResolvedRoleRequirementSafelyFormatsLargeFiniteIntegerBounds() throws {
        let preset = Preset(
            identifier: "large-bound",
            name: "Large bound",
            roles: [DeliveryRole(
                identifier: "main",
                pattern: ".*",
                required: true,
                category: .audio,
                sampleRate: NumericConstraint(exactly: 1e100)
            )]
        )

        let resolved = try PresetResolver().resolve(preset)
        let requirement = try XCTUnwrap(resolved.requirements.first { $0.identifier == "role.main" })

        XCTAssertTrue(requirement.description.contains("sample rate: exactly 1e+100 Hz"))
    }

    func testResolverRejectsUnsupportedPresetSchemaVersion() {
        let preset = Preset(schemaVersion: "2.0", identifier: "future", name: "Future")

        XCTAssertThrowsError(try PresetResolver().resolve(preset)) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(field: "schemaVersion", reason: "Only preset schema version 1.0 is supported.")
            )
        }
    }

    func testResolverRequiresNonReadySeverityForConstrainedOrUnavailableMeasurements() {
        let presets = [
            Preset(
                identifier: "audio-information",
                name: "Audio information",
                audio: AudioRequirement(sampleRate: NumericConstraint(exactly: 48_000), severity: .information)
            ),
            Preset(
                identifier: "audio-pass",
                name: "Audio pass",
                audio: AudioRequirement(allowedEncodings: ["Linear PCM"], severity: .pass)
            ),
            Preset(
                identifier: "artwork-information",
                name: "Artwork information",
                artwork: ArtworkRequirement(minimumWidth: 3_000, severity: .information)
            ),
            Preset(
                identifier: "role-information",
                name: "Role information",
                roles: [DeliveryRole(
                    identifier: "master",
                    pattern: ".*",
                    required: true,
                    category: .audio,
                    channelCount: NumericConstraint(exactly: 2),
                    readability: .information,
                    severity: .information,
                    ambiguitySeverity: .information
                )]
            ),
        ]

        for preset in presets {
            XCTAssertThrowsError(try PresetResolver().resolve(preset), preset.identifier)
        }
    }

    func testResolvedPresetDecodingRejectsTamperedIdentitySummary() throws {
        let resolved = try PresetResolver().resolve(BuiltInPresets.digitalRelease)

        for (field, replacement) in [
            ("schemaVersion", "tampered"),
            ("identifier", "not-digital-release"),
            ("name", "Not Digital Release"),
        ] {
            var object = try encodedObject(resolved)
            object[field] = replacement

            XCTAssertThrowsError(try JSONDecoder().decode(ResolvedPreset.self, from: try JSONSerialization.data(withJSONObject: object)))
        }
    }

    func testResolvedPresetDecodingRejectsTamperedRequirementsSummary() throws {
        let resolved = try PresetResolver().resolve(BuiltInPresets.digitalRelease)
        var object = try encodedObject(resolved)
        object["requirements"] = []

        XCTAssertThrowsError(try JSONDecoder().decode(ResolvedPreset.self, from: try JSONSerialization.data(withJSONObject: object)))
    }

    func testResolverRejectsNonFiniteNumericBoundsWithoutJSONEncoding() throws {
        let infinity = Preset(
            identifier: "infinity",
            name: "Infinity",
            audio: AudioRequirement(sampleRate: NumericConstraint(minimum: .infinity))
        )
        let nan = Preset(
            identifier: "nan",
            name: "NaN",
            audio: AudioRequirement(bitDepth: NumericConstraint(maximum: .nan))
        )

        XCTAssertThrowsError(try PresetResolver().resolve(infinity)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "audio.sampleRate", reason: "The bound must be finite."))
        }
        XCTAssertThrowsError(try PresetResolver().resolve(nan)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "audio.bitDepth", reason: "The bound must be finite."))
        }
    }

    func testResolverRejectsNonPositiveAndFractionalDiscreteRequirements() throws {
        let zeroSampleRate = Preset(
            identifier: "zero-rate",
            name: "Zero rate",
            audio: AudioRequirement(sampleRate: NumericConstraint(minimum: 0))
        )
        let fractionalBitDepth = Preset(
            identifier: "fractional-depth",
            name: "Fractional depth",
            audio: AudioRequirement(bitDepth: NumericConstraint(exactly: 24.5))
        )
        let fractionalChannels = Preset(
            identifier: "fractional-channels",
            name: "Fractional channels",
            roles: [DeliveryRole(identifier: "main", pattern: ".*", required: true, channelCount: NumericConstraint(exactly: 2.5))]
        )
        let negativeArtwork = Preset(
            identifier: "negative-artwork",
            name: "Negative artwork",
            artwork: ArtworkRequirement(minimumWidth: -1)
        )

        XCTAssertThrowsError(try PresetResolver().resolve(zeroSampleRate)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "audio.sampleRate", reason: "The bound must be greater than zero."))
        }
        XCTAssertThrowsError(try PresetResolver().resolve(fractionalBitDepth)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "audio.bitDepth", reason: "The bound must be an integer."))
        }
        XCTAssertThrowsError(try PresetResolver().resolve(fractionalChannels)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "roles.main.channelCount", reason: "The bound must be an integer."))
        }
        XCTAssertThrowsError(try PresetResolver().resolve(negativeArtwork)) { error in
            XCTAssertEqual(error as? PreflightError, .invalidPreset(field: "artwork.minimumWidth", reason: "The minimum must be greater than zero."))
        }
    }

    func testArtworkRequirementDecodingRejectsFractionalDimensions() throws {
        let data = Data("{\"minimumWidth\":100.5,\"minimumHeight\":null,\"requiresSquare\":false,\"severity\":\"warning\"}".utf8)

        XCTAssertThrowsError(try JSONDecoder().decode(ArtworkRequirement.self, from: data))
    }

    func testPresetValidationBudgetsMatchTheRequiredLimits() {
        XCTAssertEqual(PresetValidationLimits.maximumRoles, 32)
        XCTAssertEqual(PresetValidationLimits.maximumRegularExpressionByteCount, 512)
        XCTAssertEqual(PresetValidationLimits.maximumCollectionValueCount, 4_096)
        XCTAssertEqual(PresetValidationLimits.maximumStringByteCount, 4_096)
        XCTAssertEqual(PresetValidationLimits.maximumAggregateStringByteCount, 1_048_576)
    }

    func testRoleCountBudgetAllowsThirtyTwoAndRejectsThirtyThree() throws {
        let roles = (0..<33).map {
            DeliveryRole(identifier: "role-\($0)", name: "Role \($0)", pattern: ".*", required: false)
        }

        XCTAssertNoThrow(
            try PresetResolver().resolve(
                Preset(identifier: "role-boundary", name: "Role boundary", roles: Array(roles.prefix(32)))
            )
        )
        XCTAssertThrowsError(
            try PresetResolver().resolve(
                Preset(identifier: "role-exceeded", name: "Role exceeded", roles: roles)
            )
        ) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(field: "roles", reason: "A preset can define at most 32 roles.")
            )
        }
    }

    func testRoleRegexByteBudgetAllowsFiveHundredTwelveAndRejectsTheNextUTF8Character() throws {
        let boundaryPattern = String(repeating: "é", count: 256)
        let exceededPattern = boundaryPattern + "é"

        XCTAssertEqual(boundaryPattern.utf8.count, 512)
        XCTAssertNoThrow(
            try PresetResolver().resolve(
                Preset(
                    identifier: "role-regex-boundary",
                    name: "Role regex boundary",
                    roles: [DeliveryRole(identifier: "main", pattern: boundaryPattern, required: false)]
                )
            )
        )
        XCTAssertThrowsError(
            try PresetResolver().resolve(
                Preset(
                    identifier: "role-regex-exceeded",
                    name: "Role regex exceeded",
                    roles: [DeliveryRole(identifier: "main", pattern: exceededPattern, required: false)]
                )
            )
        ) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(field: "roles.main.pattern", reason: "The regular expression cannot exceed 512 UTF-8 bytes.")
            )
        }
    }

    func testFilenameRegexByteBudgetAllowsFiveHundredTwelveAndRejectsTheNextUTF8Character() throws {
        let boundaryPattern = String(repeating: "é", count: 256)
        let exceededPattern = boundaryPattern + "é"

        XCTAssertNoThrow(
            try PresetResolver().resolve(
                Preset(
                    identifier: "filename-regex-boundary",
                    name: "Filename regex boundary",
                    filename: FilenameRequirement(ambiguousVersionPattern: boundaryPattern)
                )
            )
        )
        XCTAssertThrowsError(
            try PresetResolver().resolve(
                Preset(
                    identifier: "filename-regex-exceeded",
                    name: "Filename regex exceeded",
                    filename: FilenameRequirement(ambiguousVersionPattern: exceededPattern)
                )
            )
        ) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(field: "filename.ambiguousVersionPattern", reason: "The regular expression cannot exceed 512 UTF-8 bytes.")
            )
        }
    }

    func testSafeRegexPolicyAcceptsBuiltInsAndOrdinaryCustomPatterns() throws {
        for preset in BuiltInPresets.all {
            XCTAssertNoThrow(try PresetResolver().resolve(preset), preset.identifier)
        }
        for (index, pattern) in [
            ".*",
            ".*\\.wav$",
            "(?i)main\\.(m4a|mp3|wav)$",
            "(?i)final\\s*\\d+",
            "(?i)(final|version)\\s*\\d+",
            "a{256}",
        ].enumerated() {
            let preset = Preset(
                identifier: "ordinary-pattern-\(index)",
                name: "Ordinary pattern \(index)",
                filename: FilenameRequirement(ambiguousVersionPattern: pattern),
                roles: [DeliveryRole(identifier: "role-\(index)", pattern: pattern, required: false)]
            )
            XCTAssertNoThrow(try PresetResolver().resolve(preset), pattern)
        }
    }

    func testSafeRegexPolicyRejectsDangerousConstructsAtResolution() {
        let dangerousPatterns = [
            "((a+)+$)",
            "(a)\\1",
            "(?=a).*",
            "(?!a).*",
            "(?<=a)b",
            "(?<!a)b",
            "(a|aa)+$",
            "(a?)+$",
            "((a+))+$",
            "((a|aa))+$",
            "a{1000000000}",
            "a*a*b",
            "a{0,256}a{0,256}",
            "(a+){2}",
            "(a|b){2}",
            "a{257}",
        ]

        for (index, pattern) in dangerousPatterns.enumerated() {
            let preset = Preset(
                identifier: "dangerous-pattern-\(index)",
                name: "Dangerous pattern \(index)",
                roles: [DeliveryRole(identifier: "role-\(index)", pattern: pattern, required: false)]
            )
            XCTAssertThrowsError(try PresetResolver().resolve(preset), pattern) { error in
                XCTAssertEqual(
                    error as? PreflightError,
                    .invalidPreset(
                        field: "roles.role-\(index).pattern",
                        reason: "The regular expression uses an unsafe construct."
                    )
                )
            }
        }
    }

    func testResolverRequiresTrimmedPresetAndRoleNames() {
        let invalidNames = [
            Preset(identifier: "blank-preset", name: "   "),
            Preset(
                identifier: "padded-preset",
                name: " Padded",
                roles: [DeliveryRole(identifier: "main", name: "Main", pattern: ".*", required: false)]
            ),
            Preset(
                identifier: "blank-role",
                name: "Blank role",
                roles: [DeliveryRole(identifier: "main", name: "  ", pattern: ".*", required: false)]
            ),
            Preset(
                identifier: "padded-role",
                name: "Padded role",
                roles: [DeliveryRole(identifier: "main", name: "Main ", pattern: ".*", required: false)]
            ),
        ]

        for preset in invalidNames {
            XCTAssertThrowsError(try PresetResolver().resolve(preset), preset.identifier)
        }
    }

    func testResolverEnforcesSafeIdentifiersAndNormalizedRoleUniqueness() {
        let unsafePreset = Preset(identifier: "unsafe/id", name: "Unsafe identifier")
        let unnormalizedPreset = Preset(identifier: "Uppercase", name: "Unnormalized identifier")
        let unsafeRole = Preset(
            identifier: "unsafe-role",
            name: "Unsafe role",
            roles: [DeliveryRole(identifier: "../main", pattern: ".*", required: false)]
        )
        let normalizedDuplicate = Preset(
            identifier: "normalized-duplicate",
            name: "Normalized duplicate",
            roles: [
                DeliveryRole(identifier: "Main", name: "Primary", pattern: ".*", required: false),
                DeliveryRole(identifier: "main", name: "Secondary", pattern: ".*", required: false),
            ]
        )

        XCTAssertThrowsError(try PresetResolver().resolve(unsafePreset))
        XCTAssertThrowsError(try PresetResolver().resolve(unnormalizedPreset))
        XCTAssertThrowsError(try PresetResolver().resolve(unsafeRole))
        XCTAssertThrowsError(try PresetResolver().resolve(normalizedDuplicate)) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(
                    field: "roles",
                    reason: "Role identifiers must be unique after normalization: main."
                )
            )
        }
    }

    func testResolverRejectsActualControlCharactersAcrossDisplayedPresetStrings() {
        let invalidPresets: [(Preset, String)] = [
            (Preset(identifier: "control-name", name: "Control\nName"), "name"),
            (Preset(identifier: "control\u{0007}identifier", name: "Control identifier"), "identifier"),
            (
                Preset(
                    identifier: "control-role-name",
                    name: "Control role name",
                    roles: [DeliveryRole(identifier: "main", name: "Main\trole", pattern: ".*", required: false)]
                ),
                "roles.main.name"
            ),
            (
                Preset(
                    identifier: "control-pattern",
                    name: "Control pattern",
                    roles: [DeliveryRole(identifier: "main", pattern: "main\n.*", required: false)]
                ),
                "roles.main.pattern"
            ),
            (
                Preset(
                    identifier: "control-list",
                    name: "Control list",
                    audio: AudioRequirement(allowedExtensions: ["wav\r"])
                ),
                "audio.allowedExtensions"
            ),
        ]

        for (preset, expectedField) in invalidPresets {
            XCTAssertThrowsError(try PresetResolver().resolve(preset), expectedField) { error in
                guard case .invalidPreset(let field, _) = error as? PreflightError else {
                    return XCTFail("Expected a typed invalid-preset error.")
                }
                XCTAssertEqual(field, expectedField)
            }
        }
    }

    func testCollectionAndAggregateStringBudgetsBoundAppAuthoredPresets() throws {
        let boundaryValues = Array(repeating: "wav", count: PresetValidationLimits.maximumCollectionValueCount)
        XCTAssertNoThrow(
            try PresetResolver().resolve(
                Preset(
                    identifier: "collection-boundary",
                    name: "Collection boundary",
                    audio: AudioRequirement(allowedExtensions: boundaryValues)
                )
            )
        )

        let tooManyValues = boundaryValues + ["aiff"]
        XCTAssertThrowsError(
            try PresetResolver().resolve(
                Preset(
                    identifier: "collection-exceeded",
                    name: "Collection exceeded",
                    audio: AudioRequirement(allowedExtensions: tooManyValues)
                )
            )
        )

        let largeValue = String(repeating: "a", count: PresetValidationLimits.maximumStringByteCount)
        let aggregateExceeded = Array(repeating: largeValue, count: 257)
        XCTAssertThrowsError(
            try PresetResolver().resolve(
                Preset(
                    identifier: "aggregate-exceeded",
                    name: "Aggregate exceeded",
                    audio: AudioRequirement(allowedExtensions: aggregateExceeded)
                )
            )
        )
    }

    private func encodedObject(_ preset: ResolvedPreset) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(preset)) as? [String: Any])
    }
}
