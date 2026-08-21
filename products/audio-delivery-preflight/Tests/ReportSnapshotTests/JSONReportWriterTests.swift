import XCTest
@testable import PreflightCore

final class JSONReportWriterTests: XCTestCase {
    func testJSONIsStableVersionedAndPrivate() throws {
        let result = try ReportFixture.result()
        let writer = JSONReportWriter()

        let first = try writer.data(for: result)
        let second = try writer.data(for: result)
        let text = try XCTUnwrap(String(data: first, encoding: .utf8))

        XCTAssertEqual(first, second)
        XCTAssertTrue(text.hasPrefix("{\n"))
        XCTAssertTrue(text.contains("\"schemaVersion\" : \"1.0\""))
        XCTAssertTrue(text.contains("\"engineVersion\" : \"0.1.0\""))
        XCTAssertTrue(text.contains("\"identifier\" : \"general-audio\""))
        XCTAssertTrue(text.contains("\"overallStatus\" : \"needsReview\""))
        XCTAssertTrue(text.contains("Track.wav"))
        XCTAssertTrue(text.contains("sampleRate"))
        XCTAssertTrue(text.contains("audio.mixed-sample-rates"))
        XCTAssertFalse(text.contains("/Users/example/private-delivery"))
    }

    func testJSONExportsOnlyValidatedRelativePaths() throws {
        let result = try ReportFixture.result(relativePath: "Masters/Track.wav")
        let unsafeEntry = InventoryEntry(
            relativePath: try RelativePath("Masters/Other.wav"),
            normalizedFilename: "other.wav",
            normalizedExtension: "wav",
            category: .audio,
            kind: .regular
        )
        let unsafeResult = ScanResult(
            selectedFolderName: result.selectedFolderName,
            preset: result.preset,
            applicationVersion: result.applicationVersion,
            engineVersion: result.engineVersion,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
            inventory: [unsafeEntry],
            findings: result.findings,
            overallStatus: result.overallStatus
        )

        let text = try XCTUnwrap(String(data: JSONReportWriter().data(for: unsafeResult), encoding: .utf8))
        XCTAssertTrue(text.contains("Masters"))
        XCTAssertFalse(text.contains("/Users/example/private-delivery"))
    }

    func testJSONRejectsUnsafeSelectedFolderDisplayComponentsWithoutLeakingThem() throws {
        let unsafeNames = [
            "/Users/example/secret-delivery",
            "C:\\Users\\example\\secret-delivery",
            "C:secret-drive-name",
            "nested/secret-delivery",
            "nested\\secret-delivery",
            ".",
            "..",
            "../secret-traversal",
            "..\\secret-traversal",
        ]

        for unsafeName in unsafeNames {
            let result = try ReportFixture.result(selectedFolderName: unsafeName)
            XCTAssertThrowsError(try JSONReportWriter().data(for: result), unsafeName) { error in
                guard case .exportFailed(let reason) = error as? PreflightError else {
                    return XCTFail("Expected exportFailed for \(unsafeName), received \(error)")
                }
                if unsafeName.count > 2 {
                    XCTAssertFalse(reason.contains(unsafeName), "The error must not leak the unsafe value")
                }
            }
        }
    }

