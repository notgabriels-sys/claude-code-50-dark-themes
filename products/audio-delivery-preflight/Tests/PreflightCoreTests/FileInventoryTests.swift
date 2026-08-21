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

    func testRootSwapBeforeDescriptorOpenIsRejectedWithoutEnumeratingExternalContent() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        let externalSentinel = try fixture.createExternalSentinel(contents: "PRIVATE ROOT")
        let swap = InventoryPathSwap()
        let inventory = FileInventory(onBeforeOpeningRootPathComponent: { component, _ in
            guard component == fixture.root.lastPathComponent else { return }
            swap.perform { try fixture.replaceRootWithEscapingSymlink() }
        })

        do {
            _ = try await inventory.inventory(root: fixture.root)
            XCTFail("A root swapped to a symbolic link must be rejected.")
        } catch let error as PreflightError {
            XCTAssertTrue(swap.didPerform)
            XCTAssertNil(swap.error)
            XCTAssertFalse(String(describing: error).contains(externalSentinel.path))
        }
    }

    func testAncestorSwapBeforeDescriptorOpenIsRejectedWithoutEnumeratingExternalContent() async throws {
        let fixture = try TemporaryInventoryFixture.make()
        defer { fixture.remove() }
        let externalSentinel = try fixture.createExternalSentinel(contents: "PRIVATE ANCESTOR")
        try fixture.prepareExternalSelectedDirectory()
        let swap = InventoryPathSwap()
        let ancestorName = fixture.root.deletingLastPathComponent().lastPathComponent
        let inventory = FileInventory(onBeforeOpeningRootPathComponent: { component, _ in
            guard component == ancestorName else { return }
            swap.perform { try fixture.replaceAncestorWithEscapingSymlink() }
        })

        do {
            _ = try await inventory.inventory(root: fixture.root)
            XCTFail("A root ancestor swapped to a symbolic link must be rejected.")
        } catch let error as PreflightError {
            XCTAssertTrue(swap.didPerform)
            XCTAssertNil(swap.error)
            XCTAssertFalse(String(describing: error).contains(externalSentinel.path))
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

private final class InventoryPathSwap: @unchecked Sendable {
    private let lock = NSLock()
    private var performed = false
    private var storedError: Error?

    var didPerform: Bool {
        lock.lock()
        defer { lock.unlock() }
        return performed
    }

    var error: Error? {
        lock.lock()
        defer { lock.unlock() }
        return storedError
    }

    func perform(_ operation: () throws -> Void) {
        lock.lock()
        guard !performed else {
            lock.unlock()
            return
        }
        performed = true
        lock.unlock()

        do {
            try operation()
        } catch {
            lock.lock()
            storedError = error
            lock.unlock()
        }
    }
}

private final class TemporaryInventoryFixture: @unchecked Sendable {
    let root: URL
    private let externalRoot: URL
    private let containerRoot: URL

    private init(root: URL, externalRoot: URL, containerRoot: URL) {
        self.root = root
        self.externalRoot = externalRoot
        self.containerRoot = containerRoot
    }

    static func make() throws -> TemporaryInventoryFixture {
        let temporaryDirectory = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
        let containerRoot = temporaryDirectory.appendingPathComponent("FileInventoryTests-\(UUID().uuidString)", isDirectory: true)
        let root = containerRoot.appendingPathComponent("ancestor/selected", isDirectory: true)
        let externalRoot = temporaryDirectory.appendingPathComponent("FileInventoryExternal-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
        return TemporaryInventoryFixture(root: root, externalRoot: externalRoot, containerRoot: containerRoot)
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
        let symlink = containerRoot.appendingPathComponent(name)
        try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: externalRoot)
        return symlink
    }

    func prepareExternalSelectedDirectory() throws {
        let selected = externalRoot.appendingPathComponent(root.lastPathComponent, isDirectory: true)
        try FileManager.default.createDirectory(at: selected, withIntermediateDirectories: true)
        try Data("PRIVATE ANCESTOR CHILD".utf8).write(to: selected.appendingPathComponent("sentinel.txt"))
    }

    func replaceRootWithEscapingSymlink() throws {
        let backup = root.deletingLastPathComponent().appendingPathComponent("selected-original", isDirectory: true)
        try FileManager.default.moveItem(at: root, to: backup)
        try FileManager.default.createSymbolicLink(at: root, withDestinationURL: externalRoot)
    }

    func replaceAncestorWithEscapingSymlink() throws {
        let ancestor = root.deletingLastPathComponent()
        let backup = containerRoot.appendingPathComponent("ancestor-original", isDirectory: true)
        try FileManager.default.moveItem(at: ancestor, to: backup)
        try FileManager.default.createSymbolicLink(at: ancestor, withDestinationURL: externalRoot)
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
        try? FileManager.default.removeItem(at: containerRoot)
        try? FileManager.default.removeItem(at: externalRoot)
    }
}
