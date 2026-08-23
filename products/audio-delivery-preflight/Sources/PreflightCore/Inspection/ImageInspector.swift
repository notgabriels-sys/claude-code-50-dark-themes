import CoreGraphics
import Foundation
import ImageIO

public protocol ImageInspecting: Sendable {
    func inspect(source: TrustedMediaSource) async throws -> InspectionOutcome<ImageProperties>
}

public struct ImageInspector: ImageInspecting {
    static let maximumStagingByteCount: Int64 = 256 * 1_024 * 1_024
    static let maximumPixelCount = 100_000_000

    private let stagingDirectory: URL
    private let availableByteCountProvider: TrustedFileAccess.AvailableByteCountProvider?
    private let onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook?
    private let onAfterCopyingChunk: TrustedFileAccess.CopyProgressHook?
    private let onAfterStaging: (@Sendable () -> Void)?

    public init() {
        self.stagingDirectory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        self.availableByteCountProvider = nil
        self.onBeforeOpeningPathComponent = nil
        self.onAfterCopyingChunk = nil
        self.onAfterStaging = nil
    }

    init(onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook?) {
        self.stagingDirectory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        self.availableByteCountProvider = nil
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
        self.onAfterCopyingChunk = nil
        self.onAfterStaging = nil
    }

    init(
        stagingDirectory: URL,
        availableByteCountProvider: TrustedFileAccess.AvailableByteCountProvider? = nil,
        onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook? = nil,
        onAfterCopyingChunk: TrustedFileAccess.CopyProgressHook? = nil,
        onAfterStaging: (@Sendable () -> Void)? = nil
    ) {
        self.stagingDirectory = stagingDirectory
        self.availableByteCountProvider = availableByteCountProvider
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
        self.onAfterCopyingChunk = onAfterCopyingChunk
        self.onAfterStaging = onAfterStaging
    }

    public func inspect(source: TrustedMediaSource) async throws -> InspectionOutcome<ImageProperties> {
        let snapshot: TrustedFileSnapshot
        do {
            try Task.checkCancellation()
            snapshot = try TrustedFileAccess.stageRegularFile(
                source: source,
                in: stagingDirectory,
                maximumByteCount: Self.maximumStagingByteCount,
                availableByteCountProvider: availableByteCountProvider,
                onBeforeOpeningPathComponent: onBeforeOpeningPathComponent,
                onAfterCopyingChunk: onAfterCopyingChunk
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch TrustedFileAccessError.insufficientStagingCapacity {
            return Self.insufficientStagingCapacityOutcome(path: source.relativePath)
        } catch {
            return Self.unreadableOutcome(path: source.relativePath)
        }
        defer { try? FileManager.default.removeItem(at: snapshot.stagingURL) }

        onAfterStaging?()
        try Task.checkCancellation()
        let imageSourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let imageSource = CGImageSourceCreateWithURL(
            snapshot.stagingURL as CFURL,
            imageSourceOptions
        ) else {
            return Self.unreadableOutcome(path: source.relativePath)
        }
        try Task.checkCancellation()
        guard let sourceType = CGImageSourceGetType(imageSource) else {
            return Self.unreadableOutcome(path: source.relativePath)
        }
        try Task.checkCancellation()
        guard let properties = CGImageSourceCopyPropertiesAtIndex(
            imageSource,
            0,
            imageSourceOptions
        ) as? [CFString: Any] else {
            return Self.unreadableOutcome(path: source.relativePath)
        }
        try Task.checkCancellation()

        let boundedProperties: ImageProperties
        do {
            boundedProperties = try Self.boundedProperties(
                from: properties,
                sourceType: sourceType as String,
                byteSize: snapshot.byteSize
            )
        } catch {
            return Self.unreadableOutcome(path: source.relativePath)
        }
        try Task.checkCancellation()

        return InspectionOutcome(
            status: .succeeded,
            value: boundedProperties,
            findings: []
        )
    }

    static func validatedPixelCount(width: Int, height: Int) throws -> Int {
        guard width > 0, height > 0 else {
            throw ImageInspectionError.invalidDimensions
        }
        let (pixelCount, overflow) = width.multipliedReportingOverflow(by: height)
        guard !overflow else {
            throw ImageInspectionError.pixelCountOverflow
        }
        guard pixelCount <= maximumPixelCount else {
            throw ImageInspectionError.pixelLimitExceeded
        }
        return pixelCount
    }

    static func boundedProperties(
        from properties: [CFString: Any],
        sourceType: String,
        byteSize: Int64
    ) throws -> ImageProperties {
        let width = try positiveDimension(from: properties[kCGImagePropertyPixelWidth])
        let height = try positiveDimension(from: properties[kCGImagePropertyPixelHeight])
        _ = try validatedPixelCount(width: width, height: height)

        return ImageProperties(
            pixelWidth: width,
            pixelHeight: height,
            aspectRatio: Double(width) / Double(height),
            format: sourceType,
            colorModel: properties[kCGImagePropertyColorModel] as? String,
            hasAlpha: (properties[kCGImagePropertyHasAlpha] as? NSNumber)?.boolValue,
            byteSize: byteSize,
            isReadable: true
        )
    }

    private static func positiveDimension(from value: Any?) throws -> Int {
        guard let number = value as? NSNumber else {
            throw ImageInspectionError.invalidDimensions
        }
        let int64Value = number.int64Value
        guard int64Value > 0,
              number.doubleValue.isFinite,
              number.doubleValue == Double(int64Value),
              let dimension = Int(exactly: int64Value)
        else {
            throw ImageInspectionError.invalidDimensions
        }
        return dimension
    }

    private static func unreadableOutcome(path: RelativePath) -> InspectionOutcome<ImageProperties> {
        InspectionOutcome(
            status: .failed,
            value: ImageProperties(isReadable: false),
            findings: [
                Finding(
                    ruleID: "inspection.image-unreadable",
                    severity: .error,
                    title: "Image file could not be read",
                    explanation: "The selected image file could not be read safely.",
                    affectedPaths: [path],
                    evidence: [.init(label: "isReadable", value: .boolean(false))],
                    expected: "A readable regular image file inside the selected root.",
                    suggestedAction: "Replace or re-export the image file.",
                    origin: .engine,
                    engineVersion: "0.1.0"
                ),
            ]
        )
    }

    private static func insufficientStagingCapacityOutcome(path: RelativePath) -> InspectionOutcome<ImageProperties> {
        InspectionOutcome(
            status: .failed,
            value: ImageProperties(isReadable: false),
            findings: [
                Finding(
                    ruleID: "inspection.image-staging-capacity",
                    severity: .error,
                    title: "Not enough temporary-disk space",
                    explanation: "The image file was not inspected because the resolved macOS temporary volume could not preserve the required free-space reserve.",
                    affectedPaths: [path],
                    evidence: [
                        .init(label: "isReadable", value: .boolean(false)),
                        .init(
                            label: "minimumReserveBytes",
                            value: .integer(Int(TrustedFileAccess.minimumStagingReserveByteCount))
                        ),
                    ],
                    expected: "Enough temporary-disk space to stage the image file while preserving the documented reserve.",
                    suggestedAction: "Free local disk space, then run the preflight again. The image file does not need to be replaced based on this finding alone.",
                    origin: .engine,
                    engineVersion: "0.1.0"
                ),
            ]
        )
    }

    private enum ImageInspectionError: Error {
        case invalidDimensions
        case pixelCountOverflow
        case pixelLimitExceeded
    }
}