    func testJSONV1ProtectsEveryNestedKeySet() throws {
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONReportWriter().data(for: try ReportFixture.result()))
                as? [String: Any]
        )
        XCTAssertEqual(Set(object.keys), [
            "schemaVersion", "selectedFolderName", "preset", "applicationVersion", "engineVersion",
            "startedAt", "completedAt", "inventory", "findings", "overallStatus",
        ])

        let preset = try dictionary(object["preset"])
        XCTAssertEqual(Set(preset.keys), ["schemaVersion", "identifier", "name", "requirements", "definition"])
        let requirement = try firstDictionary(preset["requirements"])
        XCTAssertEqual(Set(requirement.keys), ["identifier", "description", "severity"])
        let definition = try dictionary(preset["definition"])
        XCTAssertEqual(Set(definition.keys), [
            "schemaVersion", "identifier", "name", "audio", "filename", "roles",
            "serviceFileSeverity", "symbolicLinkSeverity", "exactDuplicateSeverity",
        ])
        XCTAssertEqual(Set(try dictionary(definition["audio"]).keys), [
            "requireConsistentSampleRate", "requireConsistentBitDepth", "requireConsistentChannelCount", "severity",
        ])
        XCTAssertEqual(Set(try dictionary(definition["filename"]).keys), ["ambiguousVersionPattern", "ambiguousVersionSeverity"])

        let inventory = try arrayOfDictionaries(object["inventory"])
        let audioEntry = try XCTUnwrap(inventory.first { $0["category"] as? String == "audio" })
        XCTAssertEqual(Set(audioEntry.keys), [
            "relativePath", "normalizedFilename", "normalizedExtension", "category", "byteSize",
            "modificationDate", "kind", "sha256", "checksumStatus", "inspectionStatus", "audioProperties", "evidence",
        ])
        XCTAssertEqual(Set(try dictionary(audioEntry["audioProperties"]).keys), ["channelCount", "sampleRate", "isReadable", "metadata"])
        XCTAssertEqual(Set(try firstDictionary(audioEntry["evidence"]).keys), ["label", "value"])
        XCTAssertEqual(Set(try dictionary(try firstDictionary(audioEntry["evidence"])["value"]).keys), ["type", "number"])

        let imageEntry = try XCTUnwrap(inventory.first { $0["category"] as? String == "artwork" })
        XCTAssertEqual(Set(try dictionary(imageEntry["imageProperties"]).keys), [
            "pixelWidth", "pixelHeight", "aspectRatio", "format", "colorModel", "hasAlpha", "byteSize", "isReadable",
        ])

        let finding = try firstDictionary(object["findings"])
        XCTAssertEqual(Set(finding.keys), [
            "schemaVersion", "ruleID", "severity", "title", "explanation", "affectedPaths", "evidence",
            "expected", "suggestedAction", "origin", "engineVersion",
        ])

        let digitalObject = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: JSONReportWriter().data(for: try ReportFixture.result(preset: BuiltInPresets.digitalRelease))
            ) as? [String: Any]
        )
        let digitalDefinition = try dictionary(try dictionary(digitalObject["preset"])["definition"])
        let digitalRole = try firstDictionary(digitalDefinition["roles"])
        XCTAssertEqual(Set(digitalRole.keys), [
            "identifier", "name", "pattern", "required", "category", "allowedExtensions",
            "allowedEncodings", "readability", "severity", "ambiguitySeverity",
        ])

        let artworkPreset = Preset(
            identifier: "artwork-schema",
            name: "Artwork Schema",
            artwork: ArtworkRequirement(minimumWidth: 3_000, minimumHeight: 3_000, requiresSquare: true)
        )
        let artworkObject = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: JSONReportWriter().data(for: try ReportFixture.result(preset: artworkPreset))
            ) as? [String: Any]
        )
        let artworkDefinition = try dictionary(try dictionary(artworkObject["preset"])["definition"])
        XCTAssertEqual(Set(try dictionary(artworkDefinition["artwork"]).keys), [
            "minimumWidth", "minimumHeight", "requiresSquare", "severity",
        ])

        let stereoObject = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: JSONReportWriter().data(for: try ReportFixture.result(preset: BuiltInPresets.stereoPremaster))
            ) as? [String: Any]
        )
        let stereoDefinition = try dictionary(try dictionary(stereoObject["preset"])["definition"])
        let stereoRole = try firstDictionary(stereoDefinition["roles"])
        XCTAssertEqual(Set(try dictionary(stereoRole["channelCount"]).keys), ["minimum", "maximum"])
    }

    private func dictionary(_ value: Any?) throws -> [String: Any] {
        try XCTUnwrap(value as? [String: Any])
    }

    private func firstDictionary(_ value: Any?) throws -> [String: Any] {
        try XCTUnwrap((value as? [[String: Any]])?.first)
    }

    private func arrayOfDictionaries(_ value: Any?) throws -> [[String: Any]] {
        try XCTUnwrap(value as? [[String: Any]])
    }
}

enum ReportFixture {
    static func result(
        relativePath: String = "Masters/Track.wav",
        selectedFolderName: String = "private-delivery",
        preset presetDefinition: Preset = BuiltInPresets.generalAudio,
        audioProperties: AudioProperties = AudioProperties(channelCount: 2, sampleRate: 48_000, isReadable: true)
    ) throws -> ScanResult {
        let path = try RelativePath(relativePath)
        let preset = try PresetResolver().resolve(presetDefinition)
        let entry = InventoryEntry(
            relativePath: path,
            normalizedFilename: "track.wav",
            normalizedExtension: "wav",
            category: .audio,
            byteSize: 1_024,
            modificationDate: Date(timeIntervalSince1970: 1_700_000_001),
            kind: .regular,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            inspectionStatus: .succeeded,
            audioProperties: audioProperties,
            evidence: [Evidence(label: "sampleRate", value: .number(48_000))]
        )
        let imagePath = try RelativePath("Artwork/Cover.png")
        let imageEntry = InventoryEntry(
            relativePath: imagePath,
            normalizedFilename: "cover.png",
            normalizedExtension: "png",
            category: .artwork,
            byteSize: 2_048,
            modificationDate: Date(timeIntervalSince1970: 1_700_000_001),
            kind: .regular,
            sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            inspectionStatus: .succeeded,
            imageProperties: ImageProperties(
                pixelWidth: 3_000,
                pixelHeight: 3_000,
                aspectRatio: 1,
                format: "png",
                colorModel: "RGB",
                hasAlpha: false,
                byteSize: 2_048,
                isReadable: true
            )
        )
        let finding = Finding(
            ruleID: "audio.mixed-sample-rates",
            severity: .warning,
            title: "Mixed sample rates",
            explanation: "The package contains more than one sample rate.",
            affectedPaths: [path],
            evidence: [Evidence(label: "sampleRate", value: .number(48_000))],
            expected: "One sample rate for matched masters.",
            suggestedAction: "Confirm the difference is intentional.",
            origin: .preset,
            engineVersion: "0.1.0"
        )
        return ScanResult(
            selectedFolderName: selectedFolderName,
            preset: preset,
            applicationVersion: "0.1.0",
            engineVersion: "0.1.0",
            startedAt: Date(timeIntervalSince1970: 1_700_000_000),
            completedAt: Date(timeIntervalSince1970: 1_700_000_002),
            inventory: [entry, imageEntry],
            findings: [finding],
            overallStatus: .needsReview
        )
    }
}
