import Foundation

/// Produces a portable SHA-256 manifest for regular delivery files with known checksums.
public struct ChecksumManifestWriter: Sendable {
    public init() {}

    public func text(for result: ScanResult) throws(PreflightError) -> String {
        let eligibleEntries = result.inventory
            .filter(Self.isEligibleEntry)
            .sorted { $0.relativePath.value.unicodeScalars.lexicographicallyPrecedes($1.relativePath.value.unicodeScalars) }

        var lines: [String] = []
        lines.reserveCapacity(eligibleEntries.count)
        for entry in eligibleEntries {
            guard let checksum = entry.sha256,
                  checksum.range(of: "^[0-9A-Fa-f]{64}$", options: .regularExpression) != nil
            else {
                throw .exportFailed(reason: "A successful checksum entry is missing a valid SHA-256 digest.")
            }
            guard Self.isRepresentableManifestPath(entry.relativePath.value) else {
                throw .exportFailed(reason: "A successful checksum entry has a path that cannot be represented safely in the manifest.")
            }
            lines.append("\(checksum.lowercased())  \(entry.relativePath.value)")
        }

        return lines
            .joined(separator: "\n")
            .appendingManifestTerminator
    }

    private static func isEligibleEntry(_ entry: InventoryEntry) -> Bool {
        guard entry.kind == .regular, entry.category != .serviceFile else { return false }
        return entry.checksumStatus == .succeeded
    }

    private static func isRepresentableManifestPath(_ path: String) -> Bool {
        path.unicodeScalars.allSatisfy { scalar in
            !((0x00...0x1F).contains(scalar.value)
                || scalar.value == 0x7F
                || (0x80...0x9F).contains(scalar.value))
        }
    }
}

private extension String {
    var appendingManifestTerminator: String {
        isEmpty ? "" : self + "\n"
    }
}
