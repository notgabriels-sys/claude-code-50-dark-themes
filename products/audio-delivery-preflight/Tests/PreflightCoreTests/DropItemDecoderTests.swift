import Foundation
import XCTest
@testable import AudioDeliveryPreflightApp

final class DropItemDecoderTests: XCTestCase {
    func testFileProviderURLObjectDecodesToFileURL() {
        let expected = URL(fileURLWithPath: "/private/tmp/Drop Delivery", isDirectory: true)

        let decoded = DroppedFolderURLDecoder.decode(expected as NSURL)

        XCTAssertEqual(decoded, expected)
        XCTAssertEqual(decoded?.isFileURL, true)
    }

    func testFileProviderEncodedURLDataDecodesToFileURL() throws {
        let expected = URL(fileURLWithPath: "/private/tmp/Encoded Drop", isDirectory: true)
        let providerData = try XCTUnwrap(expected.dataRepresentation)

        let decoded = DroppedFolderURLDecoder.decode(providerData as NSData)

        XCTAssertEqual(decoded, expected)
        XCTAssertEqual(decoded?.isFileURL, true)
    }

    func testRemoteURLObjectIsRejected() {
        let item = NSURL(string: "https://example.com/delivery")!

        XCTAssertNil(DroppedFolderURLDecoder.decode(item))
    }

    func testRemoteURLDataIsRejected() throws {
        let remoteURL = try XCTUnwrap(URL(string: "https://example.com/delivery"))
        let providerData = try XCTUnwrap(remoteURL.dataRepresentation)

        XCTAssertNil(DroppedFolderURLDecoder.decode(providerData as NSData))
    }

    func testMalformedProviderDataIsRejected() {
        let malformedData = NSData(bytes: [0xFF, 0x00, 0x80], length: 3)

        XCTAssertNil(DroppedFolderURLDecoder.decode(malformedData))
    }

    func testUnexpectedSecureCodingObjectIsRejected() {
        let unexpectedItem = NSNumber(value: 42)

        XCTAssertNil(DroppedFolderURLDecoder.decode(unexpectedItem))
    }

    func testNilProviderItemIsRejected() {
        XCTAssertNil(DroppedFolderURLDecoder.decode(nil))
    }
}
