import Foundation

public enum InventoryLimitResource: String, Sendable, Codable, Equatable {
    case totalEntries
    case depth
    case namesPerDirectory
    case relativePathBytes
    case aggregateRelativePathBytes
}

public enum PreflightError: Error, Sendable, Codable, Equatable {
    case invalidScanRequest(reason: String)
    case invalidPreset(field: String, reason: String)
    case invalidRelativePath(reason: String)
    case inventoryLimitExceeded(resource: InventoryLimitResource, limit: Int)
    case inventoryFailed(relativePath: RelativePath, reason: String)
    case inspectionFailed(relativePath: RelativePath, reason: String)
    case exportFailed(reason: String)
    case cancelled

    private enum CodingKeys: String, CodingKey {
        case type
        case field
        case relativePath
        case path
        case resource
        case limit
        case reason
    }

    private enum Kind: String, Codable {
        case invalidScanRequest
        case invalidPreset
        case invalidRelativePath
        case inventoryLimitExceeded
        case inventoryFailed
        case inspectionFailed
        case exportFailed
        case cancelled
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .type) {
        case .invalidScanRequest:
            self = .invalidScanRequest(reason: try container.decode(String.self, forKey: .reason))
        case .invalidPreset:
            self = .invalidPreset(
                field: try container.decode(String.self, forKey: .field),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case .invalidRelativePath:
            self = .invalidRelativePath(reason: try container.decode(String.self, forKey: .reason))
        case .inventoryLimitExceeded:
            self = .inventoryLimitExceeded(
                resource: try container.decode(InventoryLimitResource.self, forKey: .resource),
                limit: try container.decode(Int.self, forKey: .limit)
            )
        case .inventoryFailed:
            self = .inventoryFailed(
                relativePath: try Self.decodeRelativePath(from: container),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case .inspectionFailed:
            self = .inspectionFailed(
                relativePath: try Self.decodeRelativePath(from: container),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case .exportFailed:
            self = .exportFailed(reason: try container.decode(String.self, forKey: .reason))
        case .cancelled:
            self = .cancelled
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .invalidScanRequest(let reason):
            try container.encode(Kind.invalidScanRequest, forKey: .type)
            try container.encode(reason, forKey: .reason)
        case .invalidPreset(let field, let reason):
            try container.encode(Kind.invalidPreset, forKey: .type)
            try container.encode(field, forKey: .field)
            try container.encode(reason, forKey: .reason)
        case .invalidRelativePath(let reason):
            try container.encode(Kind.invalidRelativePath, forKey: .type)
            try container.encode(reason, forKey: .reason)
        case .inventoryLimitExceeded(let resource, let limit):
            try container.encode(Kind.inventoryLimitExceeded, forKey: .type)
            try container.encode(resource, forKey: .resource)
            try container.encode(limit, forKey: .limit)
        case .inventoryFailed(let relativePath, let reason):
            try container.encode(Kind.inventoryFailed, forKey: .type)
            try container.encode(relativePath, forKey: .relativePath)
            try container.encode(reason, forKey: .reason)
        case .inspectionFailed(let relativePath, let reason):
            try container.encode(Kind.inspectionFailed, forKey: .type)
            try container.encode(relativePath, forKey: .relativePath)
            try container.encode(reason, forKey: .reason)
        case .exportFailed(let reason):
            try container.encode(Kind.exportFailed, forKey: .type)
            try container.encode(reason, forKey: .reason)
        case .cancelled:
            try container.encode(Kind.cancelled, forKey: .type)
        }
    }

    private static func decodeRelativePath(
        from container: KeyedDecodingContainer<CodingKeys>
    ) throws -> RelativePath {
        if container.contains(.relativePath) {
            return try container.decode(RelativePath.self, forKey: .relativePath)
        }

        return try RelativePath(container.decode(String.self, forKey: .path))
    }
}
