import AppKit
import Foundation

struct LaunchCard {
    let fileName: String
    let eyebrow: String
    let title: String
    let bullets: [String]
    let footer: String
    let accent: NSColor
}

let outputDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("assets/product-hunt", isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let cards: [LaunchCard] = [
    LaunchCard(
        fileName: "audio-preflight-01-check-the-bounce.png",
        eyebrow: "AUDIO DELIVERY PREFLIGHT CLI",
        title: "Check the bounce\nbefore it leaves.",
        bullets: [
            "Local, read-only WAV handoff checks",
            "No upload, renaming or mastering claims",
            "Built for producers, engineers and labels"
        ],
        footer: "gabs-utilities.com/audio-delivery-preflight-cli.html",
        accent: NSColor(calibratedRed: 0.58, green: 0.96, blue: 0.81, alpha: 1)
    ),
    LaunchCard(
        fileName: "audio-preflight-02-free-checklist.png",
        eyebrow: "FREE TRUST-BUILDER",
        title: "Start with the\nfree checklist.",
        bullets: [
            "Confirm the brief before exporting",
            "Catch ambiguous versions early",
            "Keep human listening central"
        ],
        footer: "Free: gabs-utilities.com/audio-delivery-checklist.html",
        accent: NSColor(calibratedRed: 0.62, green: 0.71, blue: 1.0, alpha: 1)
    ),
    LaunchCard(
        fileName: "audio-preflight-03-local-reports.png",
        eyebrow: "PAID CLI / EUR 19",
        title: "Automate the boring\ndelivery checks.",
        bullets: [
            "Technical file evidence",
            "Package and filename hygiene",
            "HTML/JSON reports + checksums"
        ],
        footer: "One-time Gumroad purchase. macOS + Linux builds.",
        accent: NSColor(calibratedRed: 1.0, green: 0.85, blue: 0.60, alpha: 1)
    ),
    LaunchCard(
        fileName: "audio-preflight-04-what-it-is-not.png",
        eyebrow: "COMMUNITY-SAFE POSITIONING",
        title: "Not mastering.\nNot magic.",
        bullets: [
            "Does not judge the music",
            "Does not replace listening",
            "Does not guarantee acceptance"
        ],
        footer: "A technical preflight layer before the human call.",
        accent: NSColor(calibratedRed: 1.0, green: 0.61, blue: 0.61, alpha: 1)
    )
]

let size = NSSize(width: 1270, height: 760)

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: red, green: green, blue: blue, alpha: alpha)
}

func paragraphStyle(lineHeight: CGFloat, alignment: NSTextAlignment = .left) -> NSMutableParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.minimumLineHeight = lineHeight
    style.maximumLineHeight = lineHeight
    style.alignment = alignment
    return style
}

func drawText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor, lineHeight: CGFloat, kern: CGFloat = 0, alignment: NSTextAlignment = .left) {
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraphStyle(lineHeight: lineHeight, alignment: alignment),
        .kern: kern
    ]
    NSString(string: text).draw(in: rect, withAttributes: attributes)
}

func drawRoundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, width: CGFloat = 1) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = width
        path.stroke()
    }
}

func drawSignalField(accent: NSColor) {
    let heights: [CGFloat] = [34, 74, 42, 118, 58, 140, 48, 92, 160, 68, 122, 52, 134, 76, 110, 40]
    for index in 0..<38 {
        let x = 730 + CGFloat(index) * 12
        let height = heights[index % heights.count]
        let y = 406 - height / 2
        let alpha = 0.18 + CGFloat(index % 6) * 0.055
        drawRoundedRect(NSRect(x: x, y: y, width: 5, height: height), radius: 2.5, fill: accent.withAlphaComponent(alpha))
    }

    accent.withAlphaComponent(0.45).setStroke()
    let line = NSBezierPath()
    line.lineWidth = 2
    line.move(to: NSPoint(x: 720, y: 406))
    for index in 0...420 {
        let x = 720 + CGFloat(index)
        let y = 406 + sin(CGFloat(index) / 17) * 26 + sin(CGFloat(index) / 43) * 18
        line.line(to: NSPoint(x: x, y: y))
    }
    line.stroke()
}

