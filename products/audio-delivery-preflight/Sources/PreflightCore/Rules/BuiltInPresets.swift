import Foundation

public enum BuiltInPresets {
    public static let generalAudio = Preset(
        identifier: "general-audio",
        name: "General Audio",
        audio: AudioRequirement(
            requireConsistentSampleRate: true,
            requireConsistentBitDepth: true,
            requireConsistentChannelCount: true,
            severity: .warning
        ),
        filename: FilenameRequirement(
            ambiguousVersionPattern: "(?i)(?:^|[ _.-])(final|master|version|v)\\s*\\d+",
            ambiguousVersionSeverity: .warning
        ),
        serviceFileSeverity: .information,
        symbolicLinkSeverity: .warning,
        exactDuplicateSeverity: .warning
    )

    public static let stereoPremaster = Preset(
        identifier: "stereo-premaster",
        name: "Stereo Premaster",
        audio: AudioRequirement(
            requireConsistentSampleRate: true,
            requireConsistentBitDepth: true,
            requireConsistentChannelCount: true,
            severity: .warning
        ),
        filename: FilenameRequirement(
            ambiguousVersionPattern: "(?i)(?:^|[ _.-])(final|master|version|v)\\s*\\d+",
            ambiguousVersionSeverity: .warning
        ),
        roles: [
            DeliveryRole(
                identifier: "stereo-premaster",
                name: "readable lossless stereo premaster",
                pattern: "(?i)(^|/).+\\.(aif|aiff|flac|m4a|wav)$",
                required: true,
                category: .audio,
                allowedExtensions: losslessExtensions,
                allowedEncodings: losslessEncodings,
                channelCount: NumericConstraint(exactly: 2),
                readability: .error,
                severity: .error,
                ambiguitySeverity: .warning
            ),
        ],
        serviceFileSeverity: .information,
        symbolicLinkSeverity: .warning,
        exactDuplicateSeverity: .warning
    )

    public static let digitalRelease = Preset(
        identifier: "digital-release",
        name: "Digital Release",
        audio: AudioRequirement(
            requireConsistentSampleRate: true,
            requireConsistentBitDepth: true,
            requireConsistentChannelCount: true,
            severity: .warning
        ),
        artwork: ArtworkRequirement(
            minimumWidth: 3_000,
            minimumHeight: 3_000,
            requiresSquare: true,
            severity: .error
        ),
        filename: FilenameRequirement(
            ambiguousVersionPattern: "(?i)(?:^|[ _.-])(final|master|version|v)\\s*\\d+",
            ambiguousVersionSeverity: .warning
        ),
        roles: [
            DeliveryRole(
                identifier: "main-master",
                name: "lossless main master",
                pattern: "(?i)(^|/)(?:[^/]*[ _.-])?(?:main[ _.-]*master|premaster|master)(?:[ _.-](?:v(?:ersion)?[ _.-]?\\d+|\\d+|final))?\\.(aif|aiff|flac|m4a|wav)$",
                required: true,
                category: .audio,
                allowedExtensions: losslessExtensions,
                allowedEncodings: losslessEncodings,
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
                pattern: "(?i)(^|/).*(metadata|credits).*\\.(csv|doc|docx|md|pdf|rtf|txt)$",
                required: true,
                category: .document,
                readability: .warning,
                severity: .error,
                ambiguitySeverity: .warning
            ),
        ],
        serviceFileSeverity: .information,
        symbolicLinkSeverity: .warning,
        exactDuplicateSeverity: .warning
    )

    public static let custom = Preset(
        identifier: "custom",
        name: "Custom",
        audio: AudioRequirement(severity: .warning),
        filename: FilenameRequirement(ambiguousVersionSeverity: .warning),
        serviceFileSeverity: .information,
        symbolicLinkSeverity: .warning,
        exactDuplicateSeverity: .warning
    )

    public static let all = [generalAudio, stereoPremaster, digitalRelease, custom]

    private static let losslessExtensions = ["aif", "aiff", "flac", "m4a", "wav"]
    private static let losslessEncodings = ["ALAC", "FLAC", "Linear PCM"]
}
