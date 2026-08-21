import Foundation
import XCTest
@testable import PreflightCore

final class ImageInspectorTests: XCTestCase {
    func testPNGReportsDimensionsAndAlphaFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        let imageData = try Data(contentsOf: imageURL)
        let path = try fixture.write(imageData, to: "Artwork/cover.png")

        let outcome = try await ImageInspector().inspect(source: fixture.source(path))
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.pixelWidth, 300)
        XCTAssertEqual(properties.pixelHeight, 300)
        XCTAssertEqual(properties.aspectRatio, 1)
        XCTAssertEqual(properties.format, "public.png")
        XCTAssertEqual(properties.colorModel, "RGB")
        XCTAssertEqual(properties.hasAlpha, true)
        XCTAssertEqual(properties.byteSize, Int64(imageData.count))
    }

    func testJPEGReportsNonSquareDimensionsAndNoAlphaFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.jpeg(width: 640, height: 360)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        let path = try fixture.write(Data(contentsOf: imageURL), to: "Artwork/cover.jpg")

        let outcome = try await ImageInspector().inspect(source: fixture.source(path))
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.pixelWidth, 640)
        XCTAssertEqual(properties.pixelHeight, 360)
        XCTAssertEqual(try XCTUnwrap(properties.aspectRatio), 640.0 / 360.0, accuracy: 0.0001)
        XCTAssertEqual(properties.format, "public.jpeg")
        XCTAssertEqual(properties.hasAlpha, false)
    }

    func testUnreadableImageProducesEvidenceBackedFailure() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(Data("not image".utf8), to: "Artwork/cover.png")

        let outcome = try await ImageInspector().inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[path]])
    }

    func testSwappedLeafCannotCauseExternalImageToBeInspected() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        let externalImageURL = try FixtureFactory.png(width: 640, height: 360, alpha: true)
        defer {
            try? FileManager.default.removeItem(at: imageURL)
            try? FileManager.default.removeItem(at: externalImageURL)
        }
        let path = try fixture.write(Data(contentsOf: imageURL), to: "Artwork/cover.png")
        let externalURL = try fixture.writeExternal(Data(contentsOf: externalImageURL), to: "sentinel.png")
        let inspector = ImageInspector(onBeforeOpeningPathComponent: { relativePath, componentIndex in
            guard relativePath == path, componentIndex == 1 else { return }
            try? fixture.replaceLeaf(path, with: externalURL)
        })

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[path]])
    }

    func testSwappedAncestorCannotCauseExternalImageToBeInspected() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        let path = try fixture.write(Data(contentsOf: imageURL), to: "Masters/cover.png")
        _ = try fixture.writeExternal(Data(contentsOf: imageURL), to: "cover.png")
        let inspector = ImageInspector(onBeforeOpeningPathComponent: { relativePath, componentIndex in
            guard relativePath == path, componentIndex == 0 else { return }
            try? fixture.replaceFirstAncestor(with: fixture.externalRoot)
        })

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(outcome.findings.map(\.affectedPaths), [[path]])
    }

    func testGrowingImageSourceIsRejectedWithoutCopyingBeyondInitialSnapshot() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        var originalData = try Data(contentsOf: imageURL)
        originalData.append(Data(repeating: 0, count: 128 * 1_024))
        let path = try fixture.write(originalData, to: "Artwork/growing.png")
        let mutation = OneShotMutation()
        let progress = CopyProgressRecorder()
        let appendedData = Data(repeating: 0xA5, count: 32 * 1_024)
        let inspector = ImageInspector(
            stagingDirectory: fixture.stagingDirectory,
            onAfterCopyingChunk: { relativePath, copiedByteCount in
                guard relativePath == path else { return }
                progress.record(copiedByteCount)
                mutation.perform {
                    try fixture.append(appendedData, to: path)
                }
            }
        )

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertTrue(mutation.didPerform)
        XCTAssertNil(mutation.error)
        XCTAssertEqual(progress.maximumByteCount, Int64(originalData.count))
        XCTAssertEqual(try fixture.byteSize(of: path), Int64(originalData.count + appendedData.count))
        XCTAssertEqual(outcome.status, .failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }
}
