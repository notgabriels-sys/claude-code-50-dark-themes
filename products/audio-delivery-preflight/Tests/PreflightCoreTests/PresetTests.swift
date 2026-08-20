import Foundation
import XCTest
@testable import PreflightCore

final class PresetTests: XCTestCase {
    func testBuiltInPresetsResolveWithExactIdentifiersAndSerializableRequirements() throws {
        let presets = BuiltInPresets.all

        XCTAssertEqual(presets.map(\.identifier), ["general-audio", "stereo-premaster", "digital-release"])

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
        XCTAssertEqual(role.allowedExtensions, ["aif", "aiff", "flac", "wav"])
        XCTAssertEqual(role.channelCount, NumericConstraint(exactly: 2))
        XCTAssertEqual(role.readability, .error)
    }

    func testDigitalReleaseRequiresLosslessMainMasterArtworkAndMetadataOrCreditsDocument() throws {
        let preset = try PresetResolver().resolve(BuiltInPresets.digitalRelease)

        XCTAssertEqual(
            Set(preset.definition.roles.filter(\.required).map(\.identifier)),
            ["main-master", "artwork", "metadata-or-credits"]
        )
        XCTAssertEqual(
            preset.definition.roles.first { $0.identifier == "main-master" }?.allowedExtensions,
            ["aif", "aiff", "flac", "wav"]
        )
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

    private func encodedObject(_ preset: ResolvedPreset) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(preset)) as? [String: Any])
    }
}
