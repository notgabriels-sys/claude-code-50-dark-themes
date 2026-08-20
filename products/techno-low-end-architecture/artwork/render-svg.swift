import AppKit
import Foundation

guard CommandLine.arguments.count == 5 else {
    fputs("Usage: render-svg.swift <source.svg> <destination.png> <width> <height>\n", stderr)
    exit(64)
}

let source = CommandLine.arguments[1]
let destination = CommandLine.arguments[2]
guard
    let width = Int(CommandLine.arguments[3]),
    let height = Int(CommandLine.arguments[4]),
    width > 0,
    height > 0
else {
    fputs("Width and height must be positive integers.\n", stderr)
    exit(64)
}

guard let image = NSImage(contentsOfFile: source) else {
    fputs("AppKit could not read the SVG at \(source).\n", stderr)
    exit(65)
}
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fputs("Could not allocate the destination bitmap.\n", stderr)
    exit(70)
}
guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fputs("Could not create a graphics context.\n", stderr)
    exit(70)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()
image.draw(
    in: NSRect(x: 0, y: 0, width: width, height: height),
    from: NSRect(origin: .zero, size: image.size),
    operation: .copy,
    fraction: 1,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode the rendered bitmap as PNG.\n", stderr)
    exit(70)
}

do {
    try png.write(to: URL(fileURLWithPath: destination), options: .atomic)
} catch {
    fputs("Could not write \(destination): \(error)\n", stderr)
    exit(74)
}