for card in cards {
    let image = NSImage(size: size)
    image.lockFocus()

    color(0.035, 0.039, 0.051).setFill()
    NSRect(origin: .zero, size: size).fill()

    let gradient = NSGradient(colors: [
        card.accent.withAlphaComponent(0.17),
        color(0.035, 0.039, 0.051, 0.0)
    ])
    gradient?.draw(in: NSRect(x: -40, y: 320, width: 650, height: 520), angle: -35)

    drawRoundedRect(
        NSRect(x: 48, y: 48, width: 1174, height: 664),
        radius: 38,
        fill: color(0.065, 0.078, 0.105, 0.88),
        stroke: color(0.19, 0.22, 0.27),
        width: 1.2
    )
    drawRoundedRect(
        NSRect(x: 694, y: 146, width: 460, height: 382),
        radius: 28,
        fill: color(0.027, 0.031, 0.043, 0.86),
        stroke: color(0.18, 0.21, 0.27),
        width: 1
    )
    drawSignalField(accent: card.accent)

    drawRoundedRect(
        NSRect(x: 92, y: 632, width: 316, height: 36),
        radius: 18,
        fill: card.accent.withAlphaComponent(0.12),
        stroke: card.accent.withAlphaComponent(0.35),
        width: 1
    )
    drawText(
        card.eyebrow,
        in: NSRect(x: 112, y: 640, width: 520, height: 22),
        font: NSFont.monospacedSystemFont(ofSize: 13, weight: .semibold),
        color: card.accent,
        lineHeight: 17,
        kern: 1.7
    )

    drawText(
        card.title,
        in: NSRect(x: 92, y: 386, width: 610, height: 210),
        font: NSFont.systemFont(ofSize: 76, weight: .heavy),
        color: color(0.95, 0.96, 0.98),
        lineHeight: 78,
        kern: -2.8
    )

    for (index, bullet) in card.bullets.enumerated() {
        let y = 278 - CGFloat(index) * 52
        drawRoundedRect(
            NSRect(x: 96, y: y + 6, width: 28, height: 28),
            radius: 14,
            fill: card.accent.withAlphaComponent(0.17),
            stroke: card.accent.withAlphaComponent(0.45),
            width: 1
        )
        drawText(
            "✓",
            in: NSRect(x: 103, y: y + 7, width: 18, height: 18),
            font: NSFont.systemFont(ofSize: 16, weight: .bold),
            color: card.accent,
            lineHeight: 18,
            alignment: .center
        )
        drawText(
            bullet,
            in: NSRect(x: 142, y: y - 1, width: 520, height: 46),
            font: NSFont.systemFont(ofSize: 25, weight: .semibold),
            color: color(0.86, 0.89, 0.94),
            lineHeight: 31
        )
    }

    drawRoundedRect(
        NSRect(x: 92, y: 88, width: 640, height: 46),
        radius: 23,
        fill: color(1, 1, 1, 0.045),
        stroke: color(1, 1, 1, 0.10),
        width: 1
    )
    drawText(
        card.footer,
        in: NSRect(x: 114, y: 100, width: 610, height: 22),
        font: NSFont.monospacedSystemFont(ofSize: 16, weight: .medium),
        color: color(0.72, 0.76, 0.82),
        lineHeight: 20
    )

    drawText(
        "GABS UTILITIES",
        in: NSRect(x: 884, y: 98, width: 260, height: 28),
        font: NSFont.monospacedSystemFont(ofSize: 16, weight: .semibold),
        color: color(0.72, 0.76, 0.82),
        lineHeight: 22,
        kern: 2,
        alignment: .right
    )

    image.unlockFocus()

    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let data = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "render", code: 1)
    }
    try data.write(to: outputDirectory.appendingPathComponent(card.fileName))
}

print("Rendered \(cards.count) launch gallery images to \(outputDirectory.path)")
