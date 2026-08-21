import Foundation

/// Produces a portable SHA-256 manifest for regular delivery files with known checksums.
public struct ChecksumManifestWriter: Sendable {
    public init() {}

    public func text(for result: ScanResult) -> String {
        result.inventory
            .filter(Self.isEligible)
            .sorted { $0.relativePath.value.unicodeScalars.lexicographicallyPrecedes($1.relativePath.value.unicodeScalars) }
            .compactMap { entry in
                guard let checksum = entry.sha256 else { return nil }
                return "\(checksum.lowercased())  \(entry.relativePath.value)"
            }
            .joined(separator: "\n")
            .appendingManifestTerminator
    }

    private static func isEligible(_ entry: InventoryEntry) -> Bool {
        guard entry.kind == .regular, entry.category != .serviceFile else { return false }
        guard entry.checksumStatus == .succeeded else { return false }
        guard let checksum = entry.sha256, checksum.range(of: "^[0-9A-Fa-f]{64}$", options: .regularExpression) != nil else { return false }
        let path = entry.relativePath.value
        return !path.contains("\n") && !path.contains("\r")
    }
}

private extension String {
    var appendingManifestTerminator: String {
        isEmpty ? "" : self + "\n"
    }
}
