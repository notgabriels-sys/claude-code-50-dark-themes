import Foundation
import XCTest
@testable import PreflightCore

final class PresetFileLoaderTests: XCTestCase {
    func testLoadsValidatedPresetFromDescriptorAnchoredRegularFileWithoutMutatingIt() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let preset = Preset(
            identifier: "imported",
            name: "Imported",
            audio: AudioRequirement(
                allowedExtensions: ["wav"],
                allowedEncodings: ["Linear PCM"],
                sampleRate: NumericConstraint(exactly: 48_000),
                severity: .error
            )
        )
        let encoded = try JSONEncoder().encode(preset)
        try encoded.write(to: fixture.file)
        let before = try Data(contentsOf: fixture.file)

        let loaded = try PresetFileLoader().load(from: fixture.file)

        XCTAssertEqual(loaded, preset)
        XCTAssertNoThrow(try PresetResolver().resolve(loaded))
        XCTAssertEqual(try Data(contentsOf: fixture.file), before)
    }

    func testRejectsPresetFileSymlinkWithoutReadingItsTarget() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let target = fixture.root.appendingPathComponent("private-target.json")
        let link = fixture.root.appendingPathComponent("custom.json")
        try JSONEncoder().encode(BuiltInPresets.custom).write(to: target)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)

        XCTAssertThrowsError(try PresetFileLoader().load(from: link))
    }

    func testRejectsSymlinkedPresetAncestorWithoutReadingOutsideTrustedPath() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let targetDirectory = fixture.root.appendingPathComponent("target", isDirectory: true)
        let linkedDirectory = fixture.root.appendingPathComponent("linked", isDirectory: true)
        try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: true)
        let target = targetDirectory.appendingPathComponent("custom.json")
        try JSONEncoder().encode(BuiltInPresets.custom).write(to: target)
        try FileManager.default.createSymbolicLink(at: linkedDirectory, withDestinationURL: targetDirectory)

        XCTAssertThrowsError(
            try PresetFileLoader().load(from: linkedDirectory.appendingPathComponent("custom.json"))
        )
    }

    func testRejectsPresetFileLargerThanBoundedImportLimit() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try Data(repeating: 0x20, count: 1_048_577).write(to: fixture.file)

        XCTAssertThrowsError(try PresetFileLoader().load(from: fixture.file))
    }

    func testImportedRoleNameMatchesTheAppAuthoredPresetExactly() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let preset = Preset(
            identifier: "imported-name-parity",
            name: "Imported name parity",
            roles: [DeliveryRole(
                identifier: "main-master",
                name: "Main master – approved",
                pattern: "(?i)main\\.wav$",
                required: true,
                category: .audio,
                readability: .error,
                severity: .error
            )]
        )
        try JSONEncoder().encode(preset).write(to: fixture.file)

        let loaded = try PresetFileLoader().load(from: fixture.file)
        let appResolved = try PresetResolver().resolve(preset)
        let importedResolved = try PresetResolver().resolve(loaded)

        XCTAssertEqual(loaded.roles.first?.name, "Main master – approved")
        XCTAssertEqual(importedResolved.definition.roles.first?.name, appResolved.definition.roles.first?.name)
        XCTAssertEqual(importedResolved.requirements, appResolved.requirements)
    }

    func testImportedPresetUsesTheSameBlankRoleNameValidationAsAppPreset() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let preset = Preset(
            identifier: "blank-imported-role",
            name: "Blank imported role",
            roles: [DeliveryRole(identifier: "main", name: "   ", pattern: ".*", required: false)]
        )
        try JSONEncoder().encode(preset).write(to: fixture.file)

        XCTAssertThrowsError(try PresetResolver().resolve(preset))
        XCTAssertThrowsError(try PresetFileLoader().load(from: fixture.file)) { error in
            XCTAssertEqual(
                error as? PreflightError,
                .invalidPreset(
                    field: "presetFile",
                    reason: "The imported preset is unreadable, unsafe, unsupported, or invalid."
                )
            )
        }
    }

    private func makeFixture() throws -> (root: URL, file: URL) {
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("PresetFileLoaderTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (root, root.appendingPathComponent("preset.json"))
    }
}
