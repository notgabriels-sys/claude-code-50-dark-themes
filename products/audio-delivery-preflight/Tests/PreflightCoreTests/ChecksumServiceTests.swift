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
        let checksummed = try await ChecksumService().checksummedInventory(entries: inventory.entries, root: fixture.root)
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
        let checksummed = try await ChecksumService().checksummedInventory(entries: inventory.entries, root: fixture.root)

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

        let snapshot = try await ChecksumService().checksummedInventory(entries: [missingEntry], root: fixture.root)

        XCTAssertNil(snapshot.entries[0].sha256)
        XCTAssertEqual(snapshot.entries[0].inspectionStatus, .failed)
        let finding = try XCTUnwrap(snapshot.findings.first { $0.ruleID == "checksum.read-failed" })
        XCTAssertEqual(finding.explanation, "The regular file could not be read safely.")
        XCTAssertFalse(finding.explanation.contains(fixture.root.path))
    }

    func testAncestorSymlinkSwapAtOpenBoundaryLeavesChecksumUnknownAndRedactsPaths() async throws {
        let fixture = try TemporaryChecksumFixture.make()
        defer { fixture.remove() }
        _ = try fixture.write("master", to: "Masters/Track.wav")
        let externalSentinel = try fixture.createExternalSentinel(contents: "PRIVATE")
        let inventory = try await FileInventory().inventory(root: fixture.root)
        let swap = ChecksumAncestorSwap(fixture: fixture)
        let service = ChecksumService(onBeforeOpeningPathComponent: { relativePath, componentIndex in
            swap.replaceAncestorWithEscapingSymlink(for: relativePath, at: componentIndex)
        })

        let snapshot = try await service.checksummedInventory(entries: inventory.entries, root: fixture.root)

        XCTAssertTrue(swap.didSwap)
        XCTAssertNil(swap.error)
        let entry = try XCTUnwrap(snapshot.entries.first { $0.relativePath.value == "Masters/Track.wav" })
        XCTAssertNil(entry.sha256)
        XCTAssertEqual(entry.inspectionStatus, .failed)
        let finding = try XCTUnwrap(snapshot.findings.first { $0.ruleID == "checksum.read-failed" })
        XCTAssertFalse(finding.explanation.contains(fixture.root.path))
        XCTAssertFalse(finding.explanation.contains(externalSentinel.path))
    }

    func testCancellationDuringChecksumPropagatesCancellationInsteadOfReadFailure() async throws {
        let fixture = try TemporaryChecksumFixture.make()
        defer { fixture.remove() }
        _ = try fixture.write(Data(repeating: 0xA5, count: 128 * 1024), to: "Masters/Track.wav")
        let inventory = try await FileInventory().inventory(root: fixture.root)
        let gate = ChecksumReadGate()
        let service = ChecksumService(onBeforeReadingChunk: {
            gate.blockUntilReleased()
        })
        let entries = inventory.entries
        let root = fixture.root

        let task = Task { () -> Bool in
            do {
                _ = try await service.checksummedInventory(entries: entries, root: root)
                return false
            } catch is CancellationError {
                return true
            } catch {
                return false
            }
        }
        await fulfillment(of: [gate.readStarted], timeout: 2)
        task.cancel()
        gate.release()
        let didPropagateCancellation = await task.value

        XCTAssertTrue(didPropagateCancellation)
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
    private let externalRoot: URL

    private init(root: URL, externalRoot: URL) {
        self.root = root
        self.externalRoot = externalRoot
    }

    static func make() throws -> TemporaryChecksumFixture {
        let temporaryDirectory = FileManager.default.temporaryDirectory
        let root = temporaryDirectory
            .appendingPathComponent("ChecksumServiceTests-\\(UUID().uuidString)", isDirectory: true)
        let externalRoot = temporaryDirectory
            .appendingPathComponent("ChecksumServiceExternal-\\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
        return TemporaryChecksumFixture(root: root, externalRoot: externalRoot)
    }

    func write(_ contents: String, to relativePath: String) throws -> URL {
        try write(Data(contents.utf8), to: relativePath)
    }

    func write(_ contents: Data, to relativePath: String) throws -> URL {
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try contents.write(to: url)
        return url
    }

    func createExternalSentinel(contents: String) throws -> URL {
        let sentinel = externalRoot.appendingPathComponent("sentinel.txt")
        try Data(contents.utf8).write(to: sentinel)
        return sentinel
    }

    func replaceDirectoryWithEscapingSymlink(_ relativePath: String) throws {
        let directory = root.appendingPathComponent(relativePath)
        try FileManager.default.removeItem(at: directory)
        try FileManager.default.createSymbolicLink(at: directory, withDestinationURL: externalRoot)
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: externalRoot)
    }
}

private final class ChecksumReadGate: @unchecked Sendable {
    let readStarted = XCTestExpectation(description: "checksum read started")
    private let released = DispatchSemaphore(value: 0)

    func blockUntilReleased() {
        readStarted.fulfill()
        released.wait()
    }

    func release() {
        released.signal()
    }
}

private final class ChecksumAncestorSwap: @unchecked Sendable {
    private let fixture: TemporaryChecksumFixture
    private(set) var didSwap = false
    private(set) var error: Error?

    init(fixture: TemporaryChecksumFixture) {
        self.fixture = fixture
    }

    func replaceAncestorWithEscapingSymlink(for relativePath: RelativePath, at componentIndex: Int) {
        guard relativePath.value == "Masters/Track.wav", componentIndex == 0, !didSwap else {
            return
        }

        do {
            try fixture.replaceDirectoryWithEscapingSymlink("Masters")
            didSwap = true
        } catch {
            self.error = error
        }
    }
}
