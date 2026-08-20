import Foundation

public enum BuiltInPresets {
    public static let generalAudio = Preset(
        identifier: "general-audio",
        name: "General Audio",
        filename: versionFilenameRequirement
    )

    public static let stereoPremaster = Preset(
        identifier: "stereo-premaster",
        name: "Stereo Premaster",
        filename: versionFilenameRequirement,
        roles: [
            DeliveryRole(
                identifier: "stereo-premaster",
                name: "readable lossless stereo premaster",
                pattern: "(?i)(^|/).+\\.(aif|aiff|flac|wav)$",
                required: true,
                category: .audio,
                allowedExtensions: losslessExtensions,
                channelCount: NumericConstraint(exactly: 2),
                readability: .error,
                severity: .error,
                ambiguitySeverity: .warning
            ),
        ]
    )

    public static let digitalRelease = Preset(
        identifier: "digital-release",
        name: "Digital Release",
        filename: versionFilenameRequirement,
        roles: [
            DeliveryRole(
                identifier: "main-master",
                name: "lossless main master",
                pattern: "(?i)(^|/).*(main[ _-]*master|premaster|master).*\\.(aif|aiff|flac|wav)$",
                required: true,
                category: .audio,
                allowedExtensions: losslessExtensions,
                readability: .error,
                severity: .error,
                ambiguitySeverity: .warning
            ),
            DeliveryRole(
                identifier: "artwork",
                name: "artwork",
                pattern: "(?i)(^|/).+\\.(heic|jpe?g|png|tiff?|webp)$",
                required: true,
                category: .artwork,
                readability: .error,
                severity: .error,
                ambiguitySeverity: .warning
            ),
            DeliveryRole(
                identifier: "metadata-or-credits",
                name: "metadata or credits document",
                pattern: "(?i)(^|/).*(metadata|credits).*\\.(csv|doc|docx|pdf|rtf|txt)$",
                required: true,
                category: .document,
                readability: .warning,
                severity: .error,
                ambiguitySeverity: .warning
            ),
        ]
    )

    public static let all = [generalAudio, stereoPremaster, digitalRelease]

    private static let losslessExtensions = ["aif", "aiff", "flac", "wav"]
    private static let versionFilenameRequirement = FilenameRequirement(
        ambiguousVersionPattern: "(?i)(?:^|[ _.-])(final|master|version|v)\\s*\\d+",
        ambiguousVersionSeverity: .warning
    )
}
