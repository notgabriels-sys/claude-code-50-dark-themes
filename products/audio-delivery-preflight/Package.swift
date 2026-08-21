// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AudioDeliveryPreflight",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "PreflightCore", targets: ["PreflightCore"]),
        .executable(name: "audio-preflight", targets: ["AudioPreflightCLI"]),
        .executable(name: "AudioDeliveryPreflightApp", targets: ["AudioDeliveryPreflightApp"]),
    ],
    targets: [
        .target(
            name: "PreflightCore",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .executableTarget(
            name: "AudioPreflightCLI",
            dependencies: ["PreflightCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .executableTarget(
            name: "AudioDeliveryPreflightApp",
            dependencies: ["PreflightCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "PreflightCoreTests",
            dependencies: ["PreflightCore", "AudioPreflightCLI"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "ReportSnapshotTests",
            dependencies: ["PreflightCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
