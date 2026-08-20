import Darwin
import Foundation
import XCTest
@testable import PreflightCore

final class FileInventoryTests: XCTestCase {
    func testNestedFilesUseRelativePathsInUnicodeScalarOrder() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        try fixture.write("artwork", to: "Artwork/cover.png")
        try fixture.write("master", to: "Masters/Track.wav")
        try fixture.write("notes", to: "Notes.txt")

        let snapshot = try await FileInventory().inventory(root: fixture.root)

        XCTAssertEqual(
            snapshot.entries.filter { $0.kind == .regular }.map(\.relativePath.value),
            ["Artwork/cover.png", "Masters/Track.wav", "Notes.txt"]
        )
    }

    func testDSStoreIsClassifiedAsAServiceFile() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        try fixture.write("metadata", to: ".DS_Store")

        let snapshot = try await FileInventory().inventory(root: fixture.root)

        XCTAssertEqual(snapshot.entries.first?.category, .serviceFile)
    }

    func testSymlinkOutsideRootIsRecordedAndNotFollowed() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        let externalSentinel = try fixture.createExternalSentinel(contents: "PRIVATE")
        try fixture.createEscapingSymlink(named: "outside.wav")

        let snapshot = try await FileInventory().inventory(root: fixture.root)

        XCTAssertEqual(snapshot.entries.first { $0.relativePath.value == "outside.wav" }?.kind, .symbolicLink)
        XCTAssertFalse(snapshot.entries.contains { $0.relativePath.value == "outside.wav/sentinel.txt" })
        XCTAssertFalse(snapshot.entries.contains { $0.sha256 != nil })
        XCTAssertTrue(snapshot.findings.contains { $0.ruleID == "filesystem.symlink-not-followed" })
        for finding in snapshot.findings {
            XCTAssertFalse(finding.explanation.contains(fixture.root.path))
            XCTAssertFalse(finding.explanation.contains(externalSentinel.path))
        }
    }

    func testSymlinkRootIsRejectedBeforeEnumeration() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        _ = try fixture.createExternalSentinel(contents: "PRIVATE")
        let suppliedRoot = try fixture.createEscapingRootSymlink(named: "selected-root")
        defer { try? FileManager.default.removeItem(at: suppliedRoot) }

        do {
            _ = try await FileInventory().inventory(root: suppliedRoot)
            XCTFail("A symbolic-link root must be rejected before enumeration.")
        } catch let error as PreflightError {
            XCTAssertEqual(
                error,
                .invalidScanRequest(reason: "The selected inventory root must not be a symbolic link.")
            )
        }
    }

    func testSpecialEntriesBecomeFindingsWithoutStoppingInventory() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        try fixture.createFIFO(named: "stream.pipe")
        try fixture.write("master", to: "Masters/Track.wav")

        let snapshot = try await FileInventory().inventory(root: fixture.root)

        XCTAssertEqual(snapshot.entries.first { $0.relativePath.value == "stream.pipe" }?.kind, .special)
        XCTAssertTrue(snapshot.findings.contains { $0.ruleID == "filesystem.special-entry" })
        XCTAssertTrue(snapshot.entries.contains { $0.relativePath.value == "Masters/Track.wav" })
    }

    func testUnreadableRegularFileBecomesFindingWithoutStoppingInventory() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        try fixture.write("restricted", to: "Masters/restricted.wav")
        try fixture.makeUnreadable("Masters/restricted.wav")
        try fixture.write("accessible", to: "Masters/accessible.wav")

        let snapshot = try await FileInventory().inventory(root: fixture.root)

        XCTAssertTrue(snapshot.findings.contains { $0.ruleID == "filesystem.unreadable-entry" })
        XCTAssertTrue(snapshot.entries.contains { $0.relativePath.value == "Masters/accessible.wav" })
    }

    func testCancellationDuringEnumerationPropagatesCancellation() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        try fixture.write("one", to: "Masters/one.wav")
        try fixture.write("two", to: "Masters/two.wav")
        let gate = InventoryEnumerationGate()
        let inventory = FileInventory(onBeforeEnumeratingEntry: {
            gate.blockUntilReleased()
        })
        let root = fixture.root

        let task = Task { () -> Bool in
            do {
                _ = try await inventory.inventory(root: root)
                return false
            } catch is CancellationError {
                return true
            } catch {
                return false
            }
        }
        await fulfillment(of: [gate.entryStarted], timeout: 2)
        task.cancel()
        gate.release()

        let didPropagateCancellation = await task.value
        XCTAssertTrue(didPropagateCancellation)
    }
}

private final class InventoryEnumerationGate: @unchecked Sendable {
    let entryStarted = XCTestExpectation(description: "inventory entry started")
    private let released = DispatchSemaphore(value: 0)

    func blockUntilReleased() {
        entryStarted.fulfill()
        released.wait()
    }

    func release() {
        released.signal()
    }
}

private final class TemporaryInventoryFixture {
    let root: URL
    private let externalRoot: URL

    private init(root: URL, externalRoot: URL) {
        self.root = root
        self.externalRoot = externalRoot
    }

    static func make() throws -> TemporaryInventoryFixture {
        let temporaryDirectory = FileManager.default.temporaryDirectory
        let root = temporaryDirectory.appendingPathComponent("FileInventoryTests-\\(UUID().uuidString)", isDirectory: true)
        let externalRoot = temporaryDirectory.appendingPathComponent("FileInventoryExternal-\\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
        return TemporaryInventoryFixture(root: root, externalRoot: externalRoot)
    }

    func write(_ contents: String, to relativePath: String) throws {
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(contents.utf8).write(to: url)
    }

    @discardableResult
    func createExternalSentinel(contents: String) throws -> URL {
        let sentinel = externalRoot.appendingPathComponent("sentinel.txt")
        try Data(contents.utf8).write(to: sentinel)
        return sentinel
    }

    func createEscapingSymlink(named name: String) throws {
        try FileManager.default.createSymbolicLink(
            at: root.appendingPathComponent(name),
            withDestinationURL: externalRoot
        )
    }

    func createEscapingRootSymlink(named name: String) throws -> URL {
        let symlink = root.deletingLastPathComponent().appendingPathComponent(name)
        try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: externalRoot)
        return symlink
    }

    func createFIFO(named name: String) throws {
        let result = mkfifo(root.appendingPathComponent(name).path, 0o644)
        guard result == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EINVAL)
        }
    }

    func makeUnreadable(_ relativePath: String) throws {
        try FileManager.default.setAttributes(
            [.posixPermissions: 0],
            ofItemAtPath: root.appendingPathComponent(relativePath).path
        )
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: externalRoot)
    }
}
