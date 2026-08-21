import Foundation

/// A deliberately conservative identity for names that may cross macOS
/// filesystems. False positives are safer than missing a portability collision.
public enum PortablePathIdentity {
    public static func key(_ value: String) -> String {
        value
            .precomposedStringWithCanonicalMapping
            .folding(
                options: [.caseInsensitive, .widthInsensitive, .diacriticInsensitive],
                locale: Locale(identifier: "en_US_POSIX")
            )
            .precomposedStringWithCanonicalMapping
    }
}
