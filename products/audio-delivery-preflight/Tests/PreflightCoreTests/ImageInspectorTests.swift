import XCTest
@testable import PreflightCore

final class ImageInspectorTests: XCTestCase {
    func testPNGReportsDimensionsAndAlpha() throws {
        let url = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = ImageInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.pixelWidth, 300)
        XCTAssertEqual(properties.pixelHeight, 300)
        XCTAssertEqual(properties.aspectRatio, 1)
        XCTAssertEqual(properties.format, "public.png")
        XCTAssertEqual(properties.colorModel, "RGB")
        XCTAssertEqual(properties.hasAlpha, true)
        XCTAssertEqual(properties.isReadable, true)
        XCTAssertEqual(properties.byteSize, try fileSize(at: url))
    }

    func testJPEGReportsNonSquareDimensionsAndNoAlpha() throws {
        let url = try FixtureFactory.jpeg(width: 640, height: 360)
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = ImageInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)
        let aspectRatio = try XCTUnwrap(properties.aspectRatio)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.pixelWidth, 640)
        XCTAssertEqual(properties.pixelHeight, 360)
        XCTAssertEqual(aspectRatio, 640.0 / 360.0, accuracy: 0.0001)
        XCTAssertEqual(properties.format, "public.jpeg")
        XCTAssertEqual(properties.hasAlpha, false)
        XCTAssertEqual(properties.isReadable, true)
        XCTAssertEqual(properties.byteSize, try fileSize(at: url))
    }

    func testUnreadableImageProducesEvidenceBackedFailure() throws {
        let url = try FixtureFactory.text(pathExtension: "png")
        defer { try? FileManager.default.removeItem(at: url) }

        let outcome = ImageInspector().inspect(url: url)
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(properties.isReadable, false)
        XCTAssertTrue(outcome.findings.contains { $0.ruleID == "image.unreadable" })
        XCTAssertTrue(outcome.findings.allSatisfy { !$0.explanation.contains(url.path) })
    }

    func testSymbolicLinkIsRejectedWithoutInspectingTarget() throws {
        let targetURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        let linkURL = try FixtureFactory.symbolicLink(to: targetURL, pathExtension: "png")
        defer {
            try? FileManager.default.removeItem(at: linkURL)
            try? FileManager.default.removeItem(at: targetURL)
        }

        let outcome = ImageInspector().inspect(url: linkURL)
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(properties.isReadable, false)
        XCTAssertTrue(outcome.findings.contains { $0.ruleID == "image.unreadable" })
    }

    private func fileSize(at url: URL) throws -> Int64 {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return try XCTUnwrap(attributes[.size] as? NSNumber).int64Value
    }
}
