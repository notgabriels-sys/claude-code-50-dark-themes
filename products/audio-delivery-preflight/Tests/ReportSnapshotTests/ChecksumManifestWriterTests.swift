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
            ChecksumManifestWriter().text(for: scan),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a.wav\n" +
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  z.wav\n"
        )
    }

    func testManifestSkipsPathsWithLineBreaks() throws {
        let result = try ReportFixture.result()
        let entry = InventoryEntry(relativePath: try RelativePath("safe.wav"), normalizedFilename: "safe.wav", normalizedExtension: "wav", category: .audio, kind: .regular, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        let unsafe = InventoryEntry(relativePath: try RelativePath("unsafe\nname.wav"), normalizedFilename: "unsafe\nname.wav", normalizedExtension: "wav", category: .audio, kind: .regular, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        let scan = ScanResult(selectedFolderName: result.selectedFolderName, preset: result.preset, applicationVersion: result.applicationVersion, engineVersion: result.engineVersion, startedAt: result.startedAt, inventory: [unsafe, entry], findings: [], overallStatus: .ready)
        XCTAssertEqual(ChecksumManifestWriter().text(for: scan), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  safe.wav\n")
    }

    func testManifestRejectsDigestUnlessChecksumStatusSucceeded() throws {
        let result = try ReportFixture.result()
        let entry = InventoryEntry(
            relativePath: try RelativePath("stale.wav"),
            normalizedFilename: "stale.wav",
            normalizedExtension: "wav",
            category: .audio,
            kind: .regular,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            checksumStatus: .failed
        )
        let scan = ScanResult(
            selectedFolderName: result.selectedFolderName,
            preset: result.preset,
            applicationVersion: result.applicationVersion,
            engineVersion: result.engineVersion,
            startedAt: result.startedAt,
            inventory: [entry],
            findings: [],
            overallStatus: .ready
        )

        XCTAssertEqual(ChecksumManifestWriter().text(for: scan), "")
    }
}
