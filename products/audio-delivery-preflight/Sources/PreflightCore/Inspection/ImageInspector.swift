import CoreGraphics
import Foundation
import ImageIO

public protocol ImageInspecting: Sendable {
    func inspect(source: TrustedMediaSource) -> InspectionOutcome<ImageProperties>
}

public struct ImageInspector: ImageInspecting {
    private let stagingDirectory: URL
    private let onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook?
    private let onAfterCopyingChunk: TrustedFileAccess.CopyProgressHook?

    public init() {
        self.stagingDirectory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        self.onBeforeOpeningPathComponent = nil
        self.onAfterCopyingChunk = nil
    }

    init(onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook?) {
        self.stagingDirectory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
        self.onAfterCopyingChunk = nil
    }

    init(
        stagingDirectory: URL,
        onBeforeOpeningPathComponent: TrustedFileAccess.OpenPathComponentHook? = nil,
        onAfterCopyingChunk: TrustedFileAccess.CopyProgressHook? = nil
    ) {
        self.stagingDirectory = stagingDirectory
        self.onBeforeOpeningPathComponent = onBeforeOpeningPathComponent
        self.onAfterCopyingChunk = onAfterCopyingChunk
    }

    public func inspect(source: TrustedMediaSource) -> InspectionOutcome<ImageProperties> {
        let snapshot: TrustedFileSnapshot
        do {
            snapshot = try TrustedFileAccess.stageRegularFile(
                source: source,
                in: stagingDirectory,
                onBeforeOpeningPathComponent: onBeforeOpeningPathComponent,
                onAfterCopyingChunk: onAfterCopyingChunk
            )
        } catch {
            return Self.unreadableOutcome()
        }
        defer { try? FileManager.default.removeItem(at: snapshot.stagingURL) }

        guard let imageSource = CGImageSourceCreateWithURL(snapshot.stagingURL as CFURL, nil),
              let sourceType = CGImageSourceGetType(imageSource),
              let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any]
        else {
            return Self.unreadableOutcome()
        }

        let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue
        let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue
        let aspectRatio = width.flatMap { width in
            height.flatMap { height in height > 0 ? Double(width) / Double(height) : nil }
        }
        let hasAlpha = (properties[kCGImagePropertyHasAlpha] as? NSNumber)?.boolValue
            ?? CGImageSourceCreateImageAtIndex(imageSource, 0, nil).flatMap(Self.hasAlpha(in:))

        return InspectionOutcome(
            status: .succeeded,
            value: ImageProperties(
                pixelWidth: width,
                pixelHeight: height,
                aspectRatio: aspectRatio,
                format: sourceType as String,
                colorModel: properties[kCGImagePropertyColorModel] as? String,
                hasAlpha: hasAlpha,
                byteSize: snapshot.byteSize,
                isReadable: true
            ),
            findings: []
        )
    }

    private static func hasAlpha(in image: CGImage) -> Bool? {
        switch image.alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast:
            false
        case .alphaOnly, .first, .last, .premultipliedFirst, .premultipliedLast:
            true
        @unknown default:
            nil
        }
    }

    private static func unreadableOutcome() -> InspectionOutcome<ImageProperties> {
        InspectionOutcome(
            status: .failed,
            value: ImageProperties(isReadable: false),
            findings: [
                Finding(
                    ruleID: "image.unreadable",
                    severity: .error,
                    title: "Image file could not be read",
                    explanation: "The selected image file could not be read safely.",
                    affectedPaths: [],
                    evidence: [.init(label: "isReadable", value: .boolean(false))],
                    expected: "A readable regular image file inside the selected root.",
                    suggestedAction: "Replace or re-export the image file.",
                    origin: .engine,
                    engineVersion: "0.1.0"
                ),
            ]
        )
    }
}
