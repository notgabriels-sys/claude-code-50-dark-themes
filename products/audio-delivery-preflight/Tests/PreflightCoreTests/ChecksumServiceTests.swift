import Foundation
import XCTest
@testable import PreflightCore

final class ChecksumServiceTests: XCTestCase {
    func testSHA256OfABCMatchesKnownDigest() async throws {
        let fixture = try TemporaryChecksumFixture.make()
        defer { fixture.remove() }
        let url = try fixture.write("abc", to: "abc.txt")

        let digest = try await ChecksumService().sha256(for: url)

        XCTAssertEqual(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    func testSameContentFilesGroupDespiteDifferentNames() async throws {
        let fixture = try TemporaryChecksumFixture.make()
        defer { fixture.remove() }
        _ = try fixture.write("same bytes", to: "Masters/one.wav")
        _ = try fixture.write("same bytes", to: "Masters/two.wav")

        let inventory = try await FileInventory().inventory(root: fixture.root)
        let checksummed = await ChecksumService().checksummedInventory(entries: inventory.entries, root: fixture.root)
        let groups = ChecksumService().duplicateGroups(entries: checksummed.entries)

        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].paths.map(\.value), ["Masters/one.wav", "Masters/two.wav"])
    }

    func testDifferentBytesDoNotGroup() async throws {
        let fixture = try TemporaryChecksumFixture.make()
        defer { fixture.remove() }
        _ = try fixture.write("first", to: "Masters/one.wav")
        _ = try fixture.write("second", to: "Masters/two.wav")

        let inventory = try await FileInventory().inventory(root: fixture.root)
        let checksummed = await ChecksumService().checksummedInventory(entries: inventory.entries, root: fixture.root)

        XCTAssertTrue(ChecksumService().duplicateGroups(entries: checksummed.entries).isEmpty)
    }

    func testServiceFilesAreExcludedFromDuplicateGroups() throws {
        let digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        let entries = [
            try inventoryEntry(path: ".DS_Store", category: .serviceFile, sha256: digest),
            try inventoryEntry(path: "Masters/Track.wav", category: .audio, sha256: digest),
        ]

        XCTAssertTrue(ChecksumService().duplicateGroups(entries: entries).isEmpty)
    }

    func testFailedChecksumIsExcludedFromDuplicateGroups() throws {
        let digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        let entries = [
            try inventoryEntry(path: "Masters/one.wav", category: .audio, sha256: digest, inspectionStatus: .succeeded),
            try inventoryEntry(path: "Masters/two.wav", category: .audio, sha256: digest, inspectionStatus: .failed),
        ]

        XCTAssertTrue(ChecksumService().duplicateGroups(entries: entries).isEmpty)
    }

    func testReadFailureLeavesChecksumUnknownAndProducesFinding() async throws {
        let fixture = try TemporaryChecksumFixture.make()
        defer { fixture.remove() }
        let missingEntry = try inventoryEntry(path: "Masters/missing.wav", category: .audio)

        let snapshot = await ChecksumService().checksummedInventory(entries: [missingEntry], root: fixture.root)

        XCTAssertNil(snapshot.entries[0].sha256)
        XCTAssertEqual(snapshot.entries[0].inspectionStatus, .failed)
        XCTAssertTrue(snapshot.findings.contains { $0.ruleID == "checksum.read-failed" })
    }

    private func inventoryEntry(
        path: String,
        category: FileCategory,
        sha256: String? = nil,
        inspectionStatus: InspectionStatus = .notInspected
    ) throws -> InventoryEntry {
        InventoryEntry(
            relativePath: try RelativePath(path),
            normalizedFilename: URL(fileURLWithPath: path).lastPathComponent.lowercased(),
            normalizedExtension: URL(fileURLWithPath: path).pathExtension.lowercased(),
            category: category,
            kind: .regular,
            sha256: sha256,
            inspectionStatus: inspectionStatus
        )
    }
}

private final class TemporaryChecksumFixture {
    let root: URL

    private init(root: URL) {
        self.root = root
    }

    static func make() throws -> TemporaryChecksumFixture {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ChecksumServiceTests-\\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return TemporaryChecksumFixture(root: root)
    }

    func write(_ contents: String, to relativePath: String) throws -> URL {
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(contents.utf8).write(to: url)
        return url
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
    }
}
