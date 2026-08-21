import XCTest
@testable import PreflightCore

final class ChecksumManifestWriterTests: XCTestCase {
    func testManifestIsOrderedPortableAndTerminated() throws {
        let checksum = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"
        let entries = [
            InventoryEntry(relativePath: try RelativePath("z.wav"), normalizedFilename: "z.wav", normalizedExtension: "wav", category: .audio, kind: .regular, sha256: checksum),
            InventoryEntry(relativePath: try RelativePath("a.wav"), normalizedFilename: "a.wav", normalizedExtension: "wav", category: .audio, kind: .regular, sha256: checksum),
            InventoryEntry(relativePath: try RelativePath("Unknown.wav"), normalizedFilename: "unknown.wav", normalizedExtension: "wav", category: .audio, kind: .regular),
            InventoryEntry(relativePath: try RelativePath(".DS_Store"), normalizedFilename: ".ds_store", normalizedExtension: "", category: .serviceFile, kind: .regular, sha256: checksum),
        ]
        let result = try ReportFixture.result()
        let scan = ScanResult(selectedFolderName: result.selectedFolderName, preset: result.preset, applicationVersion: result.applicationVersion, engineVersion: result.engineVersion, startedAt: result.startedAt, completedAt: result.completedAt, inventory: entries, findings: [], overallStatus: .ready)

        XCTAssertEqual(
            try ChecksumManifestWriter().text(for: scan),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a.wav\n" +
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  z.wav\n"
        )
    }

    func testSucceededChecksumEvidenceIsAllOrError() throws {
        let result = try ReportFixture.result()
        let valid = InventoryEntry(
            relativePath: try RelativePath("safe.wav"),
            normalizedFilename: "safe.wav",
            normalizedExtension: "wav",
            category: .audio,
            kind: .regular,
            sha256: String(repeating: "a", count: 64)
        )
        let invalidEntries = [
            InventoryEntry(
                relativePath: try RelativePath("missing.wav"),
                normalizedFilename: "missing.wav",
                normalizedExtension: "wav",
                category: .audio,
                kind: .regular,
                checksumStatus: .succeeded
            ),
            InventoryEntry(
                relativePath: try RelativePath("malformed.wav"),
                normalizedFilename: "malformed.wav",
                normalizedExtension: "wav",
                category: .audio,
                kind: .regular,
                sha256: "not-a-sha256",
                checksumStatus: .succeeded
            ),
        ]

        for invalid in invalidEntries {
            let scan = ScanResult(
                selectedFolderName: result.selectedFolderName,
                preset: result.preset,
                applicationVersion: result.applicationVersion,
                engineVersion: result.engineVersion,
                startedAt: result.startedAt,
                inventory: [valid, invalid],
                findings: [],
                overallStatus: .ready
            )

            XCTAssertThrowsError(try ChecksumManifestWriter().text(for: scan)) { error in
                guard let error = error as? PreflightError else {
                    return XCTFail("Expected PreflightError, received \(error)")
                }
                guard case .exportFailed = error else {
                    return XCTFail("Expected exportFailed, received \(error)")
                }
            }
        }
    }

    func testManifestExcludesFailedAndNotCalculatedChecksumsByContract() throws {
        let result = try ReportFixture.result()
        let checksum = String(repeating: "b", count: 64)
        let entries = [
            InventoryEntry(
                relativePath: try RelativePath("included.wav"),
                normalizedFilename: "included.wav",
                normalizedExtension: "wav",
                category: .audio,
                kind: .regular,
                sha256: checksum,
                checksumStatus: .succeeded
            ),
            InventoryEntry(
                relativePath: try RelativePath("failed.wav"),
                normalizedFilename: "failed.wav",
                normalizedExtension: "wav",
                category: .audio,
                kind: .regular,
                sha256: checksum,
                checksumStatus: .failed
            ),
            InventoryEntry(
                relativePath: try RelativePath("not-calculated.wav"),
                normalizedFilename: "not-calculated.wav",
                normalizedExtension: "wav",
                category: .audio,
                kind: .regular,
                sha256: checksum,
                checksumStatus: .notCalculated
            ),
        ]
        let scan = ScanResult(
            selectedFolderName: result.selectedFolderName,
            preset: result.preset,
            applicationVersion: result.applicationVersion,
            engineVersion: result.engineVersion,
            startedAt: result.startedAt,
            inventory: entries,
            findings: [],
            overallStatus: .ready
        )

        XCTAssertEqual(
            try ChecksumManifestWriter().text(for: scan),
            "\(checksum)  included.wav\n"
        )
    }

    func testManifestExcludesServiceAndNonRegularEntriesEvenWithSucceededChecksums() throws {
        let result = try ReportFixture.result()
        let checksum = String(repeating: "c", count: 64)
        let entries = [
            InventoryEntry(
                relativePath: try RelativePath(".DS_Store"),
                normalizedFilename: ".ds_store",
                normalizedExtension: "",
                category: .serviceFile,
                kind: .regular,
                sha256: checksum,
                checksumStatus: .succeeded
            ),
            InventoryEntry(
                relativePath: try RelativePath("Folder"),
                normalizedFilename: "folder",
                normalizedExtension: "",
                category: .other,
                kind: .directory,
                sha256: checksum,
                checksumStatus: .succeeded
            ),
        ]
        let scan = ScanResult(
            selectedFolderName: result.selectedFolderName,
            preset: result.preset,
            applicationVersion: result.applicationVersion,
            engineVersion: result.engineVersion,
            startedAt: result.startedAt,
            inventory: entries,
            findings: [],
            overallStatus: .ready
        )

        XCTAssertEqual(try ChecksumManifestWriter().text(for: scan), "")
    }
}
