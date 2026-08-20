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
}
