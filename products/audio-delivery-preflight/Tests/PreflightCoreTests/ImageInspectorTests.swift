import Foundation
import ImageIO
import XCTest
@testable import PreflightCore

final class ImageInspectorTests: XCTestCase {
    func testImageSourceSizeGateAcceptsExactly256MiBAndRejectsTheNextByte() throws {
        XCTAssertNoThrow(
            try TrustedFileAccess.validateSourceByteSize(
                ImageInspector.maximumStagingByteCount,
                maximumByteCount: ImageInspector.maximumStagingByteCount
            )
        )
        XCTAssertThrowsError(
            try TrustedFileAccess.validateSourceByteSize(
                ImageInspector.maximumStagingByteCount + 1,
                maximumByteCount: ImageInspector.maximumStagingByteCount
            )
        )
    }

    func testOversizedSparseImageIsRefusedBeforeCopyAndLeavesNoStagingFile() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.writeSparseFile(
            byteSize: UInt64(ImageInspector.maximumStagingByteCount) + 1,
            to: "Artwork/oversized.png"
        )
        let progress = InvocationRecorder()
        let inspector = fixture.imageInspector(
            onAfterCopyingChunk: { _, _ in progress.record() }
        )

        let outcome = try await inspector.inspect(source: fixture.source(path))

        XCTAssertEqual(progress.invocationCount, 0)
        XCTAssertEqual(outcome.status, InspectionStatus.failed)
        XCTAssertEqual(outcome.value?.isReadable, false)
        XCTAssertEqual(
            outcome.findings.first?.evidence,
            [Evidence(label: "isReadable", value: .boolean(false))]
        )
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }

    func testPixelLimitAcceptsExactlyOneHundredMillionAndRejectsTheNextPixel() throws {
        XCTAssertEqual(
            try ImageInspector.validatedPixelCount(width: 10_000, height: 10_000),
            100_000_000
        )
        XCTAssertThrowsError(
            try ImageInspector.validatedPixelCount(width: 100_000_001, height: 1)
        )
    }

    func testInvalidAndOverflowingImageDimensionsAreRejected() {
        XCTAssertThrowsError(try ImageInspector.validatedPixelCount(width: 0, height: 100))
        XCTAssertThrowsError(try ImageInspector.validatedPixelCount(width: 100, height: -1))
        XCTAssertThrowsError(try ImageInspector.validatedPixelCount(width: Int.max, height: 2))
        XCTAssertThrowsError(
            try ImageInspector.boundedProperties(
                from: [
                    kCGImagePropertyPixelWidth: NSNumber(value: UInt64.max),
                    kCGImagePropertyPixelHeight: NSNumber(value: 1),
                ],
                sourceType: "public.png",
                byteSize: 64
            )
        )
    }

    func testBoundedPropertiesLeaveAlphaUnknownWhenMetadataOmitsIt() throws {
        let properties = try ImageInspector.boundedProperties(
            from: [
                kCGImagePropertyPixelWidth: NSNumber(value: 640),
                kCGImagePropertyPixelHeight: NSNumber(value: 360),
                kCGImagePropertyColorModel: "RGB",
            ],
            sourceType: "public.example-image",
            byteSize: 1_024
        )

        XCTAssertEqual(properties.pixelWidth, 640)
        XCTAssertEqual(properties.pixelHeight, 360)
        XCTAssertNil(properties.hasAlpha)
        XCTAssertEqual(properties.isReadable, true)
    }

    func testPNGReportsDimensionsAndAlphaFromTrustedSource() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        let imageData = try Data(contentsOf: imageURL)
        let path = try fixture.write(imageData, to: "Artwork/cover.png")

        let outcome = try await fixture.imageInspector().inspect(source: fixture.source(path))
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

    func testJPEGReportsNonSquareDimensionsAndLeavesUnstatedAlphaUnknown() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.jpeg(width: 640, height: 360)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        let path = try fixture.write(Data(contentsOf: imageURL), to: "Artwork/cover.jpg")

        let outcome = try await fixture.imageInspector().inspect(source: fixture.source(path))
        let properties = try XCTUnwrap(outcome.value)

        XCTAssertEqual(outcome.status, .succeeded)
        XCTAssertEqual(properties.pixelWidth, 640)
        XCTAssertEqual(properties.pixelHeight, 360)
        XCTAssertEqual(try XCTUnwrap(properties.aspectRatio), 640.0 / 360.0, accuracy: 0.0001)
        XCTAssertEqual(properties.format, "public.jpeg")
        XCTAssertNil(properties.hasAlpha)
    }

    func testUnreadableImageProducesEvidenceBackedFailure() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let path = try fixture.write(Data("not image".utf8), to: "Artwork/cover.png")

        let outcome = try await fixture.imageInspector().inspect(source: fixture.source(path))

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
        let inspector = fixture.imageInspector(onBeforeOpeningPathComponent: { relativePath, componentIndex in
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
        let inspector = fixture.imageInspector(onBeforeOpeningPathComponent: { relativePath, componentIndex in
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
        let inspector = fixture.imageInspector(
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

    func testCancellationAfterStagingPropagatesAndCleansStaging() async throws {
        let fixture = try InspectionFixture.make()
        defer { fixture.remove() }
        let imageURL = try FixtureFactory.png(width: 300, height: 300, alpha: true)
        defer { try? FileManager.default.removeItem(at: imageURL) }
        let path = try fixture.write(Data(contentsOf: imageURL), to: "Artwork/cancellable.png")
        let gate = ImageInspectionStageGate()
        let inspector = fixture.imageInspector(
            onAfterStaging: {
                gate.blockUntilReleased()
            }
        )

        let task = Task { () -> Bool in
            do {
                _ = try await inspector.inspect(source: fixture.source(path))
                return false
            } catch is CancellationError {
                return true
            } catch {
                return false
            }
        }
        await fulfillment(of: [gate.stagingCompleted], timeout: 2)
        XCTAssertEqual(try fixture.stagingFiles().count, 1)
        task.cancel()
        gate.release()
        let didPropagateCancellation = await task.value

        XCTAssertTrue(didPropagateCancellation)
        XCTAssertEqual(try fixture.stagingFiles(), [])
    }
}

private final class ImageInspectionStageGate: @unchecked Sendable {
    let stagingCompleted = XCTestExpectation(description: "image staging completed")
    private let released = DispatchSemaphore(value: 0)

    func blockUntilReleased() {
        stagingCompleted.fulfill()
        released.wait()
    }

    func release() {
        released.signal()
    }
}
