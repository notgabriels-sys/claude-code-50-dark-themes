import CoreGraphics
import Foundation
import ImageIO

public protocol ImageInspecting: Sendable {
    func inspect(url: URL) -> InspectionOutcome<ImageProperties>
}

public struct ImageInspector: ImageInspecting {
    public init() {}

    public func inspect(url: URL) -> InspectionOutcome<ImageProperties> {
        guard !Self.isSymbolicLink(url) else {
            return Self.unreadableOutcome()
        }

        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let sourceType = CGImageSourceGetType(source),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        else {
            return Self.unreadableOutcome()
        }

        let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue
        let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue
        let aspectRatio = width.flatMap { width in
            height.flatMap { height in height > 0 ? Double(width) / Double(height) : nil }
        }
        let byteSize = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init)
        let hasAlpha = (properties[kCGImagePropertyHasAlpha] as? NSNumber)?.boolValue
            ?? CGImageSourceCreateImageAtIndex(source, 0, nil).flatMap(Self.hasAlpha(in:))

        return InspectionOutcome(
            status: .succeeded,
            value: ImageProperties(
                pixelWidth: width,
                pixelHeight: height,
                aspectRatio: aspectRatio,
                format: sourceType as String,
                colorModel: properties[kCGImagePropertyColorModel] as? String,
                hasAlpha: hasAlpha,
                byteSize: byteSize,
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

    private static func isSymbolicLink(_ url: URL) -> Bool {
        (try? url.standardizedFileURL.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
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
                    explanation: "The file could not be inspected as a readable image.",
                    affectedPaths: [],
                    evidence: [.init(label: "isReadable", value: .boolean(false))],
                    expected: "A readable image file.",
                    suggestedAction: "Replace or re-export the image file.",
                    origin: .engine,
                    engineVersion: "0.1.0"
                ),
            ]
        )
    }
}
