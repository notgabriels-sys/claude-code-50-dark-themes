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
        try fixture.createExternalSentinel(contents: "PRIVATE")
        try fixture.createEscapingSymlink(named: "outside.wav")

        let snapshot = try await FileInventory().inventory(root: fixture.root)

        XCTAssertEqual(snapshot.entries.first { $0.relativePath.value == "outside.wav" }?.kind, .symbolicLink)
        XCTAssertFalse(snapshot.entries.contains { $0.sha256 != nil })
        XCTAssertTrue(snapshot.findings.contains { $0.ruleID == "filesystem.symlink-not-followed" })
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

    func createExternalSentinel(contents: String) throws {
        try Data(contents.utf8).write(to: externalRoot.appendingPathComponent("sentinel.txt"))
    }

    func createEscapingSymlink(named name: String) throws {
        try FileManager.default.createSymbolicLink(
            at: root.appendingPathComponent(name),
            withDestinationURL: externalRoot.appendingPathComponent("sentinel.txt")
        )
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
